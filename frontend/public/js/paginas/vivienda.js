import { crearSello } from '../componentes/sello.js';
import { barras, circular, embudo, matriz } from '../graficas/opciones.js';
import { tema } from '../graficas/tema.js';
import { cargar } from '../nucleo/datos.js';
import { formatearFecha, formatearNumero, formatearPesos, formatearPorcentaje } from '../nucleo/formato.js';
import { nombreCorto } from '../nucleo/indicadores.js';
import {
  figura,
  grafica,
  graficaSimulada,
  graficas,
  indicadores,
  iniciarPagina,
  muestraDe,
  nota,
  origenDe,
  origenSimulado,
  seccion,
} from '../nucleo/pagina.js';
import { crearTabla } from '../nucleo/tabla.js';
import { cargarTerritorio } from '../nucleo/territorio.js';
import { barrasPorDepartamento, evolucionDeVivienda, nombres } from './bloques.js';

const INDICADORES_DE_VIVIENDA = [
  'viviendas_afectadas',
  'viviendas_destruidas',
  'viviendas_averiadas',
  'viviendas_aseguradas',
  'viviendas_no_aseguradas',
  'viviendas_reconstruidas',
];
const INDICADORES_DE_SEGUROS = [
  'reclamaciones_seguros',
  'valor_siniestros_asegurados',
  'indemnizaciones_pagadas',
  'reclamaciones_pendientes',
];
const SIN_DATO = 'Información no disponible';
const cantidadOSinDato = (valor) =>
  valor === null || valor === undefined ? SIN_DATO : formatearNumero(valor);

const muestra = (datos) => muestraDe(datos.tamanoMuestra, 'viviendas');
const viviendas = (categorias) => categorias.map((categoria) => categoria.viviendas);

function distribucion(categorias, encabezado) {
  return circular({ categorias: nombres(categorias), valores: viviendas(categorias), encabezado });
}

function reclamacionesPorDepartamento(contexto, seguros) {
  return grafica({
    pregunta: '¿En qué departamentos hay más reclamaciones de seguros?',
    descripcion: 'Los cinco departamentos con más siniestros reportados a las aseguradoras.',
    ...barras({
      categorias: nombres(seguros.porDepartamento),
      series: [
        { nombre: 'Siniestros', valores: seguros.porDepartamento.map(({ siniestros }) => siniestros) },
      ],
      encabezado: 'Departamento',
    }),
    origen: origenDe(contexto.fuente(seguros.meta.fuente), seguros.meta.fechaCorte),
  });
}

function reclamacionesPorRamo(contexto, seguros) {
  return grafica({
    pregunta: '¿Qué tipo de seguro concentra las reclamaciones?',
    ...barras({
      categorias: nombres(seguros.porRamo),
      series: [
        { nombre: 'Reclamaciones', valores: seguros.porRamo.map(({ reclamaciones }) => reclamaciones) },
      ],
      encabezado: 'Ramo',
    }),
    origen: origenDe(contexto.fuente(seguros.meta.fuente), seguros.meta.fechaCorte),
  });
}

function pagosPorDepartamento(contexto, seguros) {
  return figura(
    {
      pregunta: '¿Cuánto han pagado las aseguradoras en cada departamento?',
      origen: origenDe(contexto.fuente(seguros.meta.fuente), seguros.meta.fechaCorte),
      anchoCompleto: true,
    },
    crearTabla({
      titulo: 'Siniestros, pagos y valor estimado por departamento',
      columnas: [
        { nombre: 'Departamento' },
        { nombre: 'Siniestros', numerica: true },
        { nombre: 'Pagos realizados', numerica: true },
        { nombre: 'Valor estimado a pagar', numerica: true },
      ],
      filas: seguros.porDepartamento.map(({ nombre, siniestros, pagos, valorEstimado }) => [
        nombre,
        formatearNumero(siniestros),
        formatearPesos(pagos),
        formatearPesos(valorEstimado),
      ]),
    }),
  );
}

const viviendasDe = (categorias, codigo) =>
  categorias.find((categoria) => categoria.codigo === codigo)?.viviendas;

