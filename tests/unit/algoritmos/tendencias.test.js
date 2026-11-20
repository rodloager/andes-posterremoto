import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  analizarTendencia,
  crearSumasPrefijas,
  pendienteMinimosCuadrados,
} from '../../../backend/src/algorithms/tendencias.js';

const SEMANAS = ['2026-08-10', '2026-08-17', '2026-08-24', '2026-08-31', '2026-09-07', '2026-09-14'];
const semanal = (valores) => valores.map((valor, posicion) => ({ fecha: SEMANAS[posicion], valor }));

function diaria(valores) {
  return valores.map((valor, posicion) => ({
    fecha: new Date(Date.UTC(2026, 7, 10 + posicion)).toISOString().slice(0, 10),
    valor,
  }));
}

describe('análisis de tendencias', () => {
  it('calcula variación, ritmo diario y pendiente entre cortes irregulares', () => {
    const resultado = analizarTendencia(
      [
        { fecha: '2026-08-15', valor: 14705 },
        { fecha: '2026-10-10', valor: 36478 },
      ],
      { esAcumulado: true, masEsMejor: false },
    );
    expect(resultado.cortes[1]).toMatchObject({ dias: 56, delta: 21773, marcas: [] });
    expect(resultado.cortes[1].ritmoDiario).toBeCloseTo(388.8, 1);
    expect(resultado.cortes[1].variacion).toBeCloseTo(21773 / 14705, 12);
    expect(resultado.pendiente).toBeCloseTo(388.8, 1);
    expect(resultado).toMatchObject({ tendencia: 'CRECIENTE', lectura: 'EMPEORA' });
  });

  it('calcula la media móvil con ventana deslizante', () => {
    const { cortes } = analizarTendencia(semanal([10, 20, 30, 40]), { ventana: 3 });
    expect(cortes.map(({ mediaMovil }) => mediaMovil)).toEqual([null, null, 20, 30]);
  });

  it('marca la revisión a la baja de un indicador acumulado', () => {
    const { cortes } = analizarTendencia(semanal([100, 120, 110]), { esAcumulado: true });
    expect(cortes.map(({ marcas }) => marcas)).toEqual([[], [], ['REVISION_A_LA_BAJA']]);
    expect(analizarTendencia(semanal([100, 120, 110])).cortes[2].marcas).toEqual([]);
  });

  it('marca como anomalía un ritmo muy distinto del resto', () => {
    const { cortes } = analizarTendencia(diaria([0, 10, 20, 30, 40, 50, 250]));
    expect(cortes.map(({ marcas }) => marcas.includes('ANOMALIA'))).toEqual([
      false,
      false,
      false,
      false,
      false,
      false,
      true,
    ]);
  });

  it('reconoce una serie estable y una insuficiente', () => {
    expect(analizarTendencia(semanal([5, 5, 5]), { masEsMejor: true })).toMatchObject({
      pendiente: 0,
      tendencia: 'ESTABLE',
      lectura: 'ESTANCADO',
    });
    expect(analizarTendencia(semanal([5]))).toMatchObject({
      pendiente: null,
      tendencia: 'INSUFICIENTE',
      lectura: null,
    });
    expect(analizarTendencia([])).toMatchObject({ cortes: [], tendencia: 'INSUFICIENTE' });
  });

  it('deja la variación sin dato cuando el valor anterior es cero', () => {
    expect(analizarTendencia(semanal([0, 10])).cortes[1].variacion).toBeNull();
  });

  it.each([
    [
      [
        { fecha: '2026-08-17', valor: 1 },
        { fecha: '2026-08-10', valor: 2 },
      ],
      'ordenada',
    ],
    [
      [
        { fecha: '2026-08-10', valor: 1 },
        { fecha: '2026-08-10', valor: 2 },
      ],
      'ordenada',
    ],
    [[{ fecha: '2026-02-30', valor: 1 }], 'Fecha no válida'],
    [[{ fecha: '10/08/2026', valor: 1 }], 'Fecha no válida'],
    [[{ fecha: '2026-08-10', valor: Number.NaN }], 'Valor no válido'],
    [[{ fecha: '2026-08-10', valor: '7' }], 'Valor no válido'],
  ])('rechaza la serie %j', (serie, mensaje) => {
    expect(() => analizarTendencia(serie)).toThrow(mensaje);
  });

  it('rechaza una ventana inválida', () => {
    expect(() => analizarTendencia(semanal([1, 2]), { ventana: 0 })).toThrow(RangeError);
  });
});

