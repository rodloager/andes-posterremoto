import { describe, expect, it } from 'vitest';
import {
  RANGOS,
  analizarDuplicacion,
  coincide,
  mediana,
  medirTiempo,
  tamanosDuplicados,
} from '../../../analytics/benchmarks/duplicacion.js';

const tiemposCon = (costo) => tamanosDuplicados(1000, 6).map((n) => ({ n, ms: costo(n) }));

describe('experimento de duplicación', () => {
  it('genera los tamaños duplicando el inicial', () => {
    expect(tamanosDuplicados(125, 5)).toEqual([125, 250, 500, 1000, 2000]);
  });

  it.each([
    ['constante', () => 5, 0, 1],
    ['lineal', (n) => 3 * n, 1, 2],
    ['cuadrático', (n) => n * n, 2, 4],
    ['cúbico', (n) => n ** 3, 3, 8],
  ])('estima el exponente y la razón de un costo %s', (descripcion, costo, exponente, razon) => {
    const resultado = analizarDuplicacion(tiemposCon(costo));
    expect(resultado.exponente).toBeCloseTo(exponente, 10);
    for (const valor of resultado.razones) {
      expect(valor).toBeCloseTo(razon, 10);
    }
  });

  it('un costo n log n queda entre lineal y cuadrático, cerca de lineal', () => {
    const { exponente } = analizarDuplicacion(tiemposCon((n) => n * Math.log2(n)));
    expect(exponente).toBeGreaterThan(1);
    expect(coincide(exponente, RANGOS.linearitmico)).toBe(true);
    expect(coincide(exponente, RANGOS.cuadratico)).toBe(false);
  });

  it('rechaza experimentos con menos de dos tamaños o tiempos no positivos', () => {
    expect(() => analizarDuplicacion([{ n: 10, ms: 1 }])).toThrow(RangeError);
    expect(() =>
      analizarDuplicacion([
        { n: 10, ms: 1 },
        { n: 20, ms: 0 },
      ]),
    ).toThrow(RangeError);
  });
});

describe('estadísticos de la medición', () => {
  it('calcula la mediana de una cantidad par e impar de valores', () => {
    expect(mediana([3, 1, 2])).toBe(2);
    expect(mediana([4, 1, 3, 2])).toBe(2.5);
    expect(() => mediana([])).toThrow(RangeError);
  });

  it('ejecuta el calentamiento y luego las repeticiones pedidas', () => {
    let llamadas = 0;
    const tiempo = medirTiempo(
      () => {
        llamadas += 1;
        return llamadas;
      },
      { repeticiones: 4, calentamiento: 2 },
    );
    expect(llamadas).toBe(6);
    expect(tiempo.minimo).toBeLessThanOrEqual(tiempo.mediana);
    expect(tiempo.mediana).toBeLessThanOrEqual(tiempo.maximo);
    expect(() => medirTiempo(() => 1, { repeticiones: 0 })).toThrow(RangeError);
  });
});