function rangoDeCobertura({ porcentajeMinimo, porcentajeMaximo }) {
  if (porcentajeMinimo === null || porcentajeMaximo === null) {
    return SIN_DATO;
  }
  return `Entre ${formatearPorcentaje(porcentajeMinimo)} y ${formatearPorcentaje(porcentajeMaximo)}`;
}

function respuestasSimuladas(datos) {
  const departamentos = datos.sinSeguroPorDepartamento.slice(0, 3);
  return [
    cantidadOSinDato(viviendasDe(datos.aseguramiento, 'ASEGURADA')),
    cantidadOSinDato(viviendasDe(datos.aseguramiento, 'NO_ASEGURADA')),
    rangoDeCobertura(datos.coberturaDestruidas),
    cantidadOSinDato(datos.reclamaciones.enEstudio),
    cantidadOSinDato(datos.arrendadasAfectadas),
    cantidadOSinDato(datos.propiasAfectadas),
    datos.valorDestruidas === null ? SIN_DATO : formatearPesos(datos.valorDestruidas),
    departamentos.length > 0 ? nombres(departamentos).join(', ') : SIN_DATO,
  ];
}

const PREGUNTAS_SIN_FUENTE = [
  '¿Cuántas estaban aseguradas?',
  '¿Cuántas no estaban aseguradas?',
  '¿Qué porcentaje de viviendas destruidas tenía una póliza?',
  '¿Cuántas viviendas aseguradas tienen reclamaciones pendientes?',
  '¿Cuántas viviendas arrendadas fueron afectadas?',
  '¿Cuántas viviendas propias fueron afectadas?',
  '¿Cuánto representan económicamente las viviendas destruidas?',
  '¿Qué departamentos presentan mayor cantidad de viviendas sin asegurar?',
];

function filaOficial(contexto) {
  const afectadas = contexto.indicador('viviendas_afectadas');
  const respuesta = `${formatearNumero(afectadas.valor)} según ${nombreCorto(afectadas.fuente)}, con corte al ${formatearFecha(afectadas.fechaCorte)}`;
  return ['¿Cuántas viviendas fueron afectadas?', respuesta, crearSello(afectadas.origen, afectadas.nivel)];
}

function filasSinFuente(datos) {
  const respuestas = datos ? respuestasSimuladas(datos) : null;
  return PREGUNTAS_SIN_FUENTE.map((pregunta, posicion) => [
    pregunta,
    respuestas ? respuestas[posicion] : SIN_DATO,
    respuestas ? crearSello('SIMULADO', 'S') : crearSello('SIN_DATO'),
  ]);
}

function preguntasDelModulo(contexto, datos) {
  const origen = datos
    ? {
        ...origenSimulado(muestra(datos)),
        texto: `La primera respuesta es oficial. Las demás salen de una ${muestra(datos).toLowerCase()} y no son cifras oficiales.`,
      }
    : origenDe(contexto.fuente('ungrd-balance-2026-10-10'), '2026-10-10');
  return figura(
    {
      pregunta: 'Las nueve preguntas del módulo de vivienda',
      descripcion:
        'Cada respuesta indica si proviene de una fuente oficial, de datos simulados o si no existe.',
      origen,
      anchoCompleto: true,
    },
    crearTabla({
      titulo: 'Preguntas y respuestas sobre las viviendas afectadas',
      columnas: [{ nombre: 'Pregunta' }, { nombre: 'Respuesta' }, { nombre: 'Origen' }],
      filas: [filaOficial(contexto), ...filasSinFuente(datos)],
    }),
  );
}

