import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  crearAutocompletado,
  crearAutocompletadoOrdenado,
  crearIndiceInvertido,
  intersectar,
  limiteInferior,
  limiteSuperior,
} from '../../../backend/src/algorithms/busqueda.js';

const MUNICIPIOS = [
  { codigo: '27361', nombre: 'San José del Palmar' },
  { codigo: '88001', nombre: 'San Andrés' },
  { codigo: '47001', nombre: 'Santa Marta' },
  { codigo: '11001', nombre: 'Bogotá, D. C.' },
  { codigo: '52399', nombre: 'La Unión' },
  { codigo: '76400', nombre: 'La Unión' },
  { codigo: '86568', nombre: 'Puerto Asís' },
  { codigo: '05001', nombre: 'Medellín' },
];

const FILAS = [
  { departamento: '27', municipio: '27361', categoria: 'VIVIENDA', periodo: '2026-08-17', valor: 1 },
  { departamento: '27', municipio: '27001', categoria: 'SALUD', periodo: '2026-08-24', valor: 2 },
  { departamento: '76', municipio: '76001', categoria: 'VIVIENDA', periodo: '2026-08-10', valor: 3 },
  { departamento: '27', municipio: '27361', categoria: 'SALUD', periodo: '2026-08-31', valor: 4 },
  { departamento: '27', municipio: '27361', categoria: 'VIVIENDA', periodo: '2026-09-07', valor: 5 },
  { departamento: '76', municipio: '76001', categoria: 'SALUD', periodo: '2026-09-07', valor: 6 },
];

describe('búsqueda binaria', () => {
  it('ubica el primer elemento mayor o igual y el primero mayor', () => {
    const arreglo = [1, 3, 3, 3, 7, 9];
    expect([limiteInferior(arreglo, 3), limiteSuperior(arreglo, 3)]).toEqual([1, 4]);
    expect([limiteInferior(arreglo, 0), limiteSuperior(arreglo, 10)]).toEqual([0, 6]);
    expect([limiteInferior([], 5), limiteSuperior([], 5)]).toEqual([0, 0]);
  });

  it('interseca listas ordenadas', () => {
    expect(intersectar([1, 3, 5, 7], [3, 4, 5, 8])).toEqual([3, 5]);
    expect(intersectar([2, 4], [])).toEqual([]);
    expect(intersectar([5, 9, 12], [1, 2, 5, 6, 9, 10, 12])).toEqual([5, 9, 12]);
  });
});

