import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { normalizarPesos, priorizar, puntuarZonas } from '../../../backend/src/algorithms/priorizacion.js';

const ZONAS = [
  { codigo: '27361', nombre: 'San José del Palmar', valores: { afectados: 1000, suministros: 10 } },
  { codigo: '76001', nombre: 'Cali', valores: { afectados: 400, suministros: 50 } },
  { codigo: '66001', nombre: 'Pereira', valores: { afectados: 100, suministros: 90 } },
];
const CRITERIOS = [
  { codigo: 'afectados', peso: 3 },
  { codigo: 'suministros', peso: 1, masEsMejor: true },
];

describe('priorización de zonas', () => {
  it('ordena por suma ponderada y explica el aporte de cada criterio', () => {
    const resultado = priorizar(ZONAS, { criterios: CRITERIOS, k: 2 });
    expect(resultado.map(({ posicion, codigo }) => [posicion, codigo])).toEqual([
      [1, '27361'],
      [2, '76001'],
    ]);
    expect(resultado[0].puntaje).toBeCloseTo(1);
    expect(resultado[1].puntaje).toBeCloseTo(0.375);
    expect(resultado[1].aportes).toEqual([
      expect.objectContaining({
        criterio: 'afectados',
        valor: 400,
        peso: 0.75,
        normalizado: expect.closeTo(1 / 3),
        aporte: expect.closeTo(0.25),
      }),
      expect.objectContaining({
        criterio: 'suministros',
        valor: 50,
        peso: 0.25,
        normalizado: 0.5,
        aporte: 0.125,
      }),
    ]);
  });

  it('resuelve los empates por código DIVIPOLA', () => {
    const iguales = ['76001', '05001', '27361'].map((codigo) => ({
      codigo,
      nombre: codigo,
      valores: { afectados: 5 },
    }));
    expect(
      priorizar(iguales, { criterios: [{ codigo: 'afectados', peso: 1 }], k: 3 }).map(({ codigo }) => codigo),
    ).toEqual(['05001', '27361', '76001']);
  });

  it('un criterio con el mismo valor en todas las zonas aporta cero', () => {
    const resultado = puntuarZonas(
      ZONAS.map((zona) => ({ ...zona, valores: { ...zona.valores, suministros: 7 } })),
      CRITERIOS,
    );
    expect(resultado.every(({ aportes }) => aportes[1].aporte === 0)).toBe(true);
  });

  it('marca el dato faltante y no le asigna aporte', () => {
    const resultado = puntuarZonas(
      [...ZONAS, { codigo: '27001', nombre: 'Quibdó', valores: { afectados: 700 } }],
      CRITERIOS,
    );
    expect(resultado[3].aportes[1]).toMatchObject({ valor: null, aporte: 0, sinDato: true });
  });

  it('con k = 0 o sin zonas devuelve una lista vacía', () => {
    expect(priorizar(ZONAS, { criterios: CRITERIOS, k: 0 })).toEqual([]);
    expect(priorizar([], { criterios: CRITERIOS })).toEqual([]);
  });

  it.each([
    [[], 'al menos un criterio'],
    [
      [
        { codigo: 'a', peso: 1 },
        { codigo: 'a', peso: 2 },
      ],
      'código distinto',
    ],
    [[{ codigo: 'a', peso: -1 }], 'no negativos'],
    [[{ codigo: 'a', peso: 0 }], 'mayor que cero'],
    [[{ codigo: 'a', peso: Number.NaN }], 'no negativos'],
  ])('rechaza los criterios %j', (criterios, mensaje) => {
    expect(() => normalizarPesos(criterios)).toThrow(mensaje);
  });

  it.each([-1, 1.5, '3'])('rechaza k = %s', (k) => {
    expect(() => priorizar(ZONAS, { criterios: CRITERIOS, k })).toThrow(RangeError);
  });
});

describe('propiedades de la priorización', () => {
  const zonas = fc.uniqueArray(
    fc.record({
      codigo: fc.stringMatching(/^\d{5}$/),
      nombre: fc.constant('Zona'),
      valores: fc.record({
        a: fc.integer({ min: 0, max: 1000 }),
        b: fc.integer({ min: 0, max: 1000 }),
        c: fc.integer({ min: 0, max: 50 }),
      }),
    }),
    { selector: ({ codigo }) => codigo, maxLength: 60 },
  );
  const criterios = fc
    .tuple(fc.integer({ min: 1, max: 9 }), fc.integer({ min: 0, max: 9 }), fc.integer({ min: 0, max: 9 }))
    .map(([a, b, c]) => [
      { codigo: 'a', peso: a },
      { codigo: 'b', peso: b, masEsMejor: true },
      { codigo: 'c', peso: c },
    ]);

  it('equivale a ordenar todas las zonas y tomar las k primeras', () => {
    fc.assert(
      fc.property(zonas, criterios, fc.integer({ min: 0, max: 70 }), (lista, pesos, k) => {
        const esperado = puntuarZonas(lista, pesos)
          .sort((una, otra) => otra.puntaje - una.puntaje || una.codigo.localeCompare(otra.codigo))
          .slice(0, k)
          .map(({ codigo }) => codigo);
        expect(priorizar(lista, { criterios: pesos, k }).map(({ codigo }) => codigo)).toEqual(esperado);
      }),
      { numRuns: 200, seed: 20260810 },
    );
  });

  it('el puntaje está entre 0 y 1, es la suma de los aportes y no cambia al escalar los pesos', () => {
    fc.assert(
      fc.property(zonas, criterios, fc.integer({ min: 2, max: 10 }), (lista, pesos, factor) => {
        const resultado = puntuarZonas(lista, pesos);
        const escalado = puntuarZonas(
          lista,
          pesos.map((criterio) => ({ ...criterio, peso: criterio.peso * factor })),
        );
        resultado.forEach((zona, posicion) => {
          expect(zona.puntaje).toBeGreaterThanOrEqual(0);
          expect(zona.puntaje).toBeLessThanOrEqual(1 + 1e-12);
          expect(zona.aportes.reduce((suma, { aporte }) => suma + aporte, 0)).toBeCloseTo(zona.puntaje, 12);
          expect(escalado[posicion].puntaje).toBeCloseTo(zona.puntaje, 12);
        });
      }),
      { numRuns: 150, seed: 20260810 },
    );
  });
});
