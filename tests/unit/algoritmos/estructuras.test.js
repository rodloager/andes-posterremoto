import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { ColaCircular } from '../../../backend/src/algorithms/estructuras/colaCircular.js';
import { ConjuntosDisjuntos } from '../../../backend/src/algorithms/estructuras/conjuntosDisjuntos.js';
import { Trie } from '../../../backend/src/algorithms/estructuras/trie.js';

const CONFIGURACION = { numRuns: 200, seed: 20260810 };

function componentesIngenuos(cantidad, uniones) {
  const vecinos = Array.from({ length: cantidad }, () => []);
  for (const [uno, otro] of uniones) {
    vecinos[uno].push(otro);
    vecinos[otro].push(uno);
  }
  const componente = new Array(cantidad).fill(-1);
  let actual = 0;
  for (let inicio = 0; inicio < cantidad; inicio += 1) {
    if (componente[inicio] !== -1) {
      continue;
    }
    const pendientes = [inicio];
    componente[inicio] = actual;
    while (pendientes.length > 0) {
      const nodo = pendientes.pop();
      for (const vecino of vecinos[nodo]) {
        if (componente[vecino] === -1) {
          componente[vecino] = actual;
          pendientes.push(vecino);
        }
      }
    }
    actual += 1;
  }
  return { componente, cantidad: actual };
}

describe('conjuntos disjuntos', () => {
  it('une de forma transitiva y cuenta los componentes', () => {
    const conjuntos = new ConjuntosDisjuntos(6);
    expect(conjuntos.unir(0, 1)).toBe(true);
    expect(conjuntos.unir(1, 2)).toBe(true);
    expect(conjuntos.unir(0, 2)).toBe(false);
    conjuntos.unir(4, 5);
    expect(conjuntos.conectados(0, 2)).toBe(true);
    expect(conjuntos.conectados(2, 3)).toBe(false);
    expect(conjuntos.componentes).toBe(3);
    expect(conjuntos.grupos({ minimo: 2 })).toEqual([
      [0, 1, 2],
      [4, 5],
    ]);
    expect(conjuntos.grupos()).toHaveLength(3);
  });

  it('acepta un conjunto vacío', () => {
    const conjuntos = new ConjuntosDisjuntos(0);
    expect(conjuntos.componentes).toBe(0);
    expect(conjuntos.grupos()).toEqual([]);
  });

  it.each([-1, 1.5, '3', null])('rechaza la cantidad %s', (cantidad) => {
    expect(() => new ConjuntosDisjuntos(cantidad)).toThrow(RangeError);
  });

  it.each([-1, 3, 0.5, undefined])('rechaza el elemento inexistente %s', (elemento) => {
    expect(() => new ConjuntosDisjuntos(3).buscar(elemento)).toThrow(RangeError);
  });

  it('coincide con un recorrido en anchura sobre el grafo de uniones', () => {
    fc.assert(
      fc.property(
        fc
          .integer({ min: 1, max: 60 })
          .chain((cantidad) =>
            fc.tuple(
              fc.constant(cantidad),
              fc.array(fc.tuple(fc.nat(cantidad - 1), fc.nat(cantidad - 1)), { maxLength: 80 }),
            ),
          ),
        ([cantidad, uniones]) => {
          const conjuntos = new ConjuntosDisjuntos(cantidad);
          uniones.forEach(([uno, otro]) => conjuntos.unir(uno, otro));
          const ingenuo = componentesIngenuos(cantidad, uniones);
          expect(conjuntos.componentes).toBe(ingenuo.cantidad);
          for (let uno = 0; uno < cantidad; uno += 1) {
            for (let otro = uno + 1; otro < cantidad; otro += 1) {
              expect(conjuntos.conectados(uno, otro)).toBe(
                ingenuo.componente[uno] === ingenuo.componente[otro],
              );
            }
          }
        },
      ),
      CONFIGURACION,
    );
  });
});

describe('trie', () => {
  function trieDeEjemplo() {
    const trie = new Trie();
    for (const clave of ['SANTA MARTA', 'SAN ANDRES', 'SAN JOSE DEL PALMAR', 'SABANALARGA', 'CALI']) {
      trie.insertar(clave, clave);
    }
    trie.insertar('LA UNION', 'LA UNION (NARIÑO)');
    trie.insertar('LA UNION', 'LA UNION (VALLE)');
    return trie;
  }

  it('devuelve las claves con un prefijo en orden alfabético', () => {
    expect(trieDeEjemplo().buscarPrefijo('SA')).toEqual([
      'SABANALARGA',
      'SAN ANDRES',
      'SAN JOSE DEL PALMAR',
      'SANTA MARTA',
    ]);
  });

  it('respeta el límite y conserva los valores que comparten clave', () => {
    const trie = trieDeEjemplo();
    expect(trie.buscarPrefijo('SAN', 2)).toEqual(['SAN ANDRES', 'SAN JOSE DEL PALMAR']);
    expect(trie.buscarPrefijo('LA U')).toEqual(['LA UNION (NARIÑO)', 'LA UNION (VALLE)']);
    expect(trie.claves).toBe(6);
  });

  it('distingue las claves completas de los prefijos', () => {
    const trie = trieDeEjemplo();
    expect(trie.contiene('CALI')).toBe(true);
    expect(trie.contiene('CAL')).toBe(false);
    expect(trie.buscarPrefijo('BOGOTA')).toEqual([]);
    expect(trie.buscarPrefijo('SA', 0)).toEqual([]);
  });

  it('coincide con filtrar y ordenar todas las claves', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.stringMatching(/^[A-D]{1,6}$/), { maxLength: 40 }),
        fc.stringMatching(/^[A-D]{0,3}$/),
        (claves, prefijo) => {
          const trie = new Trie();
          claves.forEach((clave) => trie.insertar(clave, clave));
          const esperado = claves.filter((clave) => clave.startsWith(prefijo)).sort();
          expect(trie.buscarPrefijo(prefijo)).toEqual(esperado);
        },
      ),
      CONFIGURACION,
    );
  });
});

describe('cola circular', () => {
  it('atiende en orden de llegada y reutiliza las posiciones', () => {
    const cola = new ColaCircular(3);
    [1, 2, 3].forEach((valor) => cola.encolar(valor));
    expect(cola.llena).toBe(true);
    expect(cola.desencolar()).toBe(1);
    cola.encolar(4);
    expect(cola.valores()).toEqual([2, 3, 4]);
    expect(cola.primero()).toBe(2);
    expect([cola.desencolar(), cola.desencolar(), cola.desencolar(), cola.desencolar()]).toEqual([
      2,
      3,
      4,
      undefined,
    ]);
    expect(cola.tamano).toBe(0);
    expect(cola.primero()).toBeUndefined();
  });

  it('rechaza encolar cuando está llena y capacidades inválidas', () => {
    const cola = new ColaCircular(1);
    cola.encolar('a');
    expect(() => cola.encolar('b')).toThrow(RangeError);
    expect(() => new ColaCircular(0)).toThrow(RangeError);
    expect(() => new ColaCircular(2.5)).toThrow(RangeError);
  });
});