describe('índice invertido', () => {
  const indice = crearIndiceInvertido(FILAS, {
    atributos: ['departamento', 'municipio', 'categoria'],
    periodo: 'periodo',
  });
  const valores = (filas) => filas.map(({ valor }) => valor);

  it('combina filtros y periodo', () => {
    expect(valores(indice.filtrar({ municipio: '27361', categoria: 'VIVIENDA' }))).toEqual([1, 5]);
    expect(
      valores(indice.filtrar({ departamento: '27' }, { desde: '2026-08-20', hasta: '2026-08-31' })),
    ).toEqual([2, 4]);
    expect(valores(indice.filtrar({}, { desde: '2026-09-07' }))).toEqual([5, 6]);
    expect(valores(indice.filtrar())).toEqual([3, 1, 2, 4, 5, 6]);
  });

  it('devuelve vacío ante un valor inexistente o un periodo sin datos', () => {
    expect(indice.filtrar({ municipio: '99999' })).toEqual([]);
    expect(indice.filtrar({ departamento: '27' }, { desde: '2026-12-01', hasta: '2026-12-31' })).toEqual([]);
    expect(indice.filtrar({}, { desde: '2026-09-01', hasta: '2026-08-01' })).toEqual([]);
  });

  it('ignora los filtros vacíos y rechaza atributos no indexados', () => {
    expect(indice.filtrar({ municipio: undefined, categoria: null })).toHaveLength(6);
    expect(() => indice.filtrar({ nombre: 'x' })).toThrow(RangeError);
  });

  it('coincide con recorrer todas las filas', () => {
    const fila = fc.record({
      departamento: fc.constantFrom('05', '27', '76'),
      municipio: fc.constantFrom('05001', '27001', '27361', '76001'),
      categoria: fc.constantFrom('SALUD', 'VIVIENDA', 'EDUCACION'),
      periodo: fc.constantFrom('2026-08-10', '2026-08-17', '2026-08-24', '2026-08-31'),
    });
    fc.assert(
      fc.property(
        fc.array(fila, { maxLength: 80 }),
        fc.record({
          departamento: fc.option(fc.constantFrom('05', '27', '76'), { nil: undefined }),
          categoria: fc.option(fc.constantFrom('SALUD', 'VIVIENDA'), { nil: undefined }),
        }),
        fc.constantFrom('2026-08-10', '2026-08-17', '2026-08-24'),
        fc.constantFrom('2026-08-17', '2026-08-31'),
        (filas, filtros, desde, hasta) => {
          const numeradas = filas.map((elemento, posicion) => ({ ...elemento, posicion }));
          const resultado = crearIndiceInvertido(numeradas, {
            atributos: ['departamento', 'categoria'],
            periodo: 'periodo',
          })
            .filtrar(filtros, { desde, hasta })
            .map(({ posicion }) => posicion)
            .sort((uno, otro) => uno - otro);
          const esperado = numeradas
            .filter(
              (elemento) =>
                (!filtros.departamento || elemento.departamento === filtros.departamento) &&
                (!filtros.categoria || elemento.categoria === filtros.categoria) &&
                elemento.periodo >= desde &&
                elemento.periodo <= hasta,
            )
            .map(({ posicion }) => posicion);
          expect(resultado).toEqual(esperado);
        },
      ),
      { numRuns: 200, seed: 20260810 },
    );
  });
});

describe('autocompletado de municipios', () => {
  const autocompletado = crearAutocompletado(MUNICIPIOS);
  const nombres = (prefijo, limite) => autocompletado.sugerir(prefijo, limite).map(({ codigo }) => codigo);

  it('sugiere primero los nombres que empiezan por el texto, en orden alfabético', () => {
    expect(nombres('san')).toEqual(['88001', '27361', '47001']);
  });

  it('encuentra también palabras interiores del nombre', () => {
    expect(nombres('palmar')).toEqual(['27361']);
    expect(nombres('asis')).toEqual(['86568']);
  });

  it('no distingue tildes, mayúsculas ni signos', () => {
    expect(nombres('BOGOTÁ')).toEqual(['11001']);
    expect(nombres('medellin')).toEqual(['05001']);
    expect(nombres('la union')).toEqual(['52399', '76400']);
  });

  it('respeta el límite y no repite municipios', () => {
    expect(nombres('san', 2)).toEqual(['88001', '27361']);
    expect(nombres('san andres')).toEqual(['88001']);
  });

  it('devuelve vacío sin texto o sin coincidencias', () => {
    expect(nombres('')).toEqual([]);
    expect(nombres('   ')).toEqual([]);
    expect(nombres('xyz')).toEqual([]);
    expect(nombres('san', 0)).toEqual([]);
  });

  it('coincide con la alternativa de arreglo ordenado en los nombres completos', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.stringMatching(/^[A-C]{1,5}( [A-C]{1,4})?$/), { maxLength: 50 }),
        fc.stringMatching(/^[A-C]{1,2}$/),
        (lista, prefijo) => {
          const entradas = lista.map((nombre, posicion) => ({ codigo: String(posicion), nombre }));
          const esperado = crearAutocompletadoOrdenado(entradas).sugerir(prefijo, 1000);
          const completos = crearAutocompletado(entradas)
            .sugerir(prefijo, 1000)
            .filter(({ nombre }) => nombre.startsWith(prefijo));
          expect(completos).toEqual(esperado);
        },
      ),
      { numRuns: 200, seed: 20260810 },
    );
  });
});
