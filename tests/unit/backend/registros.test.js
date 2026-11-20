import { describe, expect, it } from 'vitest';
import {
  INDICADORES_DE_VIVIENDAS_REGISTRADAS,
  crearServicioRegistros,
  etiquetaDeQuinquenio,
} from '../../../backend/src/services/registros.js';

const fila = (dimension, categoria, cantidad, { nivel = 'NACIONAL', territorio = '00', suma } = {}) => ({
  nivel,
  territorio,
  dimension,
  categoria,
  cantidad,
  suma: suma ?? (cantidad === null ? null : cantidad * 10),
  actualizado_en: new Date('2026-11-19T12:00:00Z'),
});

const categoria = (dimension, codigo, posicion, extra = {}) => ({
  dimension,
  categoria: codigo,
  nombre: `Nombre de ${codigo}`,
  orden: posicion + 1,
  afectada: null,
  exige_seguro: null,
  ...extra,
});

const ESTADOS = [
  ['SIN_AFECTACION', false],
  ['AFECTACION_LEVE', true],
  ['DESTRUCCION_TOTAL', true],
];

const CATEGORIAS_DE_VIVIENDAS = [
  ...ESTADOS.map(([codigo, afectada], posicion) =>
    categoria('estado_fisico', codigo, posicion, { afectada }),
  ),
  ...['ASEGURADA', 'NO_ASEGURADA', 'PENDIENTE_VERIFICACION'].map((codigo, posicion) =>
    categoria('aseguramiento', codigo, posicion),
  ),
  ...[
    ['HIPOTECA', true],
    ['SIN_FINANCIACION', false],
  ].map(([codigo, exige], posicion) => categoria('financiacion', codigo, posicion, { exige_seguro: exige })),
  ...['PROPIA', 'ARRENDADA'].map((codigo, posicion) => categoria('ocupacion', codigo, posicion)),
  ...['NO_APLICA', 'EN_ESTUDIO', 'APROBADA', 'PAGADA'].map((codigo, posicion) =>
    categoria('reclamacion', codigo, posicion),
  ),
];

const cruce = (dimensionFila, categoriaFila, dimensionColumna, categoriaColumna, cantidad, lugar = {}) => ({
  nivel: lugar.nivel ?? 'NACIONAL',
  territorio: lugar.territorio ?? '00',
  dimension_fila: dimensionFila,
  categoria_fila: categoriaFila,
  dimension_columna: dimensionColumna,
  categoria_columna: categoriaColumna,
  cantidad,
});

function repositorio({ agregados = [], cruces = [], categorias = CATEGORIAS_DE_VIVIENDAS, existe = true }) {
  return {
    existeEvento: async () => existe,
    agregados: async () => agregados,
    cruces: async () => cruces,
    categorias: async () => categorias,
    departamentos: async () => [
      { codigo: '27', nombre: 'Chocó' },
      { codigo: '66', nombre: 'Risaralda' },
    ],
  };
}

const AGREGADOS_DE_VIVIENDAS = [
  fila('total', 'TOTAL', 600),
  fila('estado_fisico', 'SIN_AFECTACION', 200),
  fila('estado_fisico', 'AFECTACION_LEVE', 250),
  fila('estado_fisico', 'DESTRUCCION_TOTAL', 150),
  fila('aseguramiento', 'ASEGURADA', 200),
  fila('aseguramiento', 'NO_ASEGURADA', 300),
  fila('aseguramiento', 'PENDIENTE_VERIFICACION', 100),
  fila('financiacion', 'HIPOTECA', 120),
  fila('financiacion', 'SIN_FINANCIACION', 480),
  fila('reclamacion', 'NO_APLICA', 400),
  fila('reclamacion', 'EN_ESTUDIO', 90),
  fila('reclamacion', 'APROBADA', null),
  fila('reclamacion', 'PAGADA', 104),
];