describe('sumas prefijas', () => {
  it('responde el total de cualquier intervalo con una resta', () => {
    const sumas = crearSumasPrefijas(semanal([10, 20, 30, 40, 50, 60]));
    expect(sumas.totalEntre('2026-08-17', '2026-08-31')).toBe(90);
    expect(sumas.totalEntre('2026-08-11', '2026-08-16')).toBe(0);
    expect(sumas.totalEntre('2026-01-01', '2026-12-31')).toBe(210);
    expect(sumas.totalEntre('2026-09-01', '2026-08-01')).toBe(0);
  });
});

describe('propiedades de las tendencias', () => {
  const serie = fc.array(fc.integer({ min: -1000, max: 1000 }), { minLength: 1, maxLength: 6 }).map(semanal);

  it('la media móvil coincide con recalcular cada ventana', () => {
    fc.assert(
      fc.property(serie, fc.integer({ min: 1, max: 4 }), (lista, ventana) => {
        const { cortes } = analizarTendencia(lista, { ventana });
        cortes.forEach(({ mediaMovil }, posicion) => {
          if (posicion + 1 < ventana) {
            expect(mediaMovil).toBeNull();
          } else {
            const tramo = lista.slice(posicion + 1 - ventana, posicion + 1);
            expect(mediaMovil).toBeCloseTo(tramo.reduce((suma, { valor }) => suma + valor, 0) / ventana, 9);
          }
        });
      }),
      { numRuns: 200, seed: 20260810 },
    );
  });

  it('las sumas prefijas coinciden con sumar directamente', () => {
    fc.assert(
      fc.property(serie, fc.nat(5), fc.nat(5), (lista, uno, otro) => {
        const [inicio, fin] = [Math.min(uno, otro), Math.max(uno, otro)];
        const desde = SEMANAS[inicio];
        const hasta = SEMANAS[fin];
        const esperado = lista
          .filter(({ fecha }) => fecha >= desde && fecha <= hasta)
          .reduce((suma, { valor }) => suma + valor, 0);
        expect(crearSumasPrefijas(lista).totalEntre(desde, hasta)).toBe(esperado);
      }),
      { numRuns: 200, seed: 20260810 },
    );
  });

  it('la pendiente coincide con la fórmula centrada en la media', () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(fc.integer({ min: 0, max: 400 }), fc.integer({ min: -500, max: 500 })), {
          minLength: 2,
          maxLength: 20,
        }),
        (puntos) => {
          const equis = puntos.map(([x]) => x);
          const yes = puntos.map(([, y]) => y);
          const mediaX = equis.reduce((suma, x) => suma + x, 0) / equis.length;
          const mediaY = yes.reduce((suma, y) => suma + y, 0) / yes.length;
          const covarianza = equis.reduce(
            (suma, x, posicion) => suma + (x - mediaX) * (yes[posicion] - mediaY),
            0,
          );
          const varianza = equis.reduce((suma, x) => suma + (x - mediaX) ** 2, 0);
          const pendiente = pendienteMinimosCuadrados(equis, yes);
          if (varianza === 0) {
            expect(pendiente).toBeNull();
          } else {
            expect(pendiente).toBeCloseTo(covarianza / varianza, 6);
          }
        },
      ),
      { numRuns: 200, seed: 20260810 },
    );
  });
});
