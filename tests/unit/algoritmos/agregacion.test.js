import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  CODIGO_NACIONAL,
  combinarNiveles,
  crearAgregador,
  suprimirCeldasPequenas,
} from '../../../backend/src/algorithms/agregacion.js';

const DIMENSIONES = [
  { nombre: 'sexo', categorias: (registro) => registro.sexo },
  { nombre: 'vulnerabilidad', categorias: (registro) => registro.vulnerabilidades },
];

const REGISTROS = [
  { municipio: '27361', sexo: 'F', edad: 30, vulnerabilidades: ['DISCAPACIDAD'] },
  { municipio: '27361', sexo: 'M', edad: 70, vulnerabilidades: ['DISCAPACIDAD', 'ADULTO_MAYOR'] },
  { municipio: '27001', sexo: 'F', edad: 5, vulnerabilidades: [] },
  { municipio: '76001', sexo: 'F', edad: 40, vulnerabilidades: [] },
];

function agregar(registros) {
  const agregador = crearAgregador({ dimensiones: DIMENSIONES, valor: (registro) => registro.edad });
  registros.forEach((registro) => agregador.agregar(registro));
  return agregador;
}

const buscar = (celdas, nivel, territorio, dimension, categoria) =>
  celdas.find(
    (celda) =>
      celda.nivel === nivel &&
      celda.territorio === territorio &&
      celda.dimension === dimension &&
      celda.categoria === categoria,
  );

const sinNivel = ({ territorio, dimension, categoria, cantidad, suma }) => ({
  territorio,
  dimension,
  categoria,
  cantidad,
  suma,
});

describe('agregación por territorio', () => {
  const celdas = agregar(REGISTROS).resultado();

  it('calcula cantidad, suma, promedio y porcentaje en el municipio', () => {
    expect(buscar(celdas, 'MUNICIPIO', '27361', 'total', 'TOTAL')).toMatchObject({
      cantidad: 2,
      suma: 100,
      promedio: 50,
    });
    expect(buscar(celdas, 'MUNICIPIO', '27361', 'sexo', 'F')).toMatchObject({ cantidad: 1, porcentaje: 0.5 });
  });

  it('obtiene el departamento combinando municipios, sin releer los registros', () => {
    expect(buscar(celdas, 'DEPARTAMENTO', '27', 'total', 'TOTAL')).toMatchObject({
      cantidad: 3,
      suma: 105,
      promedio: 35,
    });
    expect(buscar(celdas, 'DEPARTAMENTO', '27', 'sexo', 'F').porcentaje).toBeCloseTo(2 / 3);
  });

  it('obtiene el total nacional', () => {
    expect(buscar(celdas, 'NACIONAL', CODIGO_NACIONAL, 'total', 'TOTAL')).toMatchObject({
      cantidad: 4,
      suma: 145,
    });
    expect(buscar(celdas, 'NACIONAL', CODIGO_NACIONAL, 'sexo', 'F').porcentaje).toBe(0.75);
  });

  it('cuenta una vez cada categoría no excluyente', () => {
    expect(buscar(celdas, 'NACIONAL', CODIGO_NACIONAL, 'vulnerabilidad', 'DISCAPACIDAD')).toMatchObject({
      cantidad: 2,
      porcentaje: 0.5,
    });
    expect(buscar(celdas, 'NACIONAL', CODIGO_NACIONAL, 'vulnerabilidad', 'ADULTO_MAYOR').cantidad).toBe(1);
  });

  it('informa cuántos registros y grupos procesó', () => {
    const agregador = agregar(REGISTROS);
    expect(agregador.registros).toBe(4);
    expect(agregador.grupos).toBe(celdas.filter(({ nivel }) => nivel === 'MUNICIPIO').length);
  });

  it('entrega una lista vacía sin registros', () => {
    expect(agregar([]).resultado()).toEqual([]);
  });

  it.each(['5001', '', null, '05001A'])('rechaza el código de municipio %s', (municipio) => {
    expect(() => agregar([{ ...REGISTROS[0], municipio }])).toThrow(RangeError);
  });
});

