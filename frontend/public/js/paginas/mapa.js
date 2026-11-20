import { crearBuscadorDeMunicipios } from '../componentes/buscador.js';
import { ENCUADRE_COMPLETO, ENCUADRE_CON_REPORTE } from '../componentes/mapa.js';
import { crearSello } from '../componentes/sello.js';
import { cargar } from '../nucleo/datos.js';
import { crear, enlaceExterno } from '../nucleo/dom.js';
import { formatearCantidad, formatearFecha, formatearNumero } from '../nucleo/formato.js';
import { nombreCorto } from '../nucleo/indicadores.js';
import { iniciarPagina, nota, seccion } from '../nucleo/pagina.js';
import { crearTabla } from '../nucleo/tabla.js';
import { cargarTerritorio, compararPor, describirPeriodo, valoresPorCodigo } from '../nucleo/territorio.js';

const VARIABLE_INICIAL = 'viviendasDestruidas';
const TODO_EL_PAIS = '';
const SIN_REPORTE = 'Sin reporte';
const OBSERVACIONES = {
  PERSONAS_MENOR_QUE_FAMILIAS: 'La fuente informa menos personas que familias.',
  FECHA_REPORTE_INVALIDA: 'La bitácora de la fuente trae una fecha imposible.',
};

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

function opcionesDeDepartamento(limites, territorio) {
  const conReporte = new Set(territorio.departamentos.map(({ codigo }) => codigo));
  const departamentos = limites.features
    .map(({ properties }) => ({
      valor: properties.codigo,
      nombre: conReporte.has(properties.codigo) ? properties.nombre : `${properties.nombre} (sin reporte)`,
    }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  return [{ valor: TODO_EL_PAIS, nombre: 'Todo el país' }, ...departamentos];
}

function departamentoInicial(limites) {
  const solicitado = new URLSearchParams(window.location.search).get('departamento');
  const existe = limites.features.some(({ properties }) => properties.codigo === solicitado);
  return existe ? solicitado : TODO_EL_PAIS;
}

function municipioInicial(departamento) {
  const solicitado = new URLSearchParams(window.location.search).get('municipio');
  return departamento && /^[0-9]{5}$/.test(solicitado ?? '') && solicitado.startsWith(departamento)
    ? solicitado
    : null;
}

function fechaDeReporte(fecha) {
  return fecha ? formatearFecha(fecha) : 'Sin fecha';
}

function listaDeValores(variables, valores) {
  const presentes = variables.filter(({ codigo }) => valores[codigo] > 0);
  if (presentes.length === 0) {
    return crear('p', { clase: 'mb-0', texto: 'La fuente no trae reporte para este territorio.' });
  }
  return crear(
    'dl',
    {},
    presentes.flatMap(({ codigo, nombre }) => [
      crear('dt', { texto: nombre }),
      crear('dd', { texto: formatearNumero(valores[codigo]) }),
    ]),
  );
}

function crearFicha({ titulo, detalle, variables, valores, observaciones = [] }) {
  const partes = [
    crear(
      'div',
      { clase: 'grafica-cabecera mb-2' },
      crear('h3', { clase: 'grafica-pregunta', texto: titulo }),
      crearSello('OFICIAL', 'A'),
    ),
    detalle ? crear('p', { clase: 'grafica-descripcion mb-2', texto: detalle }) : null,
    listaDeValores(variables, valores),
    observaciones.map((codigo) => crear('p', { clase: 'nota nota--alerta', texto: OBSERVACIONES[codigo] })),
  ];
  return partes.flat().filter(Boolean);
}

function tablaDeDepartamentos(territorio, variable) {
  return crearTabla({
    titulo: `${variable.nombre} por departamento`,
    columnas: [
      { nombre: 'Departamento' },
      { nombre: variable.nombre, numerica: true },
      { nombre: 'Municipios con reporte', numerica: true },
      { nombre: 'Último reporte' },
    ],
    filas: [...territorio.departamentos]
      .sort(compararPor(variable.codigo))
      .map(({ nombre, valores, municipiosConReporte, ultimoReporte }) => [
        nombre,
        formatearCantidad(valores[variable.codigo]),
        formatearNumero(municipiosConReporte),
        fechaDeReporte(ultimoReporte),
      ]),
  });
}

function tablaDeMunicipios(municipios, variable, nombreDepartamento) {
  if (municipios.length === 0) {
    return crear('p', { clase: 'estado-carga', texto: 'La fuente no trae reportes de este departamento.' });
  }
  return crearTabla({
    titulo: `${variable.nombre} por municipio en ${nombreDepartamento}`,
    columnas: [
      { nombre: 'Municipio' },
      { nombre: variable.nombre, numerica: true },
      { nombre: 'Fecha del reporte' },
      { nombre: 'Observaciones' },
    ],
    filas: [...municipios]
      .sort(compararPor(variable.codigo))
      .map(({ nombre, valores, fechaReporte, alertas }) => [
        nombre,
        formatearCantidad(valores[variable.codigo]),
        fechaDeReporte(fechaReporte),
        alertas.map((codigo) => OBSERVACIONES[codigo]).join(' ') || 'Ninguna',
      ]),
  });
}

iniciarPagina(async (contexto) => {
  const [territorio, limites, evento] = await Promise.all([
    cargarTerritorio(),
    cargar('geo/departamentos'),
    cargar('oficial/evento'),
  ]);
  const fuente = contexto.fuente('dane-afectaciones');
  const epicentro = { ...evento.coordenadas, etiqueta: 'Epicentro según el USGS' };
  const departamento = departamentoInicial(limites);
  const estado = {
    variable: VARIABLE_INICIAL,
    departamento,
    municipio: municipioInicial(departamento),
    buscado: null,
  };

  const mapa = document.createElement('andes-mapa');
  const ficha = crear('div', { clase: 'panel ficha-territorio', 'aria-live': 'polite' });
  const tabla = crear('div');
  const variables = selector(
    'Indicador',
    'selector-indicador',
    territorio.variables.map(({ codigo, nombre }) => ({ valor: codigo, nombre })),
    estado.variable,
  );
  const departamentos = selector(
    'Departamento',
    'selector-departamento',
    opcionesDeDepartamento(limites, territorio),
    estado.departamento,
  );

  const variableActual = () => territorio.variables.find(({ codigo }) => codigo === estado.variable);
  const nombreDe = (codigo) =>
    limites.features.find(({ properties }) => properties.codigo === codigo).properties.nombre;

  function elegirDepartamento(codigo) {
    estado.departamento = codigo;
    estado.municipio = null;
    departamentos.lista.value = codigo;
    const direccion = codigo ? `?departamento=${codigo}` : window.location.pathname;
    window.history.replaceState(null, '', direccion);
    return actualizar();
  }

  function mostrarPais() {
    const variable = variableActual();
    mapa.pintar({
      entidades: limites,
      valores: valoresPorCodigo(territorio.departamentos, estado.variable),
      titulo: variable.nombre,
      encuadrar: ENCUADRE_CON_REPORTE,
      epicentro,
      alSeleccionar: elegirDepartamento,
    });
    ficha.replaceChildren(
      ...crearFicha({
        titulo: 'Colombia',
        detalle: `${formatearNumero(territorio.meta.municipiosConReporte)} municipios con reporte en ${territorio.meta.departamentosConReporte} departamentos.`,
        variables: territorio.variables,
        valores: territorio.nacional,
      }),
    );
    tabla.replaceChildren(tablaDeDepartamentos(territorio, variable));
  }

  async function mostrarDepartamento() {
    const variable = variableActual();
    const geometria = await cargar(`geo/municipios/${estado.departamento}`);
    const municipios = territorio.municipios.filter(
      ({ departamento }) => departamento === estado.departamento,
    );
    const resumen = territorio.departamentos.find(({ codigo }) => codigo === estado.departamento);
    const elegido = municipios.find(({ codigo }) => codigo === estado.municipio);
    mapa.pintar({
      entidades: geometria,
      valores: valoresPorCodigo(municipios, estado.variable),
      titulo: variable.nombre,
      encuadrar: ENCUADRE_COMPLETO,
      seleccionado: estado.municipio,
      epicentro,
      alSeleccionar: (codigo) => {
        estado.municipio = codigo;
        return actualizar();
      },
    });
    const sinReporte = !elegido && estado.buscado?.codigo === estado.municipio;
    const descripcion = elegido
      ? {
          titulo: `${elegido.nombre}, ${nombreDe(estado.departamento)}`,
          detalle: `Fecha del reporte: ${fechaDeReporte(elegido.fechaReporte)}.`,
          valores: elegido.valores,
          observaciones: elegido.alertas,
        }
      : sinReporte
        ? {
            titulo: `${estado.buscado.nombre}, ${nombreDe(estado.departamento)}`,
            detalle: resumen
              ? `${formatearNumero(resumen.municipiosConReporte)} municipios de ${nombreDe(estado.departamento)} tienen reporte; este no.`
              : `Ningún municipio de ${nombreDe(estado.departamento)} tiene reporte en la fuente.`,
            valores: {},
          }
        : {
            titulo: nombreDe(estado.departamento),
            detalle: resumen
              ? `${formatearNumero(resumen.municipiosConReporte)} municipios con reporte. Selecciona uno en el mapa para ver su detalle.`
              : SIN_REPORTE,
            valores: resumen?.valores ?? {},
          };
    ficha.replaceChildren(...crearFicha({ ...descripcion, variables: territorio.variables }));
    tabla.replaceChildren(tablaDeMunicipios(municipios, variable, nombreDe(estado.departamento)));
  }

  function actualizar() {
    return estado.departamento === TODO_EL_PAIS ? mostrarPais() : mostrarDepartamento();
  }

  variables.lista.addEventListener('change', () => {
    estado.variable = variables.lista.value;
    actualizar();
  });
  departamentos.lista.addEventListener('change', () => elegirDepartamento(departamentos.lista.value));

  const buscador = crearBuscadorDeMunicipios({
    alElegir: (municipio) => {
      estado.departamento = municipio.departamento.codigo;
      estado.municipio = municipio.codigo;
      estado.buscado = municipio;
      departamentos.lista.value = municipio.departamento.codigo;
      window.history.replaceState(
        null,
        '',
        `?departamento=${municipio.departamento.codigo}&municipio=${municipio.codigo}`,
      );
      return actualizar();
    },
  });
  await actualizar();

  return [
    seccion(
      {
        titulo: 'Afectación por territorio',
        descripcion: `${describirPeriodo(territorio.meta)}. Estos totales son anteriores a los balances nacionales de octubre y no se mezclan con ellos.`,
      },
      crear('div', { clase: 'mapa-controles' }, variables.campo, departamentos.campo, buscador.campo),
      crear('div', { clase: 'mapa-disposicion' }, mapa, ficha),
    ),
    seccion({ titulo: 'Los mismos datos en tabla' }, tabla),
    seccion(
      { titulo: 'Sobre esta fuente' },
      nota(fuente.limitaciones, { alerta: true }),
      crear(
        'p',
        { clase: 'mt-3 mb-0' },
        `Fuente: ${nombreCorto(fuente)}. `,
        enlaceExterno('Abrir el servicio de la fuente', fuente.enlace),
      ),
    ),
  ];
});