const CRUCES_DE_VIVIENDAS = [
  ...[
    ['SIN_AFECTACION', 60, 110, 30],
    ['AFECTACION_LEVE', 80, 120, 50],
    ['DESTRUCCION_TOTAL', 60, 70, 20],
  ].flatMap(([estado, asegurada, noAsegurada, pendiente]) => [
    cruce('estado_fisico', estado, 'aseguramiento', 'ASEGURADA', asegurada),
    cruce('estado_fisico', estado, 'aseguramiento', 'NO_ASEGURADA', noAsegurada),
    cruce('estado_fisico', estado, 'aseguramiento', 'PENDIENTE_VERIFICACION', pendiente),
  ]),
  ...[
    ['SIN_AFECTACION', 120, 80],
    ['AFECTACION_LEVE', 150, 100],
    ['DESTRUCCION_TOTAL', 90, 60],
  ].flatMap(([estado, propia, arrendada]) => [
    cruce('estado_fisico', estado, 'ocupacion', 'PROPIA', propia),
    cruce('estado_fisico', estado, 'ocupacion', 'ARRENDADA', arrendada),
  ]),
  cruce('aseguramiento', 'ASEGURADA', 'financiacion', 'HIPOTECA', 90),
  cruce('aseguramiento', 'NO_ASEGURADA', 'financiacion', 'HIPOTECA', 20),
  cruce('aseguramiento', 'PENDIENTE_VERIFICACION', 'financiacion', 'HIPOTECA', 10),
  cruce('aseguramiento', 'ASEGURADA', 'financiacion', 'SIN_FINANCIACION', 110),
  cruce('aseguramiento', 'NO_ASEGURADA', 'financiacion', 'SIN_FINANCIACION', 280),
  cruce('aseguramiento', 'PENDIENTE_VERIFICACION', 'financiacion', 'SIN_FINANCIACION', 90),
];

describe('etiquetas de quinquenio', () => {
  it.each([
    ['00_04', '0 a 4'],
    ['15_19', '15 a 19'],
    ['80_MAS', '80 o más'],
  ])('%s se muestra como %s', (codigo, etiqueta) => {
    expect(etiquetaDeQuinquenio(codigo)).toBe(etiqueta);
  });
});

