import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  VULNERABILIDADES,
  clasificarRegistros,
  codigosDeMascara,
  crearClasificador,
  crearTablaDeGrupos,
  tieneVulnerabilidad,
} from '../../../backend/src/algorithms/clasificacion.js';

const CONDICIONES = [
  { codigo: 'CIVIL' },
  { codigo: 'MILITAR' },
  { codigo: 'RECLUSION', padre: 'PRIVADA_LIBERTAD' },
  { codigo: 'OTRA_MODALIDAD', padre: 'PRIVADA_LIBERTAD' },
];
const TENENCIAS = [
  { codigo: 'PROPIETARIO' },
  { codigo: 'ARRENDATARIO' },
  { codigo: 'OCUPANTE_CON_PERMISO' },
  { codigo: 'OTRA' },
];
const DECLARABLES = VULNERABILIDADES.filter(({ derivada }) => !derivada).map(({ codigo }) => codigo);
const clasificar = crearClasificador({ condiciones: CONDICIONES, tenencias: TENENCIAS });

const persona = (cambios) => ({
  edad: 30,
  condicion: 'CIVIL',
  tenencia: 'PROPIETARIO',
  vulnerabilidades: [],
  ...cambios,
});

function grupoConCadenaDeCondiciones(edad) {
  if (edad < 10) {
    return 0;
  }
  if (edad < 18) {
    return 1;
  }
  return edad < 60 ? 2 : 3;
}

describe('tabla de grupos de edad', () => {
  it('convierte la edad en grupo con una lectura de arreglo', () => {
    const tabla = crearTablaDeGrupos([10, 18, 60]);
    expect(tabla).toHaveLength(121);
    expect([0, 9, 10, 17, 18, 59, 60, 120].map((edad) => tabla[edad])).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
  });

  it.each([[[18, 10]], [[0]], [[10, 10]], [[130]], [[5.5]]])('rechaza los cortes %j', (cortes) => {
    expect(() => crearTablaDeGrupos(cortes)).toThrow(RangeError);
  });
});

describe('clasificación de una persona', () => {
  it('ubica a un adulto mayor y activa la vulnerabilidad derivada de la edad', () => {
    const resultado = clasificar(persona({ edad: 65, vulnerabilidades: ['DISCAPACIDAD'] }));
    expect(resultado).toMatchObject({ clasificable: true, grupoEdad: 3, quinquenio: 13, mascara: 9 });
    expect(codigosDeMascara(resultado.mascara)).toEqual(['DISCAPACIDAD', 'ADULTO_MAYOR']);
  });

  it.each([
    [8, 0, true],
    [17, 1, true],
    [18, 2, false],
  ])('a los %i años ubica el grupo %i y marca población infantil: %s', (edad, grupo, infantil) => {
    const resultado = clasificar(persona({ edad }));
    expect(resultado.grupoEdad).toBe(grupo);
    expect(tieneVulnerabilidad(resultado.mascara, 'POBLACION_INFANTIL')).toBe(infantil);
  });

  it('acota las edades mayores de 120 al último grupo', () => {
    expect(clasificar(persona({ edad: 130 }))).toMatchObject({ grupoEdad: 3, quinquenio: 16 });
  });

  it('agrupa las dos modalidades de privación de la libertad', () => {
    expect(clasificar(persona({ condicion: 'RECLUSION' }))).toMatchObject({
      condicion: 'RECLUSION',
      grupoCondicion: 'PRIVADA_LIBERTAD',
    });
    expect(clasificar(persona({ condicion: 'CIVIL' })).grupoCondicion).toBe('CIVIL');
  });

  it('acepta una tenencia sin dato', () => {
    expect(clasificar(persona({ tenencia: null })).tenencia).toBeNull();
  });

  it.each([
    [{ edad: -1 }, ['EDAD_INVALIDA']],
    [{ edad: 3.5 }, ['EDAD_INVALIDA']],
    [{ edad: 'treinta' }, ['EDAD_INVALIDA']],
    [{ condicion: 'XYZ' }, ['CONDICION_DESCONOCIDA']],
    [{ tenencia: 'PRESTADA' }, ['TENENCIA_DESCONOCIDA']],
    [{ vulnerabilidades: ['ADULTO_MAYOR'] }, ['VULNERABILIDAD_DESCONOCIDA']],
    [{ edad: null, condicion: null }, ['EDAD_INVALIDA', 'CONDICION_DESCONOCIDA']],
  ])('no clasifica %j', (cambios, problemas) => {
    expect(clasificar(persona(cambios))).toEqual({ clasificable: false, problemas });
  });

  it('cuenta los registros que no se pudieron clasificar', () => {
    const { clasificados, noClasificables } = clasificarRegistros(
      [persona(), persona({ edad: -4 }), persona({ condicion: '??' }), persona({ edad: 70 })],
      { condiciones: CONDICIONES, tenencias: TENENCIAS },
    );
    expect(clasificados).toHaveLength(2);
    expect(noClasificables).toBe(2);
  });

  it('coincide con una cadena de condiciones y activa cada bit una sola vez', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 150 }), fc.subarray(DECLARABLES), (edad, declaradas) => {
        const resultado = clasificar(persona({ edad, vulnerabilidades: declaradas }));
        const edadAcotada = Math.min(edad, 120);
        expect(resultado.grupoEdad).toBe(grupoConCadenaDeCondiciones(edadAcotada));
        expect(resultado.quinquenio).toBe(Math.min(Math.floor(edadAcotada / 5), 16));
        const esperadas = new Set(declaradas);
        if (edadAcotada >= 60) {
          esperadas.add('ADULTO_MAYOR');
        }
        if (edadAcotada < 18) {
          esperadas.add('POBLACION_INFANTIL');
        }
        expect(new Set(codigosDeMascara(resultado.mascara))).toEqual(esperadas);
      }),
      { numRuns: 300, seed: 20260810 },
    );
  });
});
