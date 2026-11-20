import { z } from 'zod';

z.config(z.locales.es());

const LIMITE_POR_DEFECTO = 50;
const LIMITE_MAXIMO = 200;
const SUGERENCIAS_POR_DEFECTO = 10;
const SUGERENCIAS_MAXIMAS = 20;
const ZONAS_MAXIMAS = 100;

export const EVENTO_PRINCIPAL = 'sismo-2026-08-10';

export const ALERTAS_TERRITORIALES = Object.freeze(['PERSONAS_MENOR_QUE_FAMILIAS', 'FECHA_REPORTE_INVALIDA']);

const codigoEvento = z.string().regex(/^[a-z0-9-]{1,60}$/, 'Código de evento no válido.');
const codigoDepartamento = z
  .string()
  .regex(/^[0-9]{2}$/, 'El departamento es un código DIVIPOLA de dos dígitos.');
const codigoMunicipio = z
  .string()
  .regex(/^[0-9]{5}$/, 'El municipio es un código DIVIPOLA de cinco dígitos.');
const limite = z.coerce.number().int().min(1).max(LIMITE_MAXIMO).default(LIMITE_POR_DEFECTO);

export const parametrosEvento = z.strictObject({ evento: codigoEvento });

export const parametrosIndicador = z.strictObject({
  evento: codigoEvento,
  codigo: z.string().regex(/^[a-z_]{1,60}$/, 'Código de indicador no válido.'),
});

export const parametrosDepartamento = z.strictObject({
  evento: codigoEvento,
  departamento: codigoDepartamento,
});

export const credenciales = z.strictObject({
  correo: z
    .email('Escribe un correo electrónico válido.')
    .max(254, 'El correo no puede superar 254 caracteres.')
    .transform((correo) => correo.toLowerCase()),
  clave: z
    .string()
    .min(1, 'Escribe la contraseña.')
    .max(200, 'La contraseña no puede superar 200 caracteres.'),
});

export const paginacionPorId = z.strictObject({
  despues: z.coerce.number().int().positive().optional(),
  limite,
});

export const filtrosDeRegistros = z.strictObject({
  despues: codigoMunicipio.optional(),
  limite,
  departamento: codigoDepartamento.optional(),
  alerta: z.enum(ALERTAS_TERRITORIALES).optional(),
});

export const parametrosFuente = z.strictObject({
  id: z.string().regex(/^[a-z0-9-]{1,60}$/, 'Identificador de fuente no válido.'),
});

const textoEditable = (maximo) =>
  z
    .string()
    .trim()
    .min(1, 'El texto no puede quedar vacío.')
    .max(maximo, `El texto no puede superar ${maximo} caracteres.`);

export const cambiosDeFuente = z
  .strictObject({
    fechaConsulta: z.iso.date('Usa el formato AAAA-MM-DD.').optional(),
    cobertura: textoEditable(500).optional(),
    variables: textoEditable(1000).optional(),
    limitaciones: textoEditable(2000).optional(),
  })
  .refine((cambios) => Object.keys(cambios).length > 0, 'Indica al menos un campo para modificar.');

export const parametrosCarga = z.strictObject({
  id: z.coerce.number().int().positive(),
});

export const cuerpoDeCarga = z.strictObject({
  conjunto: z.string().regex(/^[a-z0-9-]{1,60}$/, 'Identificador de conjunto no válido.'),
});

export const paginacionPorFila = z.strictObject({
  despues: z.coerce.number().int().positive().optional(),
  limite,
});

export const filtrosDeDuplicados = z.strictObject({
  destino: z.enum(['personas', 'viviendas']),
  estado: z.enum(['PENDIENTE', 'FUSIONADO', 'DISTINTO', 'RESUELTO']).default('PENDIENTE'),
  despues: z.coerce.number().int().positive().optional(),
  limite,
});

export const parametrosDuplicado = z.strictObject({
  id: z.coerce.number().int().positive(),
});

export const decisionDeDuplicado = z.strictObject({
  decision: z.enum(['MISMO', 'DISTINTO'], 'La decisión debe ser MISMO o DISTINTO.'),
});

const codigoTerritorio = z
  .string()
  .regex(
    /^[0-9]{2}([0-9]{3})?$/,
    'El territorio es 00 (nacional) o un código DIVIPOLA de dos o cinco dígitos.',
  );

export const filtrosDeEstadisticas = z.strictObject({
  evento: codigoEvento.default(EVENTO_PRINCIPAL),
  territorio: codigoTerritorio.default('00'),
  origen: z.enum(['OFICIAL', 'ESTIMADO', 'SIMULADO']).default('SIMULADO'),
});

const PESO_DE_CRITERIO = /^([a-z_]{1,40}):(\d{1,3}(?:\.\d{1,4})?)$/;
const PESO_MAXIMO = 100;

const pesosDeCriterios = z
  .string()
  .max(500, 'La lista de pesos es demasiado larga.')
  .transform((texto, contexto) => {
    const pares = texto.split(',').map((par) => PESO_DE_CRITERIO.exec(par.trim()));
    if (pares.some((par) => !par)) {
      contexto.addIssue({
        code: 'custom',
        message:
          'Escribe los pesos como criterio:valor separados por comas, por ejemplo personas_afectadas:40,viviendas_destruidas:20.',
      });
      return z.NEVER;
    }
    const codigos = pares.map(([, codigo]) => codigo);
    if (new Set(codigos).size !== codigos.length) {
      contexto.addIssue({
        code: 'custom',
        message: 'Cada criterio puede aparecer una sola vez en los pesos.',
      });
      return z.NEVER;
    }
    if (pares.some(([, , valor]) => Number(valor) > PESO_MAXIMO)) {
      contexto.addIssue({ code: 'custom', message: `Cada peso debe estar entre 0 y ${PESO_MAXIMO}.` });
      return z.NEVER;
    }
    return Object.fromEntries(pares.map(([, codigo, valor]) => [codigo, Number(valor)]));
  });

export const parametrosDePriorizacion = z.strictObject({
  evento: codigoEvento.default(EVENTO_PRINCIPAL),
  k: z.coerce.number().int().min(1).max(ZONAS_MAXIMAS).optional(),
  pesos: pesosDeCriterios.optional(),
});

export const busquedaDeMunicipios = z.strictObject({
  prefijo: z.string().trim().min(1, 'Escriba al menos una letra.').max(60),
  limite: z.coerce.number().int().min(1).max(SUGERENCIAS_MAXIMAS).default(SUGERENCIAS_POR_DEFECTO),
});