describe('registros de viviendas publicables', () => {
  const calcular = (opciones) => crearServicioRegistros(repositorio(opciones)).viviendas('sismo');

  it('arma el módulo de vivienda con las viviendas afectadas desde los cruces', async () => {
    const datos = await calcular({ agregados: AGREGADOS_DE_VIVIENDAS, cruces: CRUCES_DE_VIVIENDAS });
    expect(datos.tamanoMuestra).toBe(600);
    expect(datos.afectadas).toBe(400);
    expect(datos.aseguramiento.map(({ viviendas }) => viviendas)).toEqual([140, 190, 70]);
    expect(datos.propiasAfectadas).toBe(240);
    expect(datos.arrendadasAfectadas).toBe(160);
    expect(datos.coberturaDestruidas).toEqual({
      destruidas: 150,
      conPoliza: 60,
      porVerificar: 20,
      porcentajeMinimo: 40,
      porcentajeMaximo: (80 / 150) * 100,
    });
    expect(datos.financiadasSinSeguro).toBe(20);
    expect(datos.valorDestruidas).toBe(1500);
    expect(datos.financiacionPorAseguramiento.filas).toEqual([
      'Nombre de HIPOTECA',
      'Nombre de SIN_FINANCIACION',
    ]);
    expect(datos.financiacionPorAseguramiento.valores[0]).toEqual([90, 20, 10]);
  });

  it('conserva las celdas ocultas y oculta su complemento en la partición', async () => {
    const datos = await calcular({ agregados: AGREGADOS_DE_VIVIENDAS, cruces: CRUCES_DE_VIVIENDAS });
    const reclamaciones = Object.fromEntries(
      datos.embudoReclamaciones.map(({ etapa, viviendas }) => [etapa, viviendas]),
    );
    expect(datos.reclamaciones).toEqual({ enEstudio: null, rechazadas: 0, indemnizacionPendiente: null });
    expect(reclamaciones['Reclamación presentada']).toBeNull();
    expect(reclamaciones['Indemnización pagada']).toBe(104);
    expect(datos.indicadores.reclamaciones_pendientes).toBeNull();
  });

  it('declara siempre los mismos indicadores, con null cuando no se publican', async () => {
    const datos = await calcular({ agregados: AGREGADOS_DE_VIVIENDAS, cruces: CRUCES_DE_VIVIENDAS });
    expect(Object.keys(datos.indicadores)).toEqual([...INDICADORES_DE_VIVIENDAS_REGISTRADAS]);
    expect(datos.indicadores.viviendas_aseguradas).toEqual({
      valor: 140,
      muestra: 'Muestra simulada de 600 viviendas',
    });
  });

  it('no convierte en cero una celda oculta de un cruce', async () => {
    const cruces = CRUCES_DE_VIVIENDAS.map((celda) =>
      celda.categoria_fila === 'DESTRUCCION_TOTAL' && celda.categoria_columna === 'PENDIENTE_VERIFICACION'
        ? { ...celda, cantidad: null }
        : celda,
    );
    const datos = await calcular({ agregados: AGREGADOS_DE_VIVIENDAS, cruces });
    expect(datos.coberturaDestruidas.porVerificar).toBeNull();
    expect(datos.coberturaDestruidas.porcentajeMaximo).toBeNull();
    expect(
      datos.estadoPorAseguramiento.valores.flat().filter((valor) => valor === null).length,
    ).toBeGreaterThanOrEqual(4);
  });

  it('responde 404 cuando el evento no existe', async () => {
    await expect(calcular({ existe: false })).rejects.toMatchObject({ estado: 404 });
  });
});

describe('registros de personas publicables', () => {
  const CATEGORIAS = [
    ...['DE_0_A_9', 'DE_10_A_17', 'DE_18_A_59', 'DE_60_O_MAS'].map((codigo, posicion) =>
      categoria('grupo_edad', codigo, posicion),
    ),
    ...['DISCAPACIDAD', 'EMBARAZO'].map((codigo, posicion) => categoria('vulnerabilidad', codigo, posicion)),
  ];

  it('suprime en partición pero no en las vulnerabilidades, que se solapan', async () => {
    const datos = await crearServicioRegistros(
      repositorio({
        categorias: CATEGORIAS,
        agregados: [
          fila('total', 'TOTAL', 500),
          fila('grupo_edad', 'DE_0_A_9', null),
          fila('grupo_edad', 'DE_10_A_17', 80),
          fila('grupo_edad', 'DE_18_A_59', 300),
          fila('grupo_edad', 'DE_60_O_MAS', 115),
          fila('vulnerabilidad', 'DISCAPACIDAD', null),
          fila('vulnerabilidad', 'EMBARAZO', 12),
          fila('semana', '2026-08-17', 200),
          fila('semana', '2026-08-10', 300),
          fila('total', 'TOTAL', 320, { nivel: 'DEPARTAMENTO', territorio: '27' }),
          fila('total', 'TOTAL', 180, { nivel: 'DEPARTAMENTO', territorio: '66' }),
        ],
      }),
    ).poblacion('sismo');
    expect(datos.gruposEdad.map(({ personas }) => personas)).toEqual([null, null, 300, 115]);
    expect(datos.vulnerabilidad.map(({ personas }) => personas)).toEqual([null, 12]);
    expect(datos.evolucion).toEqual({ fechas: ['2026-08-10', '2026-08-17'], registradas: [300, 200] });
    expect(datos.porDepartamento.map(({ nombre }) => nombre)).toEqual(['Chocó', 'Risaralda']);
    expect(datos.piramide.grupos).toHaveLength(17);
  });
});
