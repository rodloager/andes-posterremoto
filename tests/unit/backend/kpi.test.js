import { describe, expect, it } from 'vitest';
import { ErrorDeKpi, leerKpi, validarKpi } from '../../../backend/src/config/kpi.js';
import {
  ESTADO_DISPONIBLE,
  ESTADO_SIN_DATO,
  calcularIndicadorClave,
  combinarCalificadores,
  crearServicioKpi,
  valorar,
} from '../../../backend/src/services/kpi.js';

const BASE = Object.freeze({
  codigo: 'prueba',
  nombre: 'Prueba',
  descripcion: 'Indicador de prueba.',
  modulo: 'vivienda',
  unidad: 'porcentaje',
  sentido: 'menor_es_mejor',
  origen: 'OFICIAL',
  numerador: { indicador: 'parte' },
  denominador: { indicador: 'todo' },
});

const punto = (indicador, fecha, valor, calificador = null) => ({
  indicador_codigo: indicador,
  fecha_corte: fecha,
  valor,
  calificador,
  fuente_id: `fuente-${fecha}`,
});

function datosOficiales(filas, extra = {}) {
  const valoresPorIndicador = new Map();
  for (const fila of filas) {
    valoresPorIndicador.set(fila.indicador_codigo, [
      ...(valoresPorIndicador.get(fila.indicador_codigo) ?? []),
      fila,
    ]);
  }
  return {
    catalogo: new Map([
      ['parte', { codigo: 'parte', nombre: 'Parte', unidad: 'viviendas' }],
      ['todo', { codigo: 'todo', nombre: 'Todo', unidad: 'viviendas' }],
    ]),
    valoresPorIndicador,
    valoresMunicipales: [],
    carga: null,
    publicables: () => ({ hayRegistros: false }),
    ...extra,
  };
}

describe('catálogo de indicadores clave', () => {
  it('lee config/kpi.yml con trece indicadores de códigos únicos', async () => {
    const { kpi } = await leerKpi();
    expect(kpi).toHaveLength(13);
    expect(new Set(kpi.map(({ codigo }) => codigo)).size).toBe(13);
    expect(kpi.filter(({ origen }) => origen === 'OFICIAL')).toHaveLength(8);
  });

  it.each([
    ['mezcla familias de ingredientes', { ...BASE, origen: 'SIMULADO' }],
    [
      'usa un cruce de una sola dimensión',
      { ...BASE, origen: 'SIMULADO', numerador: { cruce: { zona: ['URBANA'] } } },
    ],
    [
      'usa una dimensión que no se puede cruzar',
      {
        ...BASE,
        origen: 'SIMULADO',
        numerador: { cruce: { estrato: ['1'], aseguramiento: ['ASEGURADA'] } },
        denominador: { agregado: { destino: 'viviendas', dimension: 'total', categorias: ['TOTAL'] } },
      },
    ],
    [
      'declara dos ingredientes en un mismo lado',
      { ...BASE, numerador: { indicador: 'parte', territorial: {} } },
    ],
    ['usa una unidad desconocida', { ...BASE, unidad: 'por_mil' }],
  ])('rechaza un indicador que %s', (_, indicador) => {
    expect(() => validarKpi({ version: 1, kpi: [indicador] })).toThrow(ErrorDeKpi);
  });

  it('rechaza códigos repetidos', () => {
    expect(() => validarKpi({ version: 1, kpi: [BASE, BASE] })).toThrow(/código distinto/);
  });
});

describe('combinación de calificadores', () => {
  it.each([
    [null, null, null],
    ['más de', null, 'más de'],
    [null, 'más de', 'menos de'],
    ['menos de', null, 'menos de'],
    [null, 'menos de', 'más de'],
    ['más de', 'menos de', 'más de'],
    ['más de', 'más de', 'cerca de'],
    ['cerca de', null, 'cerca de'],
    [null, 'cerca de', 'cerca de'],
  ])('%s sobre %s da %s', (numerador, denominador, esperado) => {
    expect(combinarCalificadores(numerador, denominador)).toBe(esperado);
  });
});

describe('valoración de una variación', () => {
  it.each([
    [5, 'mayor_es_mejor', 'mejora'],
    [-5, 'mayor_es_mejor', 'empeora'],
    [5, 'menor_es_mejor', 'empeora'],
    [-5, 'menor_es_mejor', 'mejora'],
    [0, 'menor_es_mejor', 'sin_cambio'],
    [5, 'neutral', null],
  ])('una diferencia de %d con sentido %s', (diferencia, sentido, esperado) => {
    expect(valorar(diferencia, sentido)).toBe(esperado);
  });
});

