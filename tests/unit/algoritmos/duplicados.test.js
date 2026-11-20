import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  agruparPares,
  crearComparador,
  detectarDuplicados,
  distanciaDeEdicion,
  similitudDeTexto,
} from '../../../backend/src/algorithms/duplicados.js';

function distanciaCompleta(uno, otro) {
  const matriz = Array.from({ length: uno.length + 1 }, (_, fila) =>
    Array.from({ length: otro.length + 1 }, (_, columna) =>
      fila === 0 ? columna : columna === 0 ? fila : 0,
    ),
  );
  for (let fila = 1; fila <= uno.length; fila += 1) {
    for (let columna = 1; columna <= otro.length; columna += 1) {
      const costo = uno[fila - 1] === otro[columna - 1] ? 0 : 1;
      matriz[fila][columna] = Math.min(
        matriz[fila - 1][columna] + 1,
        matriz[fila][columna - 1] + 1,
        matriz[fila - 1][columna - 1] + costo,
      );
    }
  }
  return matriz[uno.length][otro.length];
}

const comparar = crearComparador({
  campos: [
    { nombre: 'nombre', peso: 0.8, tipo: 'texto' },
    { nombre: 'sexo', peso: 0.2, tipo: 'exacto' },
  ],
  minimo: 0.8,
});

const OPCIONES = {
  identificador: (registro) => registro.documento,
  claveNatural: (registro) => `${registro.nombre}|${registro.edad}|${registro.municipio}`,
  claveDeBloque: (registro) => `${registro.municipio}|${registro.edad}|${registro.nombre[0]}`,
  comparar,
  umbralDuplicado: 0.92,
  umbralRevision: 0.8,
};

const persona = (documento, nombre, edad, municipio, sexo) => ({ documento, nombre, edad, municipio, sexo });

const REGISTROS = [
  persona('1001', 'MARIA LOPEZ GOMEZ', 30, '27361', 'F'),
  persona('1001', 'MARIA LOPEZ GOMEZ', 30, '27361', 'F'),
  persona('2002', 'MARIA LOPEZ GOMEZ', 30, '27361', 'F'),
  persona('3003', 'MARIA LOPES GOMEZ', 30, '27361', 'F'),
  persona('4004', 'MARIA LOPEZ', 30, '27361', 'F'),
  persona('5005', 'JUAN CARLOS RIOS', 45, '76001', 'M'),
  persona('6006', 'JUAN CARLOS RUIZ', 45, '76001', 'M'),
  persona('7007', 'JUAN CARLOS RIOS', 45, '76001', 'M'),
];

describe('distancia de edición', () => {
  it.each([
    ['KITTEN', 'SITTING', 3],
    ['', 'ABC', 3],
    ['ABC', 'ABC', 0],
    ['FLAW', 'LAWN', 2],
    ['RIOS', 'RUIZ', 3],
  ])('entre %s y %s es %i', (uno, otro, distancia) => {
    expect(distanciaDeEdicion(uno, otro)).toBe(distancia);
    expect(distanciaDeEdicion(otro, uno)).toBe(distancia);
  });

  it('se detiene en cuanto supera la distancia máxima', () => {
    expect(distanciaDeEdicion('KITTEN', 'SITTING', 2)).toBe(3);
    expect(distanciaDeEdicion('KITTEN', 'SITTING', 3)).toBe(3);
    expect(distanciaDeEdicion('A', 'ABCDEFGH', 2)).toBe(3);
  });

  it('con banda coincide con la matriz completa', () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/^[ABC]{0,12}$/),
        fc.stringMatching(/^[ABC]{0,12}$/),
        fc.integer({ min: 0, max: 14 }),
        (uno, otro, maximo) => {
          const completa = distanciaCompleta(uno, otro);
          const acotada = distanciaDeEdicion(uno, otro, maximo);
          if (completa <= maximo) {
            expect(acotada).toBe(completa);
          } else {
            expect(acotada).toBeGreaterThan(maximo);
          }
        },
      ),
      { numRuns: 500, seed: 20260810 },
    );
  });

  it('cumple la desigualdad triangular', () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/^[AB]{0,8}$/),
        fc.stringMatching(/^[AB]{0,8}$/),
        fc.stringMatching(/^[AB]{0,8}$/),
        (uno, otro, tercero) => {
          expect(distanciaDeEdicion(uno, tercero)).toBeLessThanOrEqual(
            distanciaDeEdicion(uno, otro) + distanciaDeEdicion(otro, tercero),
          );
        },
      ),
      { numRuns: 300, seed: 20260810 },
    );
  });
});

