import pino from 'pino';
import request from 'supertest';
import { describe, expect, inject, it } from 'vitest';
import { crearAplicacion } from '../../backend/src/app.js';
import { crearConexiones } from '../../backend/src/config/baseDeDatos.js';
import { leerEntorno } from '../../backend/src/config/entorno.js';
import { USUARIOS, claveDemo } from './apoyo.js';

async function iniciarSesionEnProduccion(proxies) {
  const configuracion = leerEntorno({
    ...process.env,
    NODE_ENV: 'production',
    BD_NOMBRE: inject('baseDePruebas'),
    PROXIES_DE_CONFIANZA: String(proxies),
  });
  const conexiones = crearConexiones(configuracion);
  const { aplicacion, cerrar } = crearAplicacion({
    configuracion,
    conexiones,
    registro: pino({ level: 'silent' }),
  });
  try {
    return await request(aplicacion)
      .post('/api/v1/sesion')
      .set('X-Forwarded-Proto', 'https')
      .set('X-Forwarded-For', '203.0.113.7')
      .send({ correo: USUARIOS.analista, clave: claveDemo() });
  } finally {
    cerrar();
    await conexiones.cerrar();
  }
}

const cookieDeSesion = (respuesta) =>
  (respuesta.headers['set-cookie'] ?? []).find((linea) => linea.startsWith('andes.sid='));

describe('despliegue detrás de un proxy con TLS', () => {
  it('emite la cookie segura cuando el proxy es de confianza', async () => {
    const respuesta = await iniciarSesionEnProduccion(1);
    expect(respuesta.status).toBe(200);
    const cookie = cookieDeSesion(respuesta);
    expect(cookie).toMatch(/; Secure/);
    expect(cookie).toMatch(/; HttpOnly/);
    expect(cookie).toMatch(/; SameSite=Strict/);
    expect(respuesta.headers['strict-transport-security']).toMatch(/max-age=31536000/);
  });

  it('no emite la cookie segura si no confía en el proxy', async () => {
    const respuesta = await iniciarSesionEnProduccion(0);
    expect(cookieDeSesion(respuesta)).toBeUndefined();
  });
});
