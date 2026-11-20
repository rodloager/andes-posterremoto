import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { z } from 'zod';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const carpetaDefiniciones = path.join(raiz, 'etl', 'definiciones');

export const MARCADORES_DE_AUSENCIA = Object.freeze([
  '',
  'N/A',
  'NA',
  'NO REGISTRA',
  'SIN DATO',
  'NULL',
  'NULO',
  '-',
]);
export const TIPOS_DE_CAMPO = Object.freeze([
  'texto',
  'entero',
  'decimal',
  'categoria',
  'lista',
  'fecha',
  'municipio',
]);
const IDENTIFICADOR = /^[a-z0-9-]+$/;

const esquemaCampo = z
  .strictObject({
    nombre: z.string().regex(/^[a-z][a-zA-Z_]*$/),
    origen: z.string().min(1).optional(),
    tipo: z.enum(TIPOS_DE_CAMPO),
    obligatorio: z.boolean().default(false),
    si_invalido: z.enum(['rechazar', 'anular']).default('rechazar'),
    minimo: z.number().optional(),
    maximo: z.number().optional(),
    longitud_maxima: z.number().int().positive().optional(),
    patron: z.string().optional(),
    valores: z.array(z.string().min(1)).min(1).optional(),
    separador: z.string().min(1).default('|'),
    desde: z.string().optional(),
    hasta: z.string().optional(),
    seudonimizar: z.boolean().default(false),
  })
  .superRefine((campo, contexto) => {
    if ((campo.tipo === 'categoria' || campo.tipo === 'lista') && !campo.valores) {
      contexto.addIssue({
        code: 'custom',
        message: `El campo ${campo.nombre} necesita la lista de valores permitidos.`,
      });
    }
    if (campo.minimo !== undefined && campo.maximo !== undefined && campo.minimo > campo.maximo) {
      contexto.addIssue({
        code: 'custom',
        message: `El campo ${campo.nombre} tiene un mínimo mayor que el máximo.`,
      });
    }
  });

const esquemaDefinicion = z
  .strictObject({
    id: z.string().regex(IDENTIFICADOR),
    nombre: z.string().min(1),
    descripcion: z.string().min(1),
    fuente: z.string().regex(IDENTIFICADOR),
    origen: z.enum(['OFICIAL', 'ESTIMADO', 'SIMULADO']),
    destino: z.enum(['personas', 'viviendas', 'reportes']),
    evento: z.string().regex(IDENTIFICADOR),
    version_esquema: z.number().int().positive(),
    formatos: z.array(z.enum(['csv', 'json', 'jsonl'])).min(1),
    tamano_lote: z.number().int().min(1).max(50_000).default(5000),
    marcadores_de_ausencia: z.array(z.string()).default([...MARCADORES_DE_AUSENCIA]),
    campos: z.array(esquemaCampo).min(1),
    reglas: z
      .array(z.strictObject({ codigo: z.string().regex(/^[A-Z_]+$/), efecto: z.enum(['alerta', 'rechazo']) }))
      .default([]),
    duplicados: z
      .strictObject({
        umbral_duplicado: z.number().min(0).max(1),
        umbral_revision: z.number().min(0).max(1),
        pesos: z.record(z.string(), z.number().nonnegative()),
      })
      .refine((duplicados) => duplicados.umbral_revision <= duplicados.umbral_duplicado, {
        message: 'El umbral de revisión no puede superar el umbral de duplicado.',
      })
      .optional(),
  })
  .superRefine((definicion, contexto) => {
    const nombres = definicion.campos.map(({ nombre }) => nombre);
    if (new Set(nombres).size !== nombres.length) {
      contexto.addIssue({ code: 'custom', message: 'Hay campos repetidos.' });
    }
  });

export class ErrorDeDefinicion extends Error {
  constructor(mensaje) {
    super(mensaje);
    this.name = 'ErrorDeDefinicion';
  }
}

export function validarDefinicion(contenido, origen = 'definición') {
  const resultado = esquemaDefinicion.safeParse(contenido);
  if (!resultado.success) {
    throw new ErrorDeDefinicion(`La ${origen} no es válida.\n${z.prettifyError(resultado.error)}`);
  }
  return Object.freeze(resultado.data);
}

export async function leerDefinicion(id, carpeta = carpetaDefiniciones) {
  if (!IDENTIFICADOR.test(id)) {
    throw new ErrorDeDefinicion(`Identificador de conjunto no válido: ${id}`);
  }
  let texto;
  try {
    texto = await readFile(path.join(carpeta, `${id}.yml`), 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new ErrorDeDefinicion(`No existe la definición del conjunto ${id}.`);
    }
    throw error;
  }
  const definicion = validarDefinicion(parse(texto), `definición ${id}.yml`);
  if (definicion.id !== id) {
    throw new ErrorDeDefinicion(`El archivo ${id}.yml declara el identificador ${definicion.id}.`);
  }
  return definicion;
}

export async function listarDefiniciones(carpeta = carpetaDefiniciones) {
  const archivos = (await readdir(carpeta)).filter((archivo) => archivo.endsWith('.yml')).sort();
  return Promise.all(archivos.map((archivo) => leerDefinicion(archivo.slice(0, -'.yml'.length), carpeta)));
}
