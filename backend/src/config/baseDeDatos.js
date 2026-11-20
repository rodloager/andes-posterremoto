import pg from 'pg';
import { CUENTAS } from './entorno.js';

const TIPO_BIGINT = 20;
const TIPO_NUMERIC = 1700;
const TIPO_DATE = 1082;
const TIEMPO_MAXIMO_CONSULTA_MS = 5_000;
const TIEMPO_MAXIMO_CONEXION_MS = 5_000;
const TIEMPO_INACTIVIDAD_MS = 30_000;
const CONEXIONES_POR_GRUPO = 10;

pg.types.setTypeParser(TIPO_BIGINT, Number);
pg.types.setTypeParser(TIPO_NUMERIC, Number);
pg.types.setTypeParser(TIPO_DATE, (valor) => valor);

export function configuracionDeConexion({ baseDeDatos, claves }, cuenta) {
  if (!claves[cuenta]) {
    throw new Error(`Falta la clave de la cuenta ${CUENTAS[cuenta]} en el archivo .env.`);
  }
  return {
    host: baseDeDatos.host,
    port: baseDeDatos.puerto,
    database: baseDeDatos.nombre,
    user: CUENTAS[cuenta],
    password: claves[cuenta],
    application_name: `andes-${cuenta}`,
  };
}

function crearGrupo(configuracion, cuenta, alError) {
  const grupo = new pg.Pool({
    ...configuracionDeConexion(configuracion, cuenta),
    max: CONEXIONES_POR_GRUPO,
    idleTimeoutMillis: TIEMPO_INACTIVIDAD_MS,
    connectionTimeoutMillis: TIEMPO_MAXIMO_CONEXION_MS,
    statement_timeout: TIEMPO_MAXIMO_CONSULTA_MS,
  });
  grupo.on('error', (error) => alError(error, cuenta));
  return grupo;
}

export function crearConexiones(configuracion, { alError = () => {} } = {}) {
  const aplicacion = crearGrupo(configuracion, 'aplicacion', alError);
  const lectura = crearGrupo(configuracion, 'lectura', alError);
  return {
    aplicacion,
    lectura,
    cerrar: () => Promise.all([aplicacion.end(), lectura.end()]),
  };
}

export function describirGrupo(grupo) {
  return { total: grupo.totalCount, inactivas: grupo.idleCount, enEspera: grupo.waitingCount };
}