describe('cálculo de un indicador clave oficial', () => {
  it('divide los últimos valores, escala la unidad y compara los cortes compartidos', () => {
    const resultado = calcularIndicadorClave(
      BASE,
      datosOficiales([
        punto('parte', '2026-08-15', 10),
        punto('parte', '2026-10-10', 30),
        punto('todo', '2026-08-15', 100),
        punto('todo', '2026-10-10', 200),
      ]),
    );
    expect(resultado).toMatchObject({
      estado: ESTADO_DISPONIBLE,
      valor: 15,
      fechaCorte: '2026-10-10',
      numerador: { valor: 30, nombre: 'Parte', unidad: 'viviendas', fuente: 'fuente-2026-10-10' },
      variacion: { absoluta: 5, corteAnterior: '2026-08-15', valoracion: 'empeora' },
    });
    expect(resultado.serie.map(({ valor }) => valor)).toEqual([10, 15]);
  });

  it('usa el mayor valor cuando dos fuentes publican la misma fecha', () => {
    const resultado = calcularIndicadorClave(
      BASE,
      datosOficiales([
        punto('parte', '2026-10-10', 30),
        punto('parte', '2026-10-10', 40),
        punto('todo', '2026-10-10', 200),
      ]),
    );
    expect(resultado.valor).toBe(20);
  });

  it('no calcula variación cuando las partes vienen de fechas distintas', () => {
    const resultado = calcularIndicadorClave(
      { ...BASE, unidad: 'por_cien_mil' },
      datosOficiales([
        punto('parte', '2026-08-15', 1),
        punto('parte', '2026-10-23', 3, 'más de'),
        punto('todo', '2026-08-15', 1000),
        punto('todo', '2026-10-10', 2000),
      ]),
    );
    expect(resultado.valor).toBe(150);
    expect(resultado.calificador).toBe('más de');
    expect(resultado.variacion).toBeNull();
  });

  it('explica qué cifra falta', () => {
    const resultado = calcularIndicadorClave(BASE, datosOficiales([punto('todo', '2026-10-10', 200)]));
    expect(resultado).toMatchObject({
      estado: ESTADO_SIN_DATO,
      motivoSinDato: 'No hay una cifra oficial de «Parte».',
    });
  });

  it('no divide por cero', () => {
    const resultado = calcularIndicadorClave(
      BASE,
      datosOficiales([punto('parte', '2026-10-10', 3), punto('todo', '2026-10-10', 0)]),
    );
    expect(resultado.estado).toBe(ESTADO_SIN_DATO);
    expect(resultado.motivoSinDato).toMatch(/denominador es cero/);
  });

  it('suma los municipios mayores con desempate por código', () => {
    const territorial = {
      ...BASE,
      numerador: { territorial: { variables: ['personas'], mayores: 2 } },
      denominador: { territorial: { variables: ['personas'] } },
    };
    const valoresMunicipales = [
      { municipio_codigo: '00003', variable_codigo: 'personas', valor: 50 },
      { municipio_codigo: '00001', variable_codigo: 'personas', valor: 30 },
      { municipio_codigo: '00002', variable_codigo: 'personas', valor: 30 },
      { municipio_codigo: '00004', variable_codigo: 'personas', valor: 10 },
      { municipio_codigo: '00004', variable_codigo: 'familias', valor: 999 },
    ];
    const resultado = calcularIndicadorClave(
      territorial,
      datosOficiales([], { valoresMunicipales, carga: { fuente_id: 'dane', hasta: '2026-08-22' } }),
    );
    expect(resultado).toMatchObject({ valor: 66.66666666666666, fechaCorte: '2026-08-22' });
    expect(resultado.numerador).toMatchObject({ valor: 80, fuente: 'dane' });
  });
});

function repositorioSimulado({ agregados, cruces = [], existe = true }) {
  const categorias = [
    ...['ASEGURADA', 'NO_ASEGURADA', 'PENDIENTE_VERIFICACION'].map((categoria, posicion) => ({
      destino: 'viviendas',
      dimension: 'aseguramiento',
      categoria,
      orden: posicion + 1,
    })),
    ...['SIN_AFECTACION', 'DESTRUCCION_TOTAL'].map((categoria, posicion) => ({
      destino: 'viviendas',
      dimension: 'estado_fisico',
      categoria,
      orden: posicion + 1,
    })),
  ];
  return {
    existeEvento: async () => existe,
    nombresDeIndicadores: async () => [],
    valoresIndicador: async () => [],
    valoresMunicipales: async () => [],
    cargaTerritorial: async () => null,
    agregadosNacionales: async () => agregados,
    crucesNacionales: async () => cruces,
    categorias: async () => categorias,
  };
}

const agregado = (dimension, categoria, cantidad) => ({
  origen: 'SIMULADO',
  destino: 'viviendas',
  nivel: 'NACIONAL',
  territorio: '00',
  dimension,
  categoria,
  cantidad,
  suma: cantidad === null ? null : cantidad * 1000,
  actualizado_en: new Date('2026-11-19T12:00:00Z'),
});

