import crearAlmacenPostgres from 'connect-pg-simple';
import session from 'express-session';

export const NOMBRE_COOKIE = 'andes.sid';

const DURACION_SESION_MS = 8 * 60 * 60 * 1000;
const LIMPIEZA_SEGUNDOS = 15 * 60;

export function opcionesDeCookie({ produccion }) {
  return { httpOnly: true, sameSite: 'strict', secure: produccion, path: '/' };
}

export function crearSesiones({ secreto, produccion, pruebas, grupo }) {
  const AlmacenPostgres = crearAlmacenPostgres(session);
  const almacen = new AlmacenPostgres({
    pool: grupo,
    schemaName: 'seguridad',
    tableName: 'sesiones',
    pruneSessionInterval: pruebas ? false : LIMPIEZA_SEGUNDOS,
  });
  const middleware = session({
    name: NOMBRE_COOKIE,
    secret: secreto,
    store: almacen,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    unset: 'destroy',
    cookie: { ...opcionesDeCookie({ produccion }), maxAge: DURACION_SESION_MS },
  });
  return { middleware, cerrar: () => almacen.close() };
}

export function ejecutarSobreSesion(solicitud, operacion) {
  return new Promise((resolver, rechazar) => {
    solicitud.session[operacion]((error) => (error ? rechazar(error) : resolver()));
  });
}
