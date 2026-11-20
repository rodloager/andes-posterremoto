import { describe, expect, it } from 'vitest';
import {
  calcularCortes,
  clasificar,
  describirRangos,
} from '../../../frontend/public/js/nucleo/clasificacion.js';

const texto = (valor) => String(valor);

describe('calcularCortes', () => {
  it('no produce cortes sin valores positivos', () => {
    expect(calcularCortes([], 5)).toEqual([]);
    expect(calcularCortes([0, 0], 5)).toEqual([]);
  });

  it('reparte los valores en clases de tamaño similar', () => {
    const valores = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(calcularCortes(valores, 5)).toEqual([3, 5, 7, 9]);
  });

  it('elimina los cortes repetidos', () => {
    expect(calcularCortes([1, 1, 2, 2, 2, 2, 9, 9], 4)).toEqual([2, 9]);
  });

  it('deja una sola clase cuando casi todos los valores son iguales', () => {
    expect(calcularCortes([1, 1, 1, 1, 1, 50], 5)).toEqual([]);
  });

  it('ignora el orden de entrada', () => {
    expect(calcularCortes([10, 1, 5, 3, 8], 2)).toEqual(calcularCortes([1, 3, 5, 8, 10], 2));
  });
});

describe('clasificar', () => {
  const cortes = [10, 100];

  it('ubica cada valor en su clase', () => {
    expect(clasificar(5, cortes)).toBe(0);
    expect(clasificar(10, cortes)).toBe(1);
    expect(clasificar(99, cortes)).toBe(1);
    expect(clasificar(100, cortes)).toBe(2);
  });

  it('usa una sola clase cuando no hay cortes', () => {
    expect(clasificar(7, [])).toBe(0);
  });
});

describe('describirRangos', () => {
  it('describe cada clase con sus límites', () => {
    expect(describirRangos([10, 100], 1, texto)).toEqual(['1 a 9', '10 a 99', '100 o más']);
  });

  it('nombra con un solo número la clase de un único valor', () => {
    expect(describirRangos([2], 1, texto)).toEqual(['1', '2 o más']);
  });

  it('produce tantos rangos como clases', () => {
    const cortes = calcularCortes([4, 8, 15, 16, 23, 42], 3);
    expect(describirRangos(cortes, 4, texto)).toHaveLength(cortes.length + 1);
  });
});
