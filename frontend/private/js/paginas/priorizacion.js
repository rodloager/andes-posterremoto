import { crearGrafica } from '/js/componentes/grafica.js';
import { barras } from '/js/graficas/opciones.js';
import { crear } from '/js/nucleo/dom.js';
import { formatearDecimal, formatearNumero, formatearPorcentaje } from '/js/nucleo/formato.js';
import { nota, seccion } from '/js/nucleo/secciones.js';
import { crearTabla } from '/js/nucleo/tabla.js';
import { conParametros, describirError, pedir } from '../api.js';
import { iniciarPaginaPrivada } from '../pagina-privada.js';
import { ESCALA_DE_PESOS, describirCambio, pesosConfigurados, repartir, textoDePesos } from '../pesos.js';

const RUTA = '/admin/priorizacion';
const ESPERA_MS = 300;
const ESCALA = ESCALA_DE_PESOS;
const TAMANOS = Object.freeze([10, 20, 50]);
const MOTIVO_SIN_TASAS =
  'No disponible: ANDES no tiene la población de cada municipio, así que no puede convertir los conteos en tasas por habitante.';

function controlDePeso(criterio, valor, alCambiar) {
  const identificador = `peso-${criterio.codigo}`;
  const reparto = crear('output', { clase: 'peso-reparto cifra', for: identificador });
  const deslizador = crear('input', {
    type: 'range',
    id: identificador,
    min: '0',
    max: String(ESCALA),
    step: '5',
    value: String(valor),
    disabled: !criterio.incluido,
    'aria-describedby': `${identificador}-ayuda`,
  });
  deslizador.addEventListener('input', () => alCambiar(criterio.codigo, Number(deslizador.value)));
  const ayuda = criterio.incluido
    ? `${criterio.descripcion} Origen: ${criterio.origen === 'SIMULADO' ? 'datos simulados' : 'cifras oficiales'}.`
    : criterio.motivo;
  return {
    elemento: crear(
      'div',
      { clase: criterio.incluido ? 'peso' : 'peso peso--excluido' },
      crear('label', { for: identificador, texto: criterio.nombre }),
      deslizador,
      reparto,
      crear('p', { clase: 'peso-ayuda', id: `${identificador}-ayuda`, texto: ayuda }),
    ),
    deslizador,
    reparto,
  };
}

function graficaDeAportes(respuesta) {
  const incluidos = respuesta.criterios.filter(({ incluido }) => incluido);
  const usaSimulados = incluidos.some(({ origen, peso }) => origen === 'SIMULADO' && peso > 0);
  return crearGrafica({
    pregunta: '¿Qué criterio explica el puntaje de cada zona?',
    descripcion:
      'Cada barra suma el aporte de los criterios al puntaje, en puntos de 0 a 100. Un criterio sin dato en la zona no aporta.',
    ...barras({
      categorias: respuesta.zonas.map(({ nombre }) => nombre),
      series: incluidos.map(({ codigo, nombre }) => ({
        nombre,
        valores: respuesta.zonas.map(
          ({ aportes }) => (aportes.find(({ criterio }) => criterio === codigo)?.aporte ?? 0) * ESCALA,
        ),
      })),
      apiladas: true,
      encabezado: 'Zona',
    }),
    alto: true,
    origen: usaSimulados
      ? { tipo: 'SIMULADO', nivel: 'S', texto: `${respuesta.aviso} Usa datos simulados.` }
      : { tipo: 'OFICIAL', nivel: 'C', texto: `${respuesta.aviso} Usa solo cifras oficiales.` },
  });
}

function tablaDeZonas(respuesta) {
  return crearTabla({
    titulo: 'Zonas ordenadas por puntaje',
    columnas: [
      { nombre: 'Puesto', numerica: true },
      { nombre: 'Municipio' },
      { nombre: 'Departamento' },
      { nombre: 'Puntaje', numerica: true },
      { nombre: 'Puesto con los pesos configurados', numerica: true },
      { nombre: 'Cambio' },
    ],
    filas: respuesta.zonas.map(({ posicion, nombre, departamento, puntaje, posicionBase, cambio }) => [
      formatearNumero(posicion),
      nombre,
      departamento.nombre,
      formatearDecimal(puntaje * ESCALA),
      formatearNumero(posicionBase),
      crear('span', {
        clase: cambio > 0 ? 'cambio cambio--sube' : cambio < 0 ? 'cambio cambio--baja' : 'cambio',
        texto: describirCambio(cambio),
      }),
    ]),
  });
}

function listaDeSalientes(salientes) {
  if (salientes.length === 0) {
    return null;
  }
  return crearTabla({
    titulo: 'Zonas que salen del grupo prioritario con estos pesos',
    columnas: [
      { nombre: 'Municipio' },
      { nombre: 'Departamento' },
      { nombre: 'Puesto con los pesos configurados', numerica: true },
      { nombre: 'Puesto nuevo', numerica: true },
    ],
    filas: salientes.map(({ nombre, departamento, posicionBase, posicion }) => [
      nombre,
      departamento.nombre,
      formatearNumero(posicionBase),
      formatearNumero(posicion),
    ]),
  });
}

