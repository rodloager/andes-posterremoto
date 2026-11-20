import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { z } from 'zod';
import { DIMENSIONES_CRUZABLES } from '../models/dimensiones.js';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

export const RUTA_DE_KPI = path.join(raiz, 'config', 'kpi.yml');
export const UNIDADES_DE_KPI = Object.freeze({ porcentaje: 100, por_cien_mil: 100_000 });
export const SENTIDOS_DE_KPI = Object.freeze(['mayor_es_mejor', 'menor_es_mejor', 'neutral']);

const FAMILIAS = Object.freeze({
  OFICIAL: ['indicador', 'territorial'],
  SIMULADO: ['agregado', 'cruce'],
});

const codigo = z.string().regex(/^[a-z_]{1,60}$/);
const categorias = z.array(z.string().regex(/^[A-Z0-9_]{1,60}$/)).min(1);

const ingrediente = z.union([
  z.strictObject({ indicador: codigo }),
  z.strictObject({
    territorial: z.strictObject({
      variables: z.array(z.string().regex(/^[a-zA-Z]{1,60}$/)).min(1),
      mayores: z.number().int().min(1).max(1000).optional(),
    }),
  }),
  z.strictObject({
    agregado: z.strictObject({
      destino: z.enum(['personas', 'viviendas']),
      dimension: codigo,
      categorias,
    }),
  }),
  z.strictObject({
    cruce: z
      .partialRecord(z.enum(DIMENSIONES_CRUZABLES), categorias)
      .refine((cruce) => Object.keys(cruce).length === 2, {
        message: 'Un cruce combina exactamente dos dimensiones de las viviendas.',
      }),
  }),
]);

export const tipoDeIngrediente = (definicion) => Object.keys(definicion)[0];

const indicadorClave = z
  .strictObject({
    codigo,
    nombre: z.string().min(1),
    descripcion: z.string().min(1),
    modulo: codigo,
    unidad: z.enum(Object.keys(UNIDADES_DE_KPI)),
    sentido: z.enum(SENTIDOS_DE_KPI),
    origen: z.enum(Object.keys(FAMILIAS)),
    numerador: ingrediente,
    denominador: ingrediente,
  })
  .refine(
    ({ origen, numerador, denominador }) =>
      [numerador, denominador].every((parte) => FAMILIAS[origen].includes(tipoDeIngrediente(parte))),
    {
      message:
        'Un indicador OFICIAL solo combina indicadores o variables territoriales. Uno SIMULADO solo combina agregados o cruces.',
    },
  );

const esquema = z.strictObject({
  version: z.literal(1),
  kpi: z
    .array(indicadorClave)
    .min(1)
    .refine((lista) => new Set(lista.map(({ codigo: clave }) => clave)).size === lista.length, {
      message: 'Cada indicador clave debe tener un código distinto.',
    }),
});

export class ErrorDeKpi extends Error {
  constructor(mensaje) {
    super(mensaje);
    this.name = 'ErrorDeKpi';
  }
}

export function validarKpi(contenido) {
  const resultado = esquema.safeParse(contenido);
  if (!resultado.success) {
    throw new ErrorDeKpi(`config/kpi.yml no es válido.\n${z.prettifyError(resultado.error)}`);
  }
  return resultado.data;
}

export async function leerKpi(ruta = RUTA_DE_KPI) {
  return validarKpi(parse(await readFile(ruta, 'utf8')));
}
