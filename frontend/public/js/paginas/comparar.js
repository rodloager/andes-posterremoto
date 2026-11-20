import { barras } from '../graficas/opciones.js';
import {
  compararDepartamentos,
  departamentosIniciales,
  indicadoresConVariosCortes,
  clasificar,
  participacion,
} from '../nucleo/comparacion.js';
import { cargar } from '../nucleo/datos.js';
import { crear } from '../nucleo/dom.js';
import {
  SIN_DATO,
  formatearCantidad,
  formatearConSigno,
  formatearFecha,
  formatearPorcentaje,
  formatearValor,
} from '../nucleo/formato.js';
import { nombreCorto } from '../nucleo/indicadores.js';
import { figura, grafica, graficas, iniciarPagina, nota, origenDe, seccion } from '../nucleo/pagina.js';
import { crearTabla } from '../nucleo/tabla.js';
import { cargarTerritorio, describirPeriodo, origenTerritorial } from '../nucleo/territorio.js';

const VARIABLE_INICIAL = 'personas';

const porcentajeOSinDato = (valor) => (valor === null ? SIN_DATO : formatearPorcentaje(valor));
const puestoOSinDato = (puesto, total) => (puesto === null ? SIN_DATO : `${puesto} de ${total}`);

function selector(etiqueta, identificador, opciones, valorActual) {
  const lista = crear(
    'select',
    { clase: 'form-select form-select-sm', id: identificador },
    opciones.map(({ valor, nombre }) =>
      crear('option', { value: valor, selected: valor === valorActual, texto: nombre }),
    ),
  );
  return { lista, campo: crear('label', { for: identificador }, etiqueta, lista) };
}

function opcionesDeDepartamentos(territorio) {
  return territorio.departamentos
    .map(({ codigo, nombre }) => ({ valor: codigo, nombre }))
    .sort((uno, otro) => uno.nombre.localeCompare(otro.nombre, 'es'));
}

function nombreDe(territorio, codigo) {
  return territorio.departamentos.find((departamento) => departamento.codigo === codigo)?.nombre ?? codigo;
}

function tablaLadoALado(territorio, codigos, filas) {
  const [primero, segundo] = codigos.map((codigo) => nombreDe(territorio, codigo));
  return crearTabla({
    titulo: `${primero} y ${segundo} frente al total de los reportes municipales`,
    columnas: [
      { nombre: 'Variable' },
      { nombre: primero, numerica: true },
      { nombre: '% del total', numerica: true },
      { nombre: 'Puesto', numerica: true },
      { nombre: segundo, numerica: true },
      { nombre: '% del total', numerica: true },
      { nombre: 'Puesto', numerica: true },
    ],
    filas: filas.map(({ variable, conDato, departamentos }) => [
      variable.nombre,
      ...departamentos.flatMap(({ valor, participacion: parte, puesto }) => [
        formatearCantidad(valor),
        porcentajeOSinDato(parte),
        puestoOSinDato(puesto, conDato),
      ]),
    ]),
  });
}

function graficaLadoALado(territorio, codigos, filas, origen) {
  const conDato = filas.filter(({ departamentos }) => departamentos.some(({ valor }) => valor !== null));
  return grafica({
    pregunta: '¿Qué parte del total nacional reúne cada departamento?',
    descripcion:
      'Cada barra es la participación del departamento en la suma de los reportes municipales de esa variable.',
    ...barras({
      categorias: conDato.map(({ variable }) => variable.nombre),
      series: codigos.map((codigo, posicion) => ({
        nombre: nombreDe(territorio, codigo),
        valores: conDato.map(({ departamentos }) => departamentos[posicion].participacion),
      })),
      unidad: '%',
      encabezado: 'Variable',
    }),
    origen,
    anchoCompleto: true,
  });
}

function graficaDeRanking(territorio, variable, origen) {
  const { ordenados, puestos } = clasificar(territorio.departamentos, variable.codigo);
  const nacional = territorio.nacional[variable.codigo];
  return [
    grafica({
      pregunta: `¿Qué departamentos reportan más ${variable.nombre.toLowerCase()}?`,
      descripcion: `${ordenados.length} departamentos tienen un valor mayor que cero en esta variable.`,
      ...barras({
        categorias: ordenados.map(({ nombre }) => nombre),
        series: [
          { nombre: variable.nombre, valores: ordenados.map(({ valores }) => valores[variable.codigo]) },
        ],
        unidad: variable.unidad,
        encabezado: 'Departamento',
      }),
      origen,
    }),
    figura(
      { pregunta: 'Puesto y participación de cada departamento', origen },
      crearTabla({
        titulo: `Ranking de departamentos por ${variable.nombre.toLowerCase()}`,
        columnas: [
          { nombre: 'Puesto', numerica: true },
          { nombre: 'Departamento' },
          { nombre: variable.nombre, numerica: true },
          { nombre: '% del total', numerica: true },
        ],
        filas: ordenados.map(({ codigo, nombre, valores }) => [
          String(puestos.get(codigo)),
          nombre,
          formatearValor(valores[variable.codigo], variable.unidad).texto,
          porcentajeOSinDato(participacion(valores[variable.codigo], nacional)),
        ]),
      }),
    ),
  ];
}