describe('propiedades de la agregación', () => {
  const registro = fc.record({
    municipio: fc.constantFrom('27361', '27001', '76001', '76109', '66001', '05001'),
    sexo: fc.constantFrom('F', 'M'),
    edad: fc.integer({ min: 0, max: 100 }),
    vulnerabilidades: fc.subarray(['DISCAPACIDAD', 'EMBARAZO', 'ADULTO_MAYOR']),
  });

  it('en cada territorio las categorías excluyentes suman el total, y cada nivel suma lo mismo', () => {
    fc.assert(
      fc.property(fc.array(registro, { maxLength: 120 }), (registros) => {
        const celdas = agregar(registros).resultado();
        for (const total of celdas.filter(({ dimension }) => dimension === 'total')) {
          const porSexo = celdas
            .filter(
              (celda) =>
                celda.nivel === total.nivel &&
                celda.territorio === total.territorio &&
                celda.dimension === 'sexo',
            )
            .reduce((suma, { cantidad }) => suma + cantidad, 0);
          expect(porSexo).toBe(total.cantidad);
        }
        for (const nivel of ['MUNICIPIO', 'DEPARTAMENTO', 'NACIONAL']) {
          const total = celdas
            .filter((celda) => celda.nivel === nivel && celda.dimension === 'total')
            .reduce((suma, { cantidad }) => suma + cantidad, 0);
          expect(total).toBe(registros.length);
        }
      }),
      { numRuns: 150, seed: 20260810 },
    );
  });

  it('combinar dos lotes da lo mismo que agregar todo de una vez', () => {
    fc.assert(
      fc.property(
        fc.array(registro, { maxLength: 80 }),
        fc.array(registro, { maxLength: 80 }),
        (primero, segundo) => {
          const unido = crearAgregador({ dimensiones: DIMENSIONES, valor: (registro) => registro.edad });
          [agregar(primero), agregar(segundo)].forEach((lote) =>
            lote.celdasMunicipales().forEach((celda) => unido.agregarCelda(celda)),
          );
          const ordenar = (celdas) =>
            celdas.map(sinNivel).sort((uno, otro) => JSON.stringify(uno).localeCompare(JSON.stringify(otro)));
          expect(ordenar(unido.celdasMunicipales())).toEqual(
            ordenar(agregar([...primero, ...segundo]).celdasMunicipales()),
          );
        },
      ),
      { numRuns: 100, seed: 20260810 },
    );
  });

  it('combinarNiveles acepta celdas repetidas de varios lotes', () => {
    const celdas = combinarNiveles([
      { territorio: '27361', dimension: 'total', categoria: 'TOTAL', cantidad: 2, suma: 10 },
      { territorio: '27361', dimension: 'total', categoria: 'TOTAL', cantidad: 3, suma: 5 },
    ]);
    expect(celdas.find(({ nivel }) => nivel === 'MUNICIPIO')).toMatchObject({
      cantidad: 5,
      suma: 15,
      promedio: 3,
    });
  });
});

describe('supresión de celdas pequeñas', () => {
  it('oculta las celdas con menos de diez personas y conserva las demás', () => {
    const resultado = suprimirCeldasPequenas([
      { territorio: '27361', cantidad: 3, suma: 90, promedio: 30, porcentaje: 0.1 },
      { territorio: '27001', cantidad: 10, suma: 300, promedio: 30, porcentaje: 0.2 },
      { territorio: '76001', cantidad: 0, suma: 0, promedio: null, porcentaje: 0 },
    ]);
    expect(resultado.map(({ cantidad, suprimida }) => [cantidad, suprimida])).toEqual([
      [null, true],
      [10, false],
      [0, false],
    ]);
    expect(resultado[0]).toMatchObject({ suma: null, promedio: null, porcentaje: null });
  });
});
