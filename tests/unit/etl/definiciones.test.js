import { describe, expect, it } from 'vitest';
import { leerPriorizacion, validarPriorizacion } from '../../../backend/src/config/priorizacion.js';
import { REGLAS } from '../../../etl/transformadores/reglas.js';
import {
  ErrorDeDefinicion,
  leerDefinicion,
  listarDefiniciones,
  validarDefinicion,
} from '../../../etl/nucleo/definiciones.js';

const MINIMA = Object.freeze({
  id: 'prueba',
  nombre: 'Prueba',
  descripcion: 'Definición mínima.',
  fuente: 'generador-andes',
  origen: 'SIMULADO',
  destino: 'personas',
  evento: 'sismo-2026-08-10',
  version_esquema: 1,
  formatos: ['csv'],
  campos: [{ nombre: 'edad', tipo: 'entero' }],
});

describe('definiciones YAML de los conjuntos', () => {
  it('las tres definiciones del proyecto son válidas', async () => {
    const definiciones = await listarDefiniciones();
    expect(definiciones.map(({ id }) => id)).toEqual([
      'dane-afectaciones',
      'personas-simuladas',
      'viviendas-simuladas',
    ]);
  });

  it('solo seudonimiza campos de texto y cada conjunto simulado seudonimiza su identificador', async () => {
    for (const definicion of await listarDefiniciones()) {
      const seudonimizados = definicion.campos.filter(({ seudonimizar }) => seudonimizar);
      for (const campo of seudonimizados) {
        expect(campo.tipo, `${definicion.id}.${campo.nombre}`).toBe('texto');
        expect(campo.obligatorio, `${definicion.id}.${campo.nombre}`).toBe(true);
      }
      if (definicion.origen === 'SIMULADO') {
        expect(seudonimizados.length, definicion.id).toBe(1);
      }
    }
  });

  it('solo usa reglas que existen', async () => {
    for (const definicion of await listarDefiniciones()) {
      for (const { codigo } of definicion.reglas) {
        expect(REGLAS, `${definicion.id}: ${codigo}`).toHaveProperty(codigo);
      }
    }
  });

  it('marca como simulados los conjuntos del generador', async () => {
    const definiciones = await listarDefiniciones();
    expect(
      definiciones.filter(({ fuente }) => fuente === 'generador-andes').map(({ origen }) => origen),
    ).toEqual(['SIMULADO', 'SIMULADO']);
  });

  it('completa los valores por defecto', () => {
    const definicion = validarDefinicion(MINIMA);
    expect(definicion).toMatchObject({ tamano_lote: 5000, reglas: [] });
    expect(definicion.marcadores_de_ausencia).toContain('NO REGISTRA');
    expect(definicion.campos[0]).toMatchObject({
      obligatorio: false,
      si_invalido: 'rechazar',
      seudonimizar: false,
    });
    expect(Object.isFrozen(definicion)).toBe(true);
  });

  it.each([
    ['una propiedad desconocida', { ...MINIMA, extra: true }],
    ['un origen inventado', { ...MINIMA, origen: 'OFICIOSO' }],
    ['un formato no admitido', { ...MINIMA, formatos: ['xlsx'] }],
    ['campos repetidos', { ...MINIMA, campos: [MINIMA.campos[0], MINIMA.campos[0]] }],
    ['una categoría sin valores permitidos', { ...MINIMA, campos: [{ nombre: 'sexo', tipo: 'categoria' }] }],
    [
      'un mínimo mayor que el máximo',
      { ...MINIMA, campos: [{ nombre: 'edad', tipo: 'entero', minimo: 5, maximo: 1 }] },
    ],
    [
      'un efecto de regla desconocido',
      { ...MINIMA, reglas: [{ codigo: 'HIPOTECA_SIN_SEGURO', efecto: 'avisar' }] },
    ],
    [
      'un umbral de revisión mayor que el de duplicado',
      { ...MINIMA, duplicados: { umbral_duplicado: 0.8, umbral_revision: 0.9, pesos: { nombre: 1 } } },
    ],
    ['un lote demasiado grande', { ...MINIMA, tamano_lote: 100_000 }],
  ])('rechaza %s', (descripcion, contenido) => {
    expect(() => validarDefinicion(contenido)).toThrow(ErrorDeDefinicion);
  });

  it('no lee archivos fuera de la carpeta de definiciones', async () => {
    await expect(leerDefinicion('../../package')).rejects.toThrow(/no válido/);
    await expect(leerDefinicion('no-existe')).rejects.toThrow(/No existe la definición/);
  });
});

describe('configuración de la priorización', () => {
  const VALIDA = Object.freeze({
    version: 1,
    k: 10,
    criterios: [
      {
        codigo: 'personas_afectadas',
        nombre: 'Personas afectadas',
        descripcion: 'Del reporte oficial.',
        peso: 1,
        fuente: { tipo: 'variable_territorial', origen: 'OFICIAL', variables: ['personas'] },
      },
    ],
  });

  it('el archivo del proyecto es válido y declara criterios sin fuente', async () => {
    const configuracion = await leerPriorizacion();
    expect(configuracion.k).toBe(20);
    expect(configuracion.criterios.reduce((total, { peso }) => total + peso, 0)).toBeCloseTo(1, 12);
    expect(configuracion.criterios.filter(({ fuente }) => !fuente).map(({ codigo }) => codigo)).toEqual([
      'suministros',
      'capacidad_respuesta',
    ]);
  });

  it('completa mas_es_mejor como falso', () => {
    expect(validarPriorizacion(VALIDA).criterios[0].mas_es_mejor).toBe(false);
  });

  it.each([
    ['códigos repetidos', { ...VALIDA, criterios: [VALIDA.criterios[0], VALIDA.criterios[0]] }],
    ['todos los pesos en cero', { ...VALIDA, criterios: [{ ...VALIDA.criterios[0], peso: 0 }] }],
    ['un peso negativo', { ...VALIDA, criterios: [{ ...VALIDA.criterios[0], peso: -1 }] }],
    [
      'una variable oficial marcada como simulada',
      {
        ...VALIDA,
        criterios: [
          {
            ...VALIDA.criterios[0],
            fuente: { tipo: 'variable_territorial', origen: 'SIMULADO', variables: ['personas'] },
          },
        ],
      },
    ],
    [
      'un tipo de fuente desconocido',
      { ...VALIDA, criterios: [{ ...VALIDA.criterios[0], fuente: { tipo: 'api' } }] },
    ],
    ['un k fuera de rango', { ...VALIDA, k: 0 }],
    ['una propiedad desconocida', { ...VALIDA, aviso: 'Otro aviso' }],
  ])('rechaza %s', (descripcion, contenido) => {
    expect(() => validarPriorizacion(contenido)).toThrow(/priorizacion\.yml no es válido/);
  });
});
