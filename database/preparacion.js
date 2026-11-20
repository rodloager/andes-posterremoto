import pg from 'pg';
import { configuracionDeConexion } from '../backend/src/config/baseDeDatos.js';
import { leerEntorno } from '../backend/src/config/entorno.js';
import { migrar } from './migraciones.js';
import { sembrar } from './siembra.js';

const NOMBRE_SEGURO = /^[a-z_][a-z0-9_]*$/;

export async function recrearBaseDeDatos(configuracion, nombre) {
  if (!NOMBRE_SEGURO.test(nombre) || nombre === configuracion.baseDeDatos.nombre) {
    throw new RangeError(`No se puede recrear la base de datos ${nombre}.`);
  }
  const cliente = new pg.Client(configuracionDeConexion(configuracion, 'propietario'));
  await cliente.connect();
  try {
    await cliente.query(`DROP DATABASE IF EXISTS ${nombre} WITH (FORCE)`);
    await cliente.query(`CREATE DATABASE ${nombre}`);
  } finally {
    await cliente.end();
  }
}

export async function prepararBaseDeDatosAislada({
  variables = process.env,
  nombre,
  claveUsuariosDemo = null,
}) {
  const general = leerEntorno(variables);
  await recrearBaseDeDatos(general, nombre);
  const configuracion = leerEntorno({ ...variables, BD_NOMBRE: nombre });
  const conexion = configuracionDeConexion(configuracion, 'propietario');
  await migrar(conexion);
  const cliente = new pg.Client(conexion);
  await cliente.connect();
  try {
    await sembrar(cliente, { claveUsuariosDemo });
  } finally {
    await cliente.end();
  }
  return configuracion;
}
