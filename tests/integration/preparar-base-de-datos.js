import { randomBytes } from 'node:crypto';
import { leerEntorno } from '../../backend/src/config/entorno.js';
import { prepararBaseDeDatosAislada } from '../../database/preparacion.js';

const SUFIJO = '_pruebas';

export default async function prepararBaseDeDatos(proyecto) {
  const variables = { ...process.env, NODE_ENV: 'test' };
  const nombre = `${leerEntorno(variables).baseDeDatos.nombre}${SUFIJO}`;
  const claveUsuariosDemo = randomBytes(18).toString('base64url');
  await prepararBaseDeDatosAislada({ variables, nombre, claveUsuariosDemo });
  proyecto.provide('baseDePruebas', nombre);
  proyecto.provide('claveDemo', claveUsuariosDemo);
}
