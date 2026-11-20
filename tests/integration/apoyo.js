import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import request from 'supertest';
import { expect, inject } from 'vitest';
import { crearAplicacion } from '../../backend/src/app.js';
import { configuracionDeConexion, crearConexiones } from '../../backend/src/config/baseDeDatos.js';
import { leerEntorno } from '../../backend/src/config/entorno.js';
import { crearRegistro } from '../../backend/src/config/registro.js';
import { LIMITES_POR_DEFECTO } from '../../backend/src/middlewares/limites.js';
import { crearMetricas } from '../../backend/src/services/metricas.js';
import { prepararBaseDeDatosAislada } from '../../database/preparacion.js';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export const EVENTO = 'sismo-2026-08-10';

export const USUARIOS = Object.freeze({
  superadministrador: 'superadministrador@andes.test',
  ingeniero: 'ingenieria@andes.test',
  administradorDatos: 'datos@andes.test',
  analista: 'analisis@andes.test',
});

const LIMITES_HOLGADOS = Object.freeze({
  api: { ventanaMs: 60_000, maximo: 10_000 },
  sesion: { ventanaMs: 60_000, maximo: 1_000 },
});

export function configuracionDePrueba(baseDeDatos = inject('baseDePruebas')) {
  return leerEntorno({ ...process.env, NODE_ENV: 'test', BD_NOMBRE: baseDeDatos });
}

export async function prepararBaseAislada(sufijo) {
  const nombre = `${inject('baseDePruebas')}_${sufijo}`;
  await prepararBaseDeDatosAislada({
    variables: { ...process.env, NODE_ENV: 'test' },
    nombre,
    claveUsuariosDemo: inject('claveDemo'),
  });
  return nombre;
}

export function crearEntornoDePrueba({
  limites = LIMITES_HOLGADOS,
  baseDeDatos,
  recibirArchivo,
  lanzarTrabajador,
} = {}) {
  const configuracion = configuracionDePrueba(baseDeDatos);
  const conexiones = crearConexiones(configuracion);
  const metricas = crearMetricas();
  const { aplicacion, cerrar } = crearAplicacion({
    configuracion,
    conexiones,
    registro: crearRegistro(configuracion),
    metricas,
    limites: { ...LIMITES_POR_DEFECTO, ...limites },
    recibirArchivo,
    lanzarTrabajador,
  });
  return {
    aplicacion,
    configuracion,
    conexiones,
    metricas,
    cerrar: async () => {
      cerrar();
      await conexiones.cerrar();
    },
  };
}

export async function conectarComo(cuenta, baseDeDatos) {
  const cliente = new pg.Client(configuracionDeConexion(configuracionDePrueba(baseDeDatos), cuenta));
  await cliente.connect();
  return cliente;
}

export const conectarComoPropietario = (baseDeDatos) => conectarComo('propietario', baseDeDatos);

export const claveDemo = () => inject('claveDemo');

export async function agenteConSesion(aplicacion, correo) {
  const agente = request.agent(aplicacion);
  const respuesta = await agente.post('/api/v1/sesion').send({ correo, clave: claveDemo() });
  expect(respuesta.status, `inicio de sesión de ${correo}`).toBe(200);
  return agente;
}

const rutaDeSemilla = (archivo) => path.join(raiz, 'database', 'seeds', 'oficial', archivo);

export function leerSemilla(archivo) {
  return JSON.parse(readFileSync(rutaDeSemilla(archivo), 'utf8'));
}

export function huellaDeSemilla(archivo) {
  return createHash('sha256')
    .update(readFileSync(rutaDeSemilla(archivo)))
    .digest('hex');
}

export function sinNulos(valor) {
  if (Array.isArray(valor)) {
    return valor.map(sinNulos);
  }
  if (valor && typeof valor === 'object') {
    return Object.fromEntries(
      Object.entries(valor)
        .filter(([, contenido]) => contenido !== null && contenido !== undefined)
        .map(([clave, contenido]) => [clave, sinNulos(contenido)]),
    );
  }
  return valor;
}

export async function esperarRechazo(promesa, codigo) {
  await expect(promesa).rejects.toMatchObject({ code: codigo });
}

export function esProblema(respuesta, estado, codigo) {
  expect(respuesta.status).toBe(estado);
  expect(respuesta.headers['content-type']).toMatch(/application\/problem\+json/);
  expect(respuesta.body).toMatchObject({ type: 'about:blank', status: estado, codigo });
  expect(respuesta.body.title).toEqual(expect.any(String));
  expect(respuesta.body.detail).toEqual(expect.any(String));
}
