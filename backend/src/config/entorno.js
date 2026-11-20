import { z } from 'zod';

const LONGITUD_MINIMA_SECRETO = 32;
const LONGITUD_MINIMA_CLAVE_DEMO = 12;
const LONGITUD_MINIMA_CLAVE_POWERBI = 16;
const PROXIES_MAXIMOS = 5;

export const CUENTAS = Object.freeze({
  propietario: 'andes_propietario',
  aplicacion: 'andes_app',
  lectura: 'andes_lector',
  powerbi: 'powerbi_lector',
});

const puerto = (porDefecto) => z.coerce.number().int().min(1).max(65535).default(porDefecto);

const esquema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PUERTO: puerto(3000),
  BD_HOST: z.string().min(1).default('127.0.0.1'),
  BD_PUERTO: puerto(5433),
  BD_NOMBRE: z
    .string()
    .regex(/^[a-z_][a-z0-9_]*$/)
    .default('andes'),
  BD_PROPIETARIO_CLAVE: z.string().min(1).optional(),
  BD_APP_CLAVE: z.string().min(1),
  BD_LECTOR_CLAVE: z.string().min(1),
  SESION_SECRETO: z.string().min(LONGITUD_MINIMA_SECRETO),
  CLAVE_USUARIOS_DEMO: z.string().min(LONGITUD_MINIMA_CLAVE_DEMO).optional(),
  SEUDONIMO_SECRETO: z.string().min(LONGITUD_MINIMA_SECRETO).optional(),
  BD_POWERBI_CLAVE: z.string().min(LONGITUD_MINIMA_CLAVE_POWERBI).optional(),
  PROXIES_DE_CONFIANZA: z.coerce.number().int().min(0).max(PROXIES_MAXIMOS).default(0),
});

export function leerEntorno(variables = process.env) {
  const resultado = esquema.safeParse(variables);
  if (!resultado.success) {
    throw new Error(`La configuración del entorno no es válida.\n${z.prettifyError(resultado.error)}`);
  }
  const valores = resultado.data;
  return Object.freeze({
    entorno: valores.NODE_ENV,
    produccion: valores.NODE_ENV === 'production',
    pruebas: valores.NODE_ENV === 'test',
    puerto: valores.PUERTO,
    proxiesDeConfianza: valores.PROXIES_DE_CONFIANZA,
    baseDeDatos: Object.freeze({
      host: valores.BD_HOST,
      puerto: valores.BD_PUERTO,
      nombre: valores.BD_NOMBRE,
    }),
    claves: Object.freeze({
      propietario: valores.BD_PROPIETARIO_CLAVE ?? null,
      aplicacion: valores.BD_APP_CLAVE,
      lectura: valores.BD_LECTOR_CLAVE,
      powerbi: valores.BD_POWERBI_CLAVE ?? null,
    }),
    sesion: Object.freeze({ secreto: valores.SESION_SECRETO }),
    claveUsuariosDemo: valores.CLAVE_USUARIOS_DEMO ?? null,
    seudonimos: Object.freeze({ secreto: valores.SEUDONIMO_SECRETO ?? null }),
  });
}