describe('similitud', () => {
  it('convierte la distancia en una proporción', () => {
    expect(similitudDeTexto('JOSE PEREZ', 'JOSE PERES')).toBeCloseTo(0.9);
    expect(similitudDeTexto('', '')).toBe(1);
  });

  it('combina el nombre con los campos exactos según sus pesos', () => {
    expect(
      comparar(persona('', 'JOSE PEREZ', 1, '', 'F'), persona('', 'JOSE PERES', 1, '', 'F')).valor,
    ).toBeCloseTo(0.92);
    expect(
      comparar(persona('', 'JOSE PEREZ', 1, '', 'F'), persona('', 'JOSE PERES', 1, '', 'M')).valor,
    ).toBeCloseTo(0.72);
  });

  it('no cuenta como coincidencia dos campos vacíos', () => {
    expect(comparar(persona('', 'ANA', 1, '', null), persona('', 'ANA', 1, '', null)).detalle.sexo).toBe(0);
  });

  it('rechaza pesos inválidos', () => {
    expect(() => crearComparador({ campos: [{ nombre: 'x', peso: -1, tipo: 'exacto' }] })).toThrow(
      RangeError,
    );
    expect(() => crearComparador({ campos: [] })).toThrow(RangeError);
  });
});

describe('detección de duplicados', () => {
  const resultado = detectarDuplicados(REGISTROS, OPCIONES);

  it('separa los exactos por identificador y por clave natural', () => {
    expect(resultado.exactos).toEqual([
      { posicion: 1, original: 0, motivo: 'IDENTIFICADOR' },
      { posicion: 2, original: 0, motivo: 'CLAVE_NATURAL' },
      { posicion: 7, original: 5, motivo: 'CLAVE_NATURAL' },
    ]);
  });

  it('agrupa de forma transitiva los confirmados', () => {
    expect(resultado.grupos).toEqual([
      [0, 1, 2, 3],
      [5, 7],
    ]);
    expect(resultado.unicos).toBe(4);
  });

  it('envía a revisión los pares entre los dos umbrales', () => {
    expect(resultado.revision).toHaveLength(1);
    expect(resultado.revision[0]).toMatchObject({ uno: 5, otro: 6 });
    expect(resultado.revision[0].similitud).toBeCloseTo(0.85);
  });

  it('solo compara los registros que comparten bloque', () => {
    expect(resultado.comparaciones).toBe(4);
    expect(resultado.bloques).toBe(2);
  });

  it('no encuentra nada en una lista vacía', () => {
    expect(detectarDuplicados([], OPCIONES)).toMatchObject({
      grupos: [],
      exactos: [],
      revision: [],
      unicos: 0,
    });
  });

  it('rechaza umbrales invertidos', () => {
    expect(() => detectarDuplicados(REGISTROS, { ...OPCIONES, umbralRevision: 0.95 })).toThrow(RangeError);
  });

  it('cuenta como exacto cada identificador repetido y nunca agrupa un registro dos veces', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            documento: fc.constantFrom('1', '2', '3', '4', '5', '6'),
            nombre: fc.stringMatching(/^[AB]{3,6}$/),
            edad: fc.integer({ min: 1, max: 3 }),
            municipio: fc.constant('27361'),
            sexo: fc.constantFrom('F', 'M'),
          }),
          { maxLength: 40 },
        ),
        (registros) => {
          const { exactos, grupos } = detectarDuplicados(registros, {
            ...OPCIONES,
            claveNatural: () => null,
          });
          const repetidos = registros.length - new Set(registros.map(({ documento }) => documento)).size;
          expect(exactos.filter(({ motivo }) => motivo === 'IDENTIFICADOR')).toHaveLength(repetidos);
          const miembros = grupos.flat();
          expect(new Set(miembros).size).toBe(miembros.length);
        },
      ),
      { numRuns: 200, seed: 20260810 },
    );
  });
});

describe('agrupación de pares con identificadores dispersos', () => {
  it('forma componentes conexos', () => {
    expect(
      agruparPares([
        [10, 20],
        [20, 30],
        [40, 50],
      ]),
    ).toEqual([
      [10, 20, 30],
      [40, 50],
    ]);
    expect(agruparPares([])).toEqual([]);
  });
});
