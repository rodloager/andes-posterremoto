import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crearEntornoDePrueba } from './apoyo.js';

const PAGINAS_PUBLICAS = [
  '/',
  '/poblacion',
  '/vivienda',
  '/economia',
  '/infraestructura',
  '/salud',
  '/educacion',
  '/logistica',
  '/mapa',
  '/comparar',
  '/fuentes',
];

let entorno;
let servidor;

beforeAll(() => {
  entorno = crearEntornoDePrueba();
  servidor = request(entorno.aplicacion);
});

afterAll(() => entorno.cerrar());

describe('portal público', () => {
  it.each(PAGINAS_PUBLICAS)('entrega la página %s', async (ruta) => {
    const respuesta = await servidor.get(ruta);
    expect(respuesta.status).toBe(200);
    expect(respuesta.headers['content-type']).toMatch(/text\/html/);
    expect(respuesta.text).toMatch(/<html lang="es-CO">/);
  });

  it('entrega los datos simulados como archivos marcados en su ruta', async () => {
    const respuesta = await servidor.get('/datos/simulado/indicadores.json');
    expect(respuesta.status).toBe(200);
    expect(respuesta.headers['content-type']).toMatch(/application\/json/);
  });

  it('ya no publica las cifras oficiales como archivos sueltos', async () => {
    expect((await servidor.get('/datos/oficial/indicadores.json')).status).toBe(404);
  });

  it('entrega las bibliotecas locales con tipo de JavaScript', async () => {
    const respuesta = await servidor.get('/vendor/echarts/echarts.esm.min.js');
    expect(respuesta.status).toBe(200);
    expect(respuesta.headers['content-type']).toMatch(/javascript/);
  });

  it('responde 404 con la página de error ante una ruta inexistente', async () => {
    const respuesta = await servidor.get('/no-existe');
    expect(respuesta.status).toBe(404);
    expect(respuesta.text).toMatch(/Página no encontrada/);
  });

  it('envía los encabezados de seguridad en las páginas y en la API', async () => {
    for (const ruta of ['/', '/api/v1/estado']) {
      const { headers } = await servidor.get(ruta);
      const politica = headers['content-security-policy'];
      expect(politica).toMatch(/default-src 'self'/);
      expect(politica).toMatch(/script-src 'self'(;|$)/);
      expect(politica).toMatch(/script-src-attr 'none'/);
      expect(politica).toMatch(/frame-ancestors 'self'/);
      expect(politica).toMatch(/object-src 'none'/);
      expect(headers['x-content-type-options']).toBe('nosniff');
      expect(headers['referrer-policy']).toBe('no-referrer');
      expect(headers['strict-transport-security']).toBeUndefined();
    }
  });

  it('limita las solicitudes por minuto en toda la API', async () => {
    const limitado = crearEntornoDePrueba({ limites: { api: { ventanaMs: 60_000, maximo: 3 } } });
    try {
      const cliente = request(limitado.aplicacion);
      for (let vuelta = 0; vuelta < 3; vuelta += 1) {
        expect((await cliente.get('/api/v1/estado')).status).toBe(200);
      }
      const bloqueada = await cliente.get('/api/v1/estado');
      expect(bloqueada.status).toBe(429);
      expect(bloqueada.body.codigo).toBe('DEMASIADAS_SOLICITUDES');
      expect(bloqueada.headers['ratelimit-policy']).toBeDefined();
    } finally {
      await limitado.cerrar();
    }
  });

  it('no revela la tecnología del servidor', async () => {
    expect((await servidor.get('/')).headers['x-powered-by']).toBeUndefined();
  });

  it.each([
    '/..%2F..%2Fpackage.json',
    '/..%2F..%2F.env',
    '/privado/..%2F..%2F..%2F.env',
    '/%2e%2e/%2e%2e/package.json',
  ])('no deja salir de las carpetas publicadas con %s', async (ruta) => {
    const respuesta = await servidor.get(ruta);
    expect(respuesta.status).not.toBe(200);
    expect(respuesta.text).not.toMatch(/SESION_SECRETO|"dependencies"/);
  });

  it('no crea sesiones para los visitantes del portal', async () => {
    const respuesta = await servidor.get('/');
    expect(respuesta.headers['set-cookie']).toBeUndefined();
  });
});
