import { performance } from 'node:perf_hooks';
import { pendienteMinimosCuadrados } from '../../backend/src/algorithms/tendencias.js';

export const RANGOS = Object.freeze({
  constante: Object.freeze([-0.3, 0.3]),
  logaritmico: Object.freeze([-0.3, 0.4]),
  lineal: Object.freeze([0.8, 1.25]),
  subcuadratico: Object.freeze([0.9, 2]),
  linearitmico: Object.freeze([0.9, 1.4]),
  cuadratico: Object.freeze([1.75, 2.25]),
});

let sumidero = 0;

export function consumir(resultado) {
  sumidero = (sumidero + (typeof resultado === 'number' ? resultado : (resultado?.length ?? 1))) % 1_000_003;
  return sumidero;
}

export function mediana(valores) {
  if (valores.length === 0) {
    throw new RangeError('Se necesita al menos una medición.');
  }
  const ordenados = [...valores].sort((uno, otro) => uno - otro);
  const mitad = Math.floor(ordenados.length / 2);
  return ordenados.length % 2 === 1 ? ordenados[mitad] : (ordenados[mitad - 1] + ordenados[mitad]) / 2;
}

export function medirTiempo(ejecutar, { repeticiones = 5, calentamiento = 1 } = {}) {
  if (!Number.isInteger(repeticiones) || repeticiones < 1) {
    throw new RangeError('Las repeticiones deben ser un entero positivo.');
  }
  for (let vuelta = 0; vuelta < calentamiento; vuelta += 1) {
    consumir(ejecutar());
  }
  const tiempos = [];
  for (let vuelta = 0; vuelta < repeticiones; vuelta += 1) {
    globalThis.gc?.();
    const inicio = performance.now();
    const resultado = ejecutar();
    tiempos.push(performance.now() - inicio);
    consumir(resultado);
  }
  return { mediana: mediana(tiempos), minimo: Math.min(...tiempos), maximo: Math.max(...tiempos) };
}

export const tamanosDuplicados = (inicial, cantidad) =>
  Array.from({ length: cantidad }, (valor, posicion) => inicial * 2 ** posicion);

export function analizarDuplicacion(puntos) {
  if (puntos.length < 2) {
    throw new RangeError('El experimento de duplicación necesita al menos dos tamaños.');
  }
  if (puntos.some(({ n, ms }) => !(n > 0) || !(ms > 0))) {
    throw new RangeError('Los tamaños y los tiempos deben ser positivos.');
  }
  const razones = puntos.slice(1).map((punto, posicion) => punto.ms / puntos[posicion].ms);
  const exponente = pendienteMinimosCuadrados(
    puntos.map(({ n }) => Math.log2(n)),
    puntos.map(({ ms }) => Math.log2(ms)),
  );
  return { razones, exponente };
}

export const coincide = (exponente, [minimo, maximo]) => exponente >= minimo && exponente <= maximo;