const cruce = (estado, aseguramiento, cantidad) => ({
  origen: 'SIMULADO',
  nivel: 'NACIONAL',
  territorio: '00',
  dimension_fila: 'estado_fisico',
  categoria_fila: estado,
  dimension_columna: 'aseguramiento',
  categoria_columna: aseguramiento,
  cantidad,
});

const SIMULADOS = Object.freeze({
  version: 1,
  kpi: [
    {
      ...BASE,
      codigo: 'cobertura',
      origen: 'SIMULADO',
      numerador: {
        agregado: { destino: 'viviendas', dimension: 'aseguramiento', categorias: ['ASEGURADA'] },
      },
      denominador: { agregado: { destino: 'viviendas', dimension: 'total', categorias: ['TOTAL'] } },
    },
    {
      ...BASE,
      codigo: 'destruidas_con_poliza',
      origen: 'SIMULADO',
      numerador: { cruce: { estado_fisico: ['DESTRUCCION_TOTAL'], aseguramiento: ['ASEGURADA'] } },
      denominador: {
        agregado: { destino: 'viviendas', dimension: 'estado_fisico', categorias: ['DESTRUCCION_TOTAL'] },
      },
    },
  ],
});

const calcularSimulados = (repositorio) =>
  crearServicioKpi(repositorio, { leerConfiguracion: async () => SIMULADOS }).calcular('sismo');

describe('indicadores clave simulados', () => {
  it('calcula con los agregados publicables', async () => {
    const { kpi } = await calcularSimulados(
      repositorioSimulado({
        agregados: [
          agregado('total', 'TOTAL', 400),
          agregado('aseguramiento', 'ASEGURADA', 100),
          agregado('aseguramiento', 'NO_ASEGURADA', 250),
          agregado('aseguramiento', 'PENDIENTE_VERIFICACION', 50),
          agregado('estado_fisico', 'SIN_AFECTACION', 300),
          agregado('estado_fisico', 'DESTRUCCION_TOTAL', 100),
        ],
        cruces: [
          cruce('SIN_AFECTACION', 'ASEGURADA', 60),
          cruce('SIN_AFECTACION', 'NO_ASEGURADA', 200),
          cruce('SIN_AFECTACION', 'PENDIENTE_VERIFICACION', 40),
          cruce('DESTRUCCION_TOTAL', 'ASEGURADA', 40),
          cruce('DESTRUCCION_TOTAL', 'NO_ASEGURADA', 50),
          cruce('DESTRUCCION_TOTAL', 'PENDIENTE_VERIFICACION', 10),
        ],
      }),
    );
    expect(kpi.map(({ valor }) => valor)).toEqual([25, 40]);
    expect(kpi[0].actualizadoEn).toBe('2026-11-19T12:00:00.000Z');
  });

  it('no publica una celda que la tabla de registros oculta como complemento', async () => {
    const { kpi } = await calcularSimulados(
      repositorioSimulado({
        agregados: [
          agregado('total', 'TOTAL', 400),
          agregado('aseguramiento', 'ASEGURADA', 100),
          agregado('aseguramiento', 'NO_ASEGURADA', 250),
          agregado('aseguramiento', 'PENDIENTE_VERIFICACION', 50),
          agregado('estado_fisico', 'SIN_AFECTACION', 300),
          agregado('estado_fisico', 'DESTRUCCION_TOTAL', 100),
        ],
        cruces: [
          cruce('SIN_AFECTACION', 'ASEGURADA', 60),
          cruce('SIN_AFECTACION', 'NO_ASEGURADA', 200),
          cruce('SIN_AFECTACION', 'PENDIENTE_VERIFICACION', 40),
          cruce('DESTRUCCION_TOTAL', 'ASEGURADA', 15),
          cruce('DESTRUCCION_TOTAL', 'NO_ASEGURADA', 80),
          cruce('DESTRUCCION_TOTAL', 'PENDIENTE_VERIFICACION', null),
        ],
      }),
    );
    expect(kpi[1]).toMatchObject({
      estado: ESTADO_SIN_DATO,
      motivoSinDato: expect.stringMatching(/menos de 10/),
    });
  });

  it('explica que no hay registros cargados', async () => {
    const { kpi } = await calcularSimulados(repositorioSimulado({ agregados: [] }));
    expect(kpi.every(({ motivoSinDato }) => motivoSinDato === 'No hay registros simulados cargados.')).toBe(
      true,
    );
  });

  it('responde 404 cuando el evento no existe', async () => {
    await expect(
      calcularSimulados(repositorioSimulado({ agregados: [], existe: false })),
    ).rejects.toMatchObject({
      estado: 404,
      codigo: 'NO_ENCONTRADO',
    });
  });
});