function seccionDeCaracteristicas(datos) {
  return seccion(
    {
      titulo: 'Características de las viviendas',
      descripcion:
        'Estado físico, ocupación, seguro y financiación son cuatro variables independientes. Una vivienda hipotecada puede estar asegurada o no.',
    },
    graficas(
      graficaSimulada(datos, {
        pregunta: '¿En qué estado físico quedaron las viviendas?',
        muestra,
        construir: ({ estadoFisico }) =>
          barras({
            categorias: nombres(estadoFisico),
            series: [{ nombre: 'Viviendas', valores: viviendas(estadoFisico) }],
            colorPorCategoria: true,
            colores: tema.dano,
            encabezado: 'Estado físico',
          }),
      }),
      graficaSimulada(datos, {
        pregunta: '¿Quién ocupaba las viviendas afectadas?',
        muestra,
        construir: ({ ocupacion }) => distribucion(ocupacion, 'Ocupación y tenencia'),
      }),
      graficaSimulada(datos, {
        pregunta: '¿Cuántas viviendas afectadas tenían seguro?',
        muestra,
        construir: ({ aseguramiento }) => distribucion(aseguramiento, 'Aseguramiento'),
      }),
      graficaSimulada(datos, {
        pregunta: '¿Cómo estaban financiadas las viviendas?',
        muestra,
        construir: ({ financiacion }) => distribucion(financiacion, 'Financiación'),
      }),
    ),
  );
}

function seccionDeCruces(datos) {
  const inconsistencias = Number.isFinite(datos?.financiadasSinSeguro)
    ? nota(
        `En la muestra simulada hay ${formatearNumero(datos.financiadasSinSeguro)} viviendas con hipoteca o leasing marcadas como no aseguradas. El sistema las conserva y las señala para verificación, porque la norma exige seguro de incendio y terremoto para los inmuebles hipotecados.`,
        { alerta: true },
      )
    : null;
  return seccion(
    {
      titulo: 'Cruces entre variables',
      descripcion: 'Las viviendas con póliza pendiente de verificación no se cuentan como no aseguradas.',
    },
    graficas(
      graficaSimulada(datos, {
        pregunta: '¿Cómo se relaciona el estado físico con el seguro?',
        muestra,
        construir: ({ estadoPorAseguramiento }) =>
          matriz({ ...estadoPorAseguramiento, encabezado: 'Estado físico' }),
        alto: true,
      }),
      graficaSimulada(datos, {
        pregunta: '¿Cómo se relaciona la financiación con el seguro?',
        muestra,
        construir: ({ financiacionPorAseguramiento }) =>
          matriz({ ...financiacionPorAseguramiento, encabezado: 'Financiación' }),
        alto: true,
      }),
      graficaSimulada(datos, {
        pregunta: '¿En qué etapa están las reclamaciones de las viviendas aseguradas?',
        muestra,
        construir: ({ embudoReclamaciones }) =>
          embudo({
            etapas: embudoReclamaciones.map(({ etapa }) => etapa),
            valores: viviendas(embudoReclamaciones),
            unidad: 'viviendas',
          }),
      }),
      graficaSimulada(datos, {
        pregunta: '¿Qué departamentos tienen más viviendas afectadas sin seguro?',
        muestra,
        construir: ({ sinSeguroPorDepartamento }) =>
          barras({
            categorias: nombres(sinSeguroPorDepartamento),
            series: [{ nombre: 'Viviendas sin seguro', valores: viviendas(sinSeguroPorDepartamento) }],
            encabezado: 'Departamento',
          }),
      }),
    ),
    inconsistencias,
  );
}

iniciarPagina(async (contexto) => {
  const [territorio, seguros, datos] = await Promise.all([
    cargarTerritorio(),
    cargar('oficial/seguros'),
    contexto.simulado('vivienda'),
  ]);
  return [
    seccion(
      { titulo: 'Viviendas afectadas' },
      indicadores(contexto, INDICADORES_DE_VIVIENDA),
      graficas(
        evolucionDeVivienda(contexto),
        barrasPorDepartamento(contexto, territorio, {
          pregunta: '¿Qué departamentos tienen más viviendas destruidas y averiadas?',
          variables: ['viviendasDestruidas', 'viviendasAveriadas'],
        }),
      ),
    ),
    seccion(
      {
        titulo: 'Seguros',
        descripcion: seguros.meta.nota,
      },
      indicadores(contexto, INDICADORES_DE_SEGUROS),
      graficas(
        reclamacionesPorDepartamento(contexto, seguros),
        reclamacionesPorRamo(contexto, seguros),
        pagosPorDepartamento(contexto, seguros),
      ),
    ),
    seccionDeCaracteristicas(datos),
    seccionDeCruces(datos),
    seccion({ titulo: 'Preguntas del módulo' }, graficas(preguntasDelModulo(contexto, datos))),
  ];
});
