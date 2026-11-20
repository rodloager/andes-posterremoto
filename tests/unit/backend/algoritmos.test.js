import { describe, expect, it } from 'vitest';
import { MonticuloMinimo } from '../../../backend/src/algorithms/estructuras/monticulo.js';
import { seleccionarMayores } from '../../../backend/src/algorithms/mayores.js';

function generadorPseudoaleatorio(semilla) {
  let estado = semilla >>> 0;
  return () => {
    estado = (Math.imul(estado, 1_664_525) + 1_013_904_223) >>> 0;
    return estado / 2 ** 32;
  };
}

const porNumero = (uno, otro) => uno - otro;

describe('montículo mínimo', () => {
  it('entrega los elementos en orden ascendente', () => {
    const azar = generadorPseudoaleatorio(7);
    const valores = Array.from({ length: 500 }, () => Math.floor(azar() * 100));
    const monticulo = new MonticuloMinimo(porNumero);
    valores.forEach((valor) => monticulo.insertar(valor));
    const extraidos = Array.from({ length: valores.length }, () => monticulo.extraerMinimo());
    expect(extraidos).toEqual([...valores].sort(porNumero));
    expect(monticulo.tamano).toBe(0);
  });

  it('informa el mínimo sin retirarlo', () => {
    const monticulo = new MonticuloMinimo(porNumero);
    [5, 3, 8].forEach((valor) => monticulo.insertar(valor));
    expect(monticulo.minimo()).toBe(3);
    expect(monticulo.tamano).toBe(3);
  });

  it('reemplaza el mínimo y conserva el orden', () => {
    const monticulo = new MonticuloMinimo(porNumero);
    [4, 1, 7, 3].forEach((valor) => monticulo.insertar(valor));
    expect(monticulo.reemplazarMinimo(6)).toBe(1);
    expect(Array.from({ length: 4 }, () => monticulo.extraerMinimo())).toEqual([3, 4, 6, 7]);
  });

  it('se comporta de forma segura cuando está vacío', () => {
    const monticulo = new MonticuloMinimo(porNumero);
    expect(monticulo.minimo()).toBeUndefined();
    expect(monticulo.extraerMinimo()).toBeUndefined();
    expect(monticulo.reemplazarMinimo(2)).toBeUndefined();
    expect(monticulo.minimo()).toBe(2);
  });
});

describe('selección de los k mayores', () => {
  const porNombre = (uno, otro) => uno.nombre.localeCompare(otro.nombre);
  const puntaje = (elemento) => elemento.total;

  function porOrdenamiento(elementos, cantidad) {
    return [...elementos]
      .sort((uno, otro) => otro.total - uno.total || porNombre(uno, otro))
      .slice(0, Math.max(0, cantidad));
  }

  it.each([1, 7, 13])('coincide con ordenar todo y recortar (semilla %i)', (semilla) => {
    const azar = generadorPseudoaleatorio(semilla);
    const elementos = Array.from({ length: 300 }, (_, indice) => ({
      nombre: `ruta-${indice.toString().padStart(3, '0')}`,
      total: Math.floor(azar() * 40),
    }));
    for (const cantidad of [0, 1, 10, 299, 300, 450]) {
      expect(seleccionarMayores(elementos, cantidad, puntaje, porNombre)).toEqual(
        porOrdenamiento(elementos, cantidad),
      );
    }
  });

  it('desempata por nombre en orden alfabético', () => {
    const elementos = [
      { nombre: 'c', total: 5 },
      { nombre: 'a', total: 5 },
      { nombre: 'b', total: 5 },
      { nombre: 'd', total: 9 },
    ];
    expect(seleccionarMayores(elementos, 3, puntaje, porNombre).map(({ nombre }) => nombre)).toEqual([
      'd',
      'a',
      'b',
    ]);
  });

  it('devuelve una lista vacía cuando no hay elementos o se piden cero', () => {
    expect(seleccionarMayores([], 5, puntaje)).toEqual([]);
    expect(seleccionarMayores([{ nombre: 'a', total: 1 }], 0, puntaje)).toEqual([]);
    expect(seleccionarMayores([{ nombre: 'a', total: 1 }], -3, puntaje)).toEqual([]);
  });

  it('no modifica la lista original', () => {
    const elementos = [3, 1, 2].map((total) => ({ nombre: String(total), total }));
    const copia = structuredClone(elementos);
    seleccionarMayores(elementos, 2, puntaje, porNombre);
    expect(elementos).toEqual(copia);
  });

  it('en el peor caso hace a lo sumo n·(1 + 2⌈log₂ k⌉) + 2k⌈log₂ k⌉ comparaciones', () => {
    const cantidadTotal = 10_000;
    const cantidad = 10;
    const ascendentes = Array.from({ length: cantidadTotal }, (_, indice) => ({
      nombre: String(indice),
      total: indice,
    }));
    let llamadasAlPuntaje = 0;
    const contarPuntaje = (elemento) => {
      llamadasAlPuntaje += 1;
      return elemento.total;
    };
    const seleccionados = seleccionarMayores(ascendentes, cantidad, contarPuntaje);
    const niveles = Math.ceil(Math.log2(cantidad));
    expect(seleccionados.map(({ total }) => total)).toEqual(
      Array.from({ length: cantidad }, (_, indice) => cantidadTotal - 1 - indice),
    );
    expect(llamadasAlPuntaje / 2).toBeLessThanOrEqual(
      cantidadTotal * (1 + 2 * niveles) + 2 * cantidad * niveles,
    );
  });
});
