import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { z } from 'zod';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

export const RUTA_DE_PRIORIZACION = path.join(raiz, 'config', 'priorizacion.yml');

const fuente = z.discriminatedUnion('tipo', [
  z.strictObject({
    tipo: z.literal('variable_territorial'),
    origen: z.literal('OFICIAL'),
    variables: z.array(z.string().min(1)).min(1),
  }),
  z.strictObject({
    tipo: z.literal('agregado'),
    origen: z.enum(['OFICIAL', 'ESTIMADO', 'SIMULADO']),
    destino: z.enum(['personas', 'viviendas']),
    dimension: z.string().min(1),
    categoria: z.string().min(1),
  }),
]);

const criterio = z.strictObject({
  codigo: z.string().regex(/^[a-z_]{1,40}$/),
  nombre: z.string().min(1),
  descripcion: z.string().min(1),
  peso: z.number().min(0),
  mas_es_mejor: z.boolean().default(false),
  fuente: fuente.optional(),
});

const esquema = z.strictObject({
  version: z.literal(1),
  k: z.number().int().min(1).max(100),
  criterios: z
    .array(criterio)
    .min(1)
    .refine((criterios) => new Set(criterios.map(({ codigo }) => codigo)).size === criterios.length, {
      message: 'Cada criterio debe tener un código distinto.',
    })
    .refine((criterios) => criterios.some(({ peso }) => peso > 0), {
      message: 'Al menos un criterio debe tener un peso mayor que cero.',
    }),
});

export class ErrorDePriorizacion extends Error {
  constructor(mensaje) {
    super(mensaje);
    this.name = 'ErrorDePriorizacion';
  }
}

export function validarPriorizacion(contenido) {
  const resultado = esquema.safeParse(contenido);
  if (!resultado.success) {
    throw new ErrorDePriorizacion(
      `config/priorizacion.yml no es válido.\n${z.prettifyError(resultado.error)}`,
    );
  }
  return resultado.data;
}

export async function leerPriorizacion(ruta = RUTA_DE_PRIORIZACION) {
  return validarPriorizacion(parse(await readFile(ruta, 'utf8')));
}