function seccionLadoALado(territorio, origen) {
  const solicitados = new URLSearchParams(window.location.search).getAll('departamento');
  const estado = { codigos: departamentosIniciales(territorio, solicitados, VARIABLE_INICIAL) };
  const opciones = opcionesDeDepartamentos(territorio);
  const selectores = estado.codigos.map((codigo, posicion) =>
    selector(`Departamento ${posicion + 1}`, `comparar-departamento-${posicion + 1}`, opciones, codigo),
  );
  const contenido = crear('div', { 'aria-live': 'polite' });

  function mostrar() {
    const filas = compararDepartamentos(territorio, estado.codigos);
    contenido.replaceChildren(
      graficas(
        graficaLadoALado(territorio, estado.codigos, filas, origen),
        figura(
          { pregunta: 'Valores, participación y puesto en cada variable', origen, anchoCompleto: true },
          tablaLadoALado(territorio, estado.codigos, filas),
        ),
      ),
    );
    const parametros = new URLSearchParams(estado.codigos.map((codigo) => ['departamento', codigo]));
    window.history.replaceState(null, '', `?${parametros}`);
  }

  selectores.forEach(({ lista }, posicion) => {
    lista.addEventListener('change', () => {
      estado.codigos[posicion] = lista.value;
      mostrar();
    });
  });
  mostrar();

  return seccion(
    {
      titulo: 'Dos departamentos lado a lado',
      descripcion:
        'Elige dos departamentos. El puesto compara solo los departamentos que reportan un valor mayor que cero.',
    },
    crear(
      'div',
      { clase: 'controles' },
      selectores.map(({ campo }) => campo),
    ),
    contenido,
  );
}

function seccionDeRanking(territorio, origen) {
  const variables = selector(
    'Variable',
    'comparar-variable',
    territorio.variables.map(({ codigo, nombre }) => ({ valor: codigo, nombre })),
    VARIABLE_INICIAL,
  );
  const contenido = crear('div', { 'aria-live': 'polite' });

  function mostrar() {
    const variable = territorio.variables.find(({ codigo }) => codigo === variables.lista.value);
    contenido.replaceChildren(graficas(...graficaDeRanking(territorio, variable, origen)));
  }

  variables.lista.addEventListener('change', mostrar);
  mostrar();

  return seccion(
    { titulo: 'Ranking de departamentos', descripcion: describirPeriodo(territorio.meta) },
    crear('div', { clase: 'controles' }, variables.campo),
    contenido,
  );
}

function describirFuentes(contexto, ...puntos) {
  const nombres = puntos.map(({ fuente: id }) => {
    const fuente = contexto.fuente(id);
    return fuente ? nombreCorto(fuente) : id;
  });
  return [...new Set(nombres)].join(' y ');
}

function seccionDeCortes(contexto, catalogo) {
  const comparaciones = indicadoresConVariosCortes(catalogo.indicadores);
  const [referencia] = comparaciones;
  const filas = comparaciones.map(({ indicador, primero, ultimo, absoluta, relativa, dias }) => [
    indicador.nombre,
    `${formatearValor(primero.valor, indicador.unidad).texto} (${formatearFecha(primero.fechaCorte)})`,
    `${formatearValor(ultimo.valor, indicador.unidad).texto} (${formatearFecha(ultimo.fechaCorte)})`,
    formatearConSigno(absoluta, indicador.unidad),
    relativa === null ? SIN_DATO : `${relativa >= 0 ? '+' : '−'}${formatearPorcentaje(Math.abs(relativa))}`,
    `${dias} días`,
    describirFuentes(contexto, primero, ultimo),
  ]);
  return seccion(
    {
      titulo: 'Balances nacionales entre cortes',
      descripcion:
        'Los indicadores que tienen al menos dos cortes publicados. El cambio compara el primer corte con el último.',
    },
    comparaciones.length === 0
      ? nota('Ningún indicador tiene todavía dos cortes publicados.')
      : graficas(
          figura(
            {
              pregunta: '¿Cuánto cambiaron las cifras entre el primer balance y el último?',
              origen: origenDe(contexto.fuente(referencia.ultimo.fuente), referencia.ultimo.fechaCorte),
              anchoCompleto: true,
            },
            crearTabla({
              titulo: 'Primer y último corte de cada indicador nacional',
              columnas: [
                { nombre: 'Indicador' },
                { nombre: 'Primer corte', numerica: true },
                { nombre: 'Último corte', numerica: true },
                { nombre: 'Cambio', numerica: true },
                { nombre: 'Cambio relativo', numerica: true },
                { nombre: 'Tiempo entre cortes', numerica: true },
                { nombre: 'Fuentes' },
              ],
              filas,
            }),
          ),
        ),
    nota(
      'Un aumento entre cortes no significa que la situación empeoró: los balances suman reportes que llegan tarde. Una baja puede ser una revisión de la entidad.',
    ),
  );
}

iniciarPagina(async (contexto) => {
  const [territorio, catalogo] = await Promise.all([cargarTerritorio(), cargar('oficial/indicadores')]);
  const origen = origenTerritorial(contexto.fuente('dane-afectaciones'), territorio.meta);
  return [
    seccionLadoALado(territorio, origen),
    seccionDeRanking(territorio, origen),
    seccionDeCortes(contexto, catalogo),
  ];
});
