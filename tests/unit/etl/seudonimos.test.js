import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  crearOcultadorDeFilas,
  crearSeudonimizador,
  ocultarDigitos,
  ocultarValor,
} from '../../../etl/transformadores/seudonimos.js';

const SECRETO = 'secreto-de-prueba-con-al-menos-32-caracteres';
const CAMPOS = [
  { nombre: 'documento', seudonimizar: true },
  { nombre: 'predio', origen: 'CODIGO_PREDIO', seudonimizar: true },
  { nombre: 'edad' },
  { nombre: 'nombre_completo' },
];

fc.configureGlobal({ seed: 20260810 });

describe('seudonimizador', () => {
  const seudonimo = crearSeudonimizador(SECRETO);

  it('produce siempre el mismo HMAC-SHA256 en hexadecimal para el mismo documento', () => {
    expect(seudonimo('1000123456')).toMatch(/^[0-9a-f]{64}$/);
    expect(seudonimo(' 1000123456 ')).toBe(seudonimo('1000123456'));
    expect(seudonimo(1000123456)).toBe(seudonimo('1000123456'));
  });

  it('cambia con el secreto, así que no se puede recalcular sin él', () => {
    expect(crearSeudonimizador(`${SECRETO}-otro`)('1000123456')).not.toBe(seudonimo('1000123456'));
  });

  it('distingue documentos distintos', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 10_000, max: 999_999_999 }),
        fc.integer({ min: 1, max: 1000 }),
        (base, salto) => {
          expect(seudonimo(String(base))).not.toBe(seudonimo(String(base + salto)));
        },
      ),
    );
  });

  it.each([undefined, null, '', 'corto'])('exige un secreto de al menos 32 caracteres (%j)', (secreto) => {
    expect(() => crearSeudonimizador(secreto)).toThrow(/SEUDONIMO_SECRETO/);
  });
});

describe('ocultar valores', () => {
  it.each([
    ['1000123456', '•••456'],
    ['70000-ABC', '•••ABC'],
    ['123', '•••'],
    ['', '•••'],
    [1000123456, '•••456'],
  ])('oculta %j como %j', (valor, oculto) => {
    expect(ocultarValor(valor)).toBe(oculto);
  });

  it('oculta toda secuencia de cinco o más dígitos y deja las fechas y los números cortos', () => {
    expect(ocultarDigitos('CC 1000123456 nació el 2026-08-10, edad 34, municipio 17001')).toBe(
      'CC •••456 nació el 2026-08-10, edad 34, municipio •••001',
    );
  });

  it('es idempotente: ocultar lo ya oculto no cambia nada', () => {
    fc.assert(
      fc.property(fc.string(), (texto) => {
        expect(ocultarDigitos(ocultarDigitos(texto))).toBe(ocultarDigitos(texto));
        expect(ocultarDigitos(texto)).not.toMatch(/\d{5,}/);
      }),
    );
  });
});

describe('ocultador de filas rechazadas', () => {
  const ocultar = crearOcultadorDeFilas(CAMPOS);

  it('oculta los campos seudonimizados sin importar mayúsculas ni el nombre de origen', () => {
    expect(
      ocultar.fila({
        Documento: '1000123456',
        codigo_predio: 'PR1000999888',
        edad: '250',
        nombre_completo: 'Ana',
      }),
    ).toEqual({ Documento: '•••456', codigo_predio: '•••888', edad: '250', nombre_completo: 'Ana' });
  });

  it('oculta los dígitos largos de las columnas que la definición no conoce', () => {
    expect(ocultar.fila({ doc: 'CC 1000123456', extra: { telefono: 3001234567 }, vacio: null })).toEqual({
      doc: 'CC •••456',
      extra: { telefono: '•••567' },
      vacio: null,
    });
  });

  it('oculta los dígitos largos de una fila que no se pudo interpretar', () => {
    expect(ocultar.estructura({ valores: ['1000123456', 'Ana', '17001', '2026-08-20'] })).toEqual({
      valores: ['•••456', 'Ana', '•••001', '2026-08-20'],
    });
    expect(ocultar.estructura({ texto: '{"documento": "1000123456", "edad": 3' })).toEqual({
      texto: '{"documento": "•••456", "edad": 3',
    });
  });

  it('oculta el valor en el mensaje de error de un campo seudonimizado y solo en ese', () => {
    expect(
      ocultar.error({ campo: 'documento', codigo: 'FORMATO', mensaje: 'El valor 1000123456 no sirve.' }),
    ).toEqual({
      campo: 'documento',
      codigo: 'FORMATO',
      mensaje: 'El valor •••456 no sirve.',
    });
    const comun = { campo: 'edad', codigo: 'RANGO', mensaje: 'El valor 1000123456 está fuera del rango.' };
    expect(ocultar.error(comun)).toBe(comun);
  });

  it('es idempotente sobre filas ya ocultas', () => {
    const fila = { documento: '1000123456', doc: 'CC 1000123456', edad: '30' };
    expect(ocultar.fila(ocultar.fila(fila))).toEqual(ocultar.fila(fila));
  });

  it('sin definición conocida oculta los dígitos largos de todas las columnas', () => {
    expect(crearOcultadorDeFilas([]).fila({ documento: '1000123456', edad: '30' })).toEqual({
      documento: '•••456',
      edad: '30',
    });
  });
});