iniciarPaginaPrivada(async () => {
  const inicial = await pedir(RUTA);
  const configurados = pesosConfigurados(inicial.criterios);
  const estado = { pesos: { ...configurados }, k: inicial.meta.k, solicitud: 0, espera: null };
  const resultados = crear('div', { 'aria-live': 'polite' });
  const mensaje = crear('p', { clase: 'nota', role: 'status' });

  const controles = inicial.criterios.map((criterio) =>
    controlDePeso(criterio, configurados[criterio.codigo] ?? 0, (codigo, valor) => {
      estado.pesos[codigo] = valor;
      mostrarReparto();
      programar();
    }),
  );

  function mostrarReparto() {
    const reparto = repartir(estado.pesos);
    controles.forEach(({ deslizador, reparto: salida }, posicion) => {
      const { codigo, incluido } = inicial.criterios[posicion];
      salida.textContent = incluido ? formatearPorcentaje(reparto[codigo]) : 'Sin datos';
      deslizador.setAttribute('aria-valuetext', salida.textContent);
    });
  }

  function mostrarResultados(respuesta) {
    resultados.replaceChildren(
      crear('div', { clase: 'rejilla-graficas' }, graficaDeAportes(respuesta)),
      tablaDeZonas(respuesta),
      listaDeSalientes(respuesta.salientes),
    );
  }

  async function calcular() {
    const numero = ++estado.solicitud;
    const personalizados = textoDePesos(estado.pesos) !== textoDePesos(configurados);
    const total = Object.values(estado.pesos).reduce((suma, peso) => suma + peso, 0);
    if (total === 0) {
      mensaje.textContent = 'Asigna un peso mayor que cero a al menos un criterio.';
      return;
    }
    mensaje.textContent = 'Calculando…';
    try {
      const respuesta = await pedir(
        conParametros(RUTA, { k: estado.k, pesos: personalizados ? textoDePesos(estado.pesos) : null }),
      );
      if (numero === estado.solicitud) {
        mostrarResultados(respuesta);
        mensaje.textContent = personalizados
          ? 'Resultado con tus pesos. La columna de cambio compara con los pesos configurados.'
          : 'Resultado con los pesos configurados en config/priorizacion.yml.';
      }
    } catch (error) {
      if (numero === estado.solicitud) {
        mensaje.textContent = describirError(error, 'No se pudo calcular la priorización.');
      }
    }
  }

  function programar() {
    clearTimeout(estado.espera);
    estado.espera = setTimeout(calcular, ESPERA_MS);
  }

  const tamano = crear(
    'select',
    { clase: 'form-select form-select-sm', id: 'priorizacion-tamano' },
    TAMANOS.map((valor) =>
      crear('option', { value: String(valor), selected: valor === estado.k, texto: `${valor} zonas` }),
    ),
  );
  tamano.addEventListener('change', () => {
    estado.k = Number(tamano.value);
    calcular();
  });

  const restablecer = crear('button', {
    type: 'button',
    clase: 'btn btn-outline-primary btn-sm',
    texto: 'Volver a los pesos configurados',
  });
  restablecer.addEventListener('click', () => {
    estado.pesos = { ...configurados };
    controles.forEach(({ deslizador }, posicion) => {
      deslizador.value = String(configurados[inicial.criterios[posicion].codigo] ?? 0);
    });
    mostrarReparto();
    calcular();
  });

  const tasas = crear(
    'label',
    { clase: 'opcion-deshabilitada' },
    crear('input', { type: 'checkbox', disabled: true, 'aria-describedby': 'priorizacion-tasas' }),
    ' Calcular con tasas por habitante',
  );

  mostrarReparto();
  mostrarResultados(inicial);
  mensaje.textContent = 'Resultado con los pesos configurados en config/priorizacion.yml.';

  return [
    crear('p', { clase: 'aviso-permanente', role: 'note', texto: inicial.aviso }),
    seccion(
      {
        titulo: 'Pesos de los criterios',
        descripcion:
          'Mueve los controles para cambiar la importancia de cada criterio. El reparto muestra la parte que tendrá cada uno en el puntaje. Los criterios sin datos no se pueden usar.',
      },
      crear(
        'div',
        { clase: 'pesos' },
        controles.map(({ elemento }) => elemento),
      ),
      crear(
        'div',
        { clase: 'filtros' },
        crear('label', { for: 'priorizacion-tamano' }, 'Zonas a mostrar', tamano),
        restablecer,
      ),
      tasas,
      crear('p', { clase: 'peso-ayuda', id: 'priorizacion-tasas', texto: MOTIVO_SIN_TASAS }),
      ...inicial.meta.notas.map((texto) => nota(texto)),
    ),
    seccion(
      {
        titulo: 'Resultado',
        descripcion: `Se evalúan ${formatearNumero(inicial.meta.zonas)} municipios con reporte oficial.`,
      },
      mensaje,
      resultados,
    ),
  ];
});
