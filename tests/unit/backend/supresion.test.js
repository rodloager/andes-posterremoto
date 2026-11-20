import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { suprimirComplementaria, suprimirEnMatriz } from '../../../backend/src/algorithms/supresion.js';

const ocultas = (valores) => valores.filter((valor) => valor === null).length;
const hayVisiblePositiva = (valores) => valores.some((valor) => valor !== null && valor > 0);
const columnasDe = (matriz) => (matriz[0] ?? []).map((_, x) => matriz.map((fila) => fila[x]));

const celdaPublicada = fc.oneof(fc.constant(null), fc.constant(0), fc.integer({ min: 10, max: 5000 }));
const lineaPublicada = fc.array(celdaPublicada, { minLength: 1, maxLength: 12 });
const matrizPublicada = fc
  .tuple(fc.integer({ min: 1, max: 8 }), fc.integer({ min: 1, max: 6 }))
  .chain(([alto, ancho]) =>
    fc.array(fc.array(celdaPublicada, { minLength: ancho, maxLength: ancho }), {
      minLength: alto,
      maxLength: alto,
    }),
  );

describe('supresión complementaria en una partición', () => {
  it('oculta la menor celda visible cuando solo hay una oculta', () => {
    expect(suprimirComplementaria([100, null, 30, 0, 50])).toEqual({
      valores: [100, null, null, 0, 50],
      complementarias: 1,
    });
  });

  it('no toca la partición cuando no hay celdas ocultas o ya hay dos', () => {
    expect(suprimirComplementaria([100, 30, 50]).complementarias).toBe(0);
    expect(suprimirComplementaria([100, null, null, 50]).valores).toEqual([100, null, null, 50]);
  });

  it('no usa los ceros como complemento, porque ocultarlos no protege nada', () => {
    expect(suprimirComplementaria([null, 0, 0])).toEqual({ valores: [null, 0, 0], complementarias: 0 });
  });

  it('nunca deja una sola celda oculta si queda una visible con valor', () => {
    fc.assert(
      fc.property(lineaPublicada, (linea) => {
        const { valores } = suprimirComplementaria(linea);
        expect(ocultas(valores) === 1 && hayVisiblePositiva(valores)).toBe(false);
        valores.forEach((valor, posicion) => {
          if (valor !== null) {
            expect(valor).toBe(linea[posicion]);
          }
        });
      }),
    );
  });
});

describe('supresión complementaria en una matriz', () => {
  it('protege una celda con un rectángulo de cuatro', () => {
    const { valores, complementarias } = suprimirEnMatriz([
      [100, null, 40],
      [80, 60, 20],
      [10, 30, 90],
    ]);
    expect(complementarias).toBe(3);
    expect(valores).toEqual([
      [100, null, null],
      [80, 60, 20],
      [10, null, null],
    ]);
  });

  it('no cambia una matriz sin celdas ocultas', () => {
    const matriz = [
      [10, 20],
      [30, 40],
    ];
    expect(suprimirEnMatriz(matriz)).toEqual({ valores: matriz, complementarias: 0 });
  });

  it('deja cada fila y cada columna con cero o al menos dos celdas ocultas', () => {
    fc.assert(
      fc.property(matrizPublicada, (matriz) => {
        const { valores, complementarias } = suprimirEnMatriz(matriz);
        for (const linea of [...valores, ...columnasDe(valores)]) {
          expect(ocultas(linea) === 1 && hayVisiblePositiva(linea)).toBe(false);
        }
        const antes = matriz.flat();
        const despues = valores.flat();
        expect(ocultas(despues) - ocultas(antes)).toBe(complementarias);
        despues.forEach((valor, posicion) => {
          if (antes[posicion] === null) {
            expect(valor).toBeNull();
          } else if (valor !== null) {
            expect(valor).toBe(antes[posicion]);
          }
        });
      }),
    );
  });
});
