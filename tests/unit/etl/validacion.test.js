import { describe, expect, it } from 'vitest';
import { validarDefinicion } from '../../../etl/nucleo/definiciones.js';
import { crearValidador } from '../../../etl/transformadores/campos.js';
import { REGLAS, crearEvaluadorDeReglas } from '../../../etl/transformadores/reglas.js';

const MUNICIPIOS = new Set(['05001', '17001', '27660']);
const REFERENCIAS = { evento: '2026-08-10', hoy: '2026-11-19' };

function validadorDe(campos, extras = {}) {
  const definicion = validarDefinicion({
    id: 'prueba',
    nombre: 'Prueba',
    descripcion: 'Definición de prueba.',
    fuente: 'generador-andes',
    origen: 'SIMULADO',
    destino: 'personas',
    evento: 'sismo-2026-08-10',
    version_esquema: 1,
    formatos: ['csv'],
    campos,
    ...extras,
  });
  return crearValidador(definicion, { municipios: MUNICIPIOS, referenciasDeFecha: REFERENCIAS });
}

const unCampo = (campo, bruto) => validadorDe([{ nombre: 'campo', ...campo }])({ campo: bruto });

describe('validador de campos', () => {
  it.each([
    ['entero desde texto', { tipo: 'entero' }, ' 42 ', 42],
    ['entero negativo', { tipo: 'entero' }, '-3', -3],
    ['entero desde número JSON', { tipo: 'entero' }, 7, 7],
    ['decimal con punto', { tipo: 'decimal' }, '3.75', 3.75],
    ['texto recortado', { tipo: 'texto' }, '  Ana  ', 'Ana'],
    [
      'categoría en minúsculas y con espacios',
      { tipo: 'categoria', valores: ['OTRA_MODALIDAD'] },
      ' otra modalidad ',
      'OTRA_MODALIDAD',
    ],
    ['categoría con tildes', { tipo: 'categoria', valores: ['RECLUSION'] }, 'Reclusión', 'RECLUSION'],
    ['lista con separador', { tipo: 'lista', valores: ['A', 'B'] }, 'a| b |a', ['A', 'B']],
    ['lista desde un arreglo JSON', { tipo: 'lista', valores: ['A', 'B'] }, ['B', null, ''], ['B']],
    ['fecha real', { tipo: 'fecha' }, '2026-08-31', '2026-08-31'],
    ['municipio sin el cero inicial', { tipo: 'municipio' }, '5001', '05001'],
    ['municipio como número JSON', { tipo: 'municipio' }, 17001, '17001'],
  ])('convierte %s', (descripcion, campo, bruto, esperado) => {
    expect(unCampo(campo, bruto)).toEqual({ valores: { campo: esperado }, errores: [] });
  });

  it.each([
    ['un entero con decimales', { tipo: 'entero' }, '4.5', 'TIPO'],
    ['un entero con letras', { tipo: 'entero' }, '12a', 'TIPO'],
    ['un número JSON no entero', { tipo: 'entero' }, 4.5, 'TIPO'],
    ['un decimal con coma', { tipo: 'decimal' }, '3,75', 'TIPO'],
    ['un valor bajo el mínimo', { tipo: 'entero', minimo: 0 }, '-1', 'RANGO'],
    ['un valor sobre el máximo', { tipo: 'entero', maximo: 120 }, '121', 'RANGO'],
    ['un texto demasiado largo', { tipo: 'texto', longitud_maxima: 3 }, 'abcd', 'LONGITUD'],
    ['un texto que no cumple el patrón', { tipo: 'texto', patron: '^[0-9]+$' }, '12-3', 'FORMATO'],
    ['una categoría desconocida', { tipo: 'categoria', valores: ['CIVIL'] }, 'CIVL', 'VALOR_NO_PERMITIDO'],
    ['un elemento de lista desconocido', { tipo: 'lista', valores: ['A'] }, 'A|Z', 'VALOR_NO_PERMITIDO'],
    ['una fecha inexistente', { tipo: 'fecha' }, '2026-02-30', 'FECHA_INVALIDA'],
    ['una fecha en otro formato', { tipo: 'fecha' }, '31/08/2026', 'FECHA_INVALIDA'],
    ['una fecha anterior al evento', { tipo: 'fecha', desde: 'evento' }, '2026-08-09', 'RANGO'],
    ['una fecha futura', { tipo: 'fecha', hasta: 'hoy' }, '2026-11-20', 'RANGO'],
    ['un municipio de tres dígitos', { tipo: 'municipio' }, '170', 'FORMATO'],
    ['un municipio que no existe', { tipo: 'municipio' }, '99999', 'MUNICIPIO_INEXISTENTE'],
  ])('rechaza %s', (descripcion, campo, bruto, codigo) => {
    const { errores } = unCampo(campo, bruto);
    expect(errores).toEqual([{ campo: 'campo', codigo, mensaje: expect.any(String) }]);
  });

  it('acepta una fecha límite literal además de las referencias', () => {
    expect(unCampo({ tipo: 'fecha', desde: '2026-09-01' }, '2026-08-31').errores[0].codigo).toBe('RANGO');
  });

  it.each(['', '  ', 'N/A', 'no registra', 'Sin dato', 'NULL', '-', null, undefined])(
    'trata %j como ausente y no como cero',
    (bruto) => {
      expect(unCampo({ tipo: 'entero' }, bruto)).toEqual({ valores: { campo: null }, errores: [] });
    },
  );

  it('exige los campos obligatorios ausentes', () => {
    expect(unCampo({ tipo: 'entero', obligatorio: true }, 'N/A').errores).toEqual([
      { campo: 'campo', codigo: 'OBLIGATORIO', mensaje: 'El campo campo es obligatorio.' },
    ]);
  });

  it('devuelve una lista vacía para una lista ausente', () => {
    expect(unCampo({ tipo: 'lista', valores: ['A'] }, '')).toEqual({ valores: { campo: [] }, errores: [] });
  });

  it('anula un valor inválido de un campo opcional cuando la definición lo pide', () => {
    expect(unCampo({ tipo: 'entero', si_invalido: 'anular' }, 'abc')).toEqual({
      valores: { campo: null },
      errores: [],
    });
  });

  it('no anula un campo obligatorio aunque la definición lo pida', () => {
    expect(unCampo({ tipo: 'entero', obligatorio: true, si_invalido: 'anular' }, 'abc').errores).toHaveLength(
      1,
    );
  });

  it('lee las columnas sin distinguir mayúsculas y por su nombre de origen', () => {
    const validar = validadorDe([
      { nombre: 'edad', tipo: 'entero' },
      { nombre: 'municipio', origen: 'COD_MPIO', tipo: 'municipio' },
    ]);
    expect(validar({ ' EDAD ': '30', cod_mpio: '27660' })).toEqual({
      valores: { edad: 30, municipio: '27660' },
      errores: [],
    });
  });

  it('acumula todos los errores de una fila', () => {
    const validar = validadorDe([
      { nombre: 'edad', tipo: 'entero', obligatorio: true },
      { nombre: 'municipio', tipo: 'municipio' },
    ]);
    expect(validar({ municipio: '99999' }).errores.map(({ codigo }) => codigo)).toEqual([
      'OBLIGATORIO',
      'MUNICIPIO_INEXISTENTE',
    ]);
  });

  it('no repite en el mensaje el valor de un campo seudonimizado', () => {
    const { errores } = unCampo(
      { tipo: 'texto', patron: '^[0-9]{5,12}$', seudonimizar: true },
      '1000-123456',
    );
    expect(errores[0].mensaje).toBe('El valor •••456 no tiene el formato esperado.');
  });

  it('sí muestra el valor de un campo común para poder corregirlo', () => {
    const { errores } = unCampo({ tipo: 'entero' }, 'treinta');
    expect(errores[0].mensaje).toBe('El valor treinta no es un número entero.');
  });

  it('recorta la muestra de un valor muy largo en el mensaje', () => {
    const { errores } = unCampo({ tipo: 'entero' }, 'x'.repeat(200));
    expect(errores[0].mensaje).toContain(`${'x'.repeat(60)}…`);
    expect(errores[0].mensaje).not.toContain('x'.repeat(61));
  });
});

