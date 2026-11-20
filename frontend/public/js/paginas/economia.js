import { crearSello } from '../componentes/sello.js';
import { barras } from '../graficas/opciones.js';
import { cargar } from '../nucleo/datos.js';
import { formatearNumero, formatearPesos } from '../nucleo/formato.js';
import { nombreCorto } from '../nucleo/indicadores.js';
import {
  figura,
  grafica,
  graficaSimulada,
  graficas,
  indicadores,
  iniciarPagina,
  nota,
  origenDe,
  seccion,
} from '../nucleo/pagina.js';
import { crearTabla } from '../nucleo/tabla.js';
import { nombres, origenDeVariasFuentes } from './bloques.js';

const INDICADORES_DE_COSTO = [
  'perdidas_economicas',
  'costo_reconstruccion',
  'costo_recuperacion_plan',
  'brecha_financiacion',
];
const INDICADORES_DE_RECURSOS = [
  'presupuesto_recuperacion',
  'recursos_privados',
  'primer_desembolso_fondo',
  'indemnizaciones_pagadas',
  'recursos_pendientes_desembolso',
];
const INDICADORES_POR_SECTOR = [
  'danos_materiales',
  'perdidas_comerciales',
  'perdidas_agricolas',
  'perdidas_industriales',
  'empleos_afectados',
];
const MUESTRA = 'Valores simulados a partir de una muestra de viviendas';

const conceptos = (partidas) => partidas.map(({ concepto }) => concepto);
const valores = (partidas) => partidas.map(({ valor }) => valor);

function barrasDePesos(partidas, nombreDeSerie) {
  return barras({
    categorias: conceptos(partidas),
    series: [{ nombre: nombreDeSerie, valores: valores(partidas) }],
    unidad: 'COP',
    encabezado: 'Concepto',
  });
}

function costos(contexto, economia) {
  return grafica({
    pregunta: '¿Cuánto cuesta la reconstrucción?',
    descripcion: 'Las estimaciones provienen de entidades y fechas distintas. No se suman entre sí.',
    ...barrasDePesos(economia.costos, 'Costo estimado'),
    origen: origenDeVariasFuentes(contexto, economia.costos),
  });
}

function recursos(contexto, economia) {
  return grafica({
    pregunta: '¿Con qué recursos se cuenta?',
    descripcion:
      'Recursos anunciados, desembolsados o pagados. Las cifras anunciadas no equivalen a ejecución.',
    ...barrasDePesos(economia.recursos, 'Recursos'),
    origen: origenDeVariasFuentes(contexto, economia.recursos),
  });
}

function destinoDelFondo(contexto, { destinoFondo }) {
  return grafica({
    pregunta: '¿En qué se usarán los recursos detallados del Fondo Milagro?',
    descripcion: `El Gobierno detalló el destino de ${formatearPesos(destinoFondo.total)}.`,
    ...barrasDePesos(destinoFondo.rubros, 'Recursos'),
    origen: origenDe(contexto.fuente(destinoFondo.fuente), destinoFondo.fechaCorte),
  });
}

function contratacion(contexto, economia) {
  const filas = economia.contratacion.map((medicion) => {
    const fuente = contexto.fuente(medicion.fuente);
    return [
      medicion.concepto,
      formatearNumero(medicion.contratos),
      formatearPesos(medicion.valor),
      formatearNumero(medicion.contratacionDirecta),
      medicion.periodo,
      nombreCorto(fuente),
      crearSello(fuente.origen, fuente.nivel),
    ];
  });
  return figura(
    {
      pregunta: '¿Cuánta contratación pública menciona el sismo?',
      descripcion:
        'Son dos mediciones con métodos distintos sobre el sistema de contratación pública. Ninguna es una cifra oficial de inversión.',
      origen: origenDe(contexto.fuente('secop-ii')),
      anchoCompleto: true,
    },
    crearTabla({
      titulo: 'Contratos vinculados al sismo según dos mediciones',
      columnas: [
        { nombre: 'Medición' },
        { nombre: 'Contratos', numerica: true },
        { nombre: 'Valor', numerica: true },
        { nombre: 'Contratación directa', numerica: true },
        { nombre: 'Periodo' },
        { nombre: 'Quién la calcula' },
        { nombre: 'Origen' },
      ],
      filas,
    }),
  );
}

function perdidasPorSector(datos) {
  return graficaSimulada(datos, {
    pregunta: '¿Qué sectores concentran las pérdidas?',
    muestra: () => MUESTRA,
    construir: ({ perdidasPorSector: sectores }) =>
      barras({
        categorias: nombres(sectores),
        series: [{ nombre: 'Pérdidas', valores: valores(sectores) }],
        unidad: 'COP',
        encabezado: 'Sector',
      }),
  });
}

function ejecucionDeRecursos(datos) {
  return graficaSimulada(datos, {
    pregunta: '¿Cuánto de lo asignado se ha comprometido y ejecutado?',
    muestra: () => MUESTRA,
    construir: ({ recursos: origenes }) =>
      barras({
        categorias: nombres(origenes),
        series: [
          { nombre: 'Asignado', valores: origenes.map(({ asignado }) => asignado) },
          { nombre: 'Comprometido', valores: origenes.map(({ comprometido }) => comprometido) },
          { nombre: 'Ejecutado', valores: origenes.map(({ ejecutado }) => ejecutado) },
        ],
        unidad: 'COP',
        encabezado: 'Origen de los recursos',
      }),
  });
}

iniciarPagina(async (contexto) => {
  const [economia, datos] = await Promise.all([cargar('oficial/economia'), contexto.simulado('economia')]);
  return [
    seccion(
      { titulo: 'Costo de la reconstrucción' },
      indicadores(contexto, INDICADORES_DE_COSTO),
      graficas(costos(contexto, economia), recursos(contexto, economia)),
      nota(economia.meta.nota),
    ),
    seccion(
      { titulo: 'Recursos disponibles' },
      indicadores(contexto, INDICADORES_DE_RECURSOS),
      graficas(
        destinoDelFondo(contexto, economia),
        ejecucionDeRecursos(datos),
        contratacion(contexto, economia),
      ),
    ),
    seccion(
      {
        titulo: 'Pérdidas por sector',
        descripcion: 'No se localizó una estimación oficial de pérdidas por sector económico.',
      },
      indicadores(contexto, INDICADORES_POR_SECTOR),
      graficas(perdidasPorSector(datos)),
    ),
  ];
});