describe('reglas de negocio', () => {
  const vivienda = (cambios = {}) => ({
    financiacion: 'SIN_FINANCIACION',
    aseguramiento: 'ASEGURADA',
    reclamacion: null,
    valor_aprobado: null,
    costo_estimado: null,
    avaluo: null,
    estado_fisico: 'PENDIENTE_EVALUACION',
    fecha_evaluacion: null,
    ...cambios,
  });

  it.each([
    [
      'EMBARAZO_SEXO_MASCULINO',
      { vulnerabilidades: ['EMBARAZO'], sexo: 'M' },
      { vulnerabilidades: ['EMBARAZO'], sexo: 'F' },
    ],
    [
      'EMBARAZO_EDAD_IMPROBABLE',
      { vulnerabilidades: ['EMBARAZO'], edad: 9 },
      { vulnerabilidades: ['EMBARAZO'], edad: 30 },
    ],
    [
      'HIPOTECA_SIN_SEGURO',
      vivienda({ financiacion: 'LEASING', aseguramiento: 'NO_ASEGURADA' }),
      vivienda({ financiacion: 'HIPOTECA' }),
    ],
    [
      'RECLAMACION_SIN_POLIZA',
      vivienda({ reclamacion: 'EN_ESTUDIO', aseguramiento: 'PENDIENTE_VERIFICACION' }),
      vivienda({ reclamacion: 'EN_ESTUDIO' }),
    ],
    [
      'VALOR_APROBADO_INCOHERENTE',
      vivienda({ reclamacion: 'RECHAZADA', valor_aprobado: 1000 }),
      vivienda({ reclamacion: 'PAGADA', valor_aprobado: 1000 }),
    ],
    [
      'COSTO_SUPERIOR_AL_AVALUO',
      vivienda({ costo_estimado: 151, avaluo: 100 }),
      vivienda({ costo_estimado: 150, avaluo: 100 }),
    ],
    [
      'EVALUACION_SIN_FECHA',
      vivienda({ estado_fisico: 'AFECTACION_LEVE' }),
      vivienda({ estado_fisico: 'AFECTACION_LEVE', fecha_evaluacion: '2026-08-20' }),
    ],
    ['PERSONAS_MENOR_QUE_FAMILIAS', { familias: 10, personas: 9 }, { familias: 10, personas: null }],
    ['FECHA_REPORTE_INVALIDA', { fecha_reporte_valida: false }, { fecha_reporte_valida: true }],
  ])('%s distingue el caso que incumple del que cumple', (codigo, incumple, cumple) => {
    expect(REGLAS[codigo].incumple(incumple)).toBe(true);
    expect(REGLAS[codigo].incumple(cumple)).toBe(false);
  });

  it('separa las alertas de los rechazos según el efecto declarado', () => {
    const evaluar = crearEvaluadorDeReglas([
      { codigo: 'HIPOTECA_SIN_SEGURO', efecto: 'alerta' },
      { codigo: 'RECLAMACION_SIN_POLIZA', efecto: 'rechazo' },
    ]);
    const resultado = evaluar(
      vivienda({ financiacion: 'HIPOTECA', aseguramiento: 'NO_ASEGURADA', reclamacion: 'EN_ESTUDIO' }),
    );
    expect(resultado.alertas).toEqual(['HIPOTECA_SIN_SEGURO']);
    expect(resultado.errores).toEqual([
      { campo: null, codigo: 'RECLAMACION_SIN_POLIZA', mensaje: REGLAS.RECLAMACION_SIN_POLIZA.descripcion },
    ]);
  });

  it('rechaza una definición que nombra reglas que no existen', () => {
    expect(() => crearEvaluadorDeReglas([{ codigo: 'REGLA_INVENTADA', efecto: 'alerta' }])).toThrow(
      /REGLA_INVENTADA/,
    );
  });
});
