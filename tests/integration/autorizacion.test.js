import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { USUARIOS, agenteConSesion, crearEntornoDePrueba, esProblema } from './apoyo.js';

let entorno;
const agentes = {};

beforeAll(async () => {
  entorno = crearEntornoDePrueba();
  for (const [rol, correo] of Object.entries(USUARIOS)) {
    agentes[rol] = await agenteConSesion(entorno.aplicacion, correo);
  }
});

afterAll(() => entorno.cerrar());

const ENDPOINTS = [
  {
    metodo: 'get',
    ruta: '/api/v1/admin/conjuntos',
    permitidos: ['superadministrador', 'ingeniero', 'administradorDatos', 'analista'],
  },
  {
    metodo: 'get',
    ruta: '/api/v1/admin/ejecuciones',
    permitidos: ['superadministrador', 'ingeniero', 'administradorDatos', 'analista'],
  },
  {
    metodo: 'get',
    ruta: '/api/v1/admin/registros',
    permitidos: ['superadministrador', 'ingeniero', 'administradorDatos', 'analista'],
  },
  {
    metodo: 'get',
    ruta: '/api/v1/admin/calidad',
    permitidos: ['superadministrador', 'ingeniero', 'administradorDatos', 'analista'],
  },
  {
    metodo: 'get',
    ruta: '/api/v1/admin/historial',
    permitidos: ['superadministrador', 'ingeniero', 'administradorDatos', 'analista'],
  },
  { metodo: 'get', ruta: '/api/v1/ingenieria/estado', permitidos: ['superadministrador', 'ingeniero'] },
  { metodo: 'get', ruta: '/api/v1/ingenieria/auditoria', permitidos: ['superadministrador', 'ingeniero'] },
  {
    metodo: 'get',
    ruta: '/api/v1/ingenieria/auditoria/verificacion',
    permitidos: ['superadministrador', 'ingeniero'],
  },
  { metodo: 'get', ruta: '/api/v1/ingenieria/accesos', permitidos: ['superadministrador', 'ingeniero'] },
];

const casos = ENDPOINTS.flatMap(({ metodo, ruta, permitidos }) =>
  Object.keys(USUARIOS).map((rol) => [ruta, rol, permitidos.includes(rol) ? 200 : 403, metodo]),
);

describe('API privada', () => {
  it.each(ENDPOINTS.map(({ ruta, metodo }) => [ruta, metodo]))('exige sesión en %s', async (ruta, metodo) => {
    esProblema(await request(entorno.aplicacion)[metodo](ruta), 401, 'NO_AUTENTICADO');
  });

  it.each(casos)('%s con el rol %s responde %i', async (ruta, rol, estado, metodo) => {
    const respuesta = await agentes[rol][metodo](ruta);
    expect(respuesta.status).toBe(estado);
    if (estado === 403) {
      esProblema(respuesta, 403, 'SIN_PERMISO');
    }
    expect(respuesta.headers['cache-control']).toBe('no-store');
  });

  it('solo deja editar fuentes a quien puede gestionarlas', async () => {
    const cambio = { limitaciones: 'Prueba de autorización.' };
    for (const rol of ['analista', 'ingeniero']) {
      esProblema(await agentes[rol].patch('/api/v1/admin/fuentes/dane-mgn').send(cambio), 403, 'SIN_PERMISO');
    }
    esProblema(
      await request(entorno.aplicacion).patch('/api/v1/admin/fuentes/dane-mgn').send(cambio),
      401,
      'NO_AUTENTICADO',
    );
  });
});

describe('páginas privadas', () => {
  const anonimo = () => request(entorno.aplicacion);

  it.each(['/privado/', '/privado/index.html', '/privado/css/privado.css', '/privado/js/acceso.js'])(
    'entrega sin sesión el recurso libre %s',
    async (ruta) => {
      expect((await anonimo().get(ruta)).status).toBe(200);
    },
  );

  it.each([
    ['/privado/administracion', '/privado/administracion'],
    ['/privado/administracion.html', '/privado/administracion'],
    ['/privado/ADMINISTRACION', '/privado/administracion'],
    ['/privado/administraci%6Fn', '/privado/administracion'],
    ['/privado/calidad/', '/privado/calidad'],
    ['/privado/ingenieria', '/privado/ingenieria'],
    ['/privado/priorizacion', '/privado/priorizacion'],
  ])('redirige %s al acceso cuando no hay sesión', async (ruta, destino) => {
    const respuesta = await anonimo().get(ruta);
    expect(respuesta.status).toBe(303);
    expect(respuesta.headers.location).toBe(`/privado/?siguiente=${encodeURIComponent(destino)}`);
  });

  it('niega una página privada no declarada', async () => {
    expect((await anonimo().get('/privado/secreta')).status).toBe(404);
    expect((await agentes.superadministrador.get('/privado/403.html')).status).toBe(404);
  });

  it('entrega la página cuando el rol tiene permiso', async () => {
    const respuesta = await agentes.ingeniero.get('/privado/ingenieria');
    expect(respuesta.status).toBe(200);
    expect(respuesta.text).toMatch(/Panel de ingeniería/);
  });

  it('entrega el laboratorio de priorización al analista y lo niega al ingeniero', async () => {
    const permitida = await agentes.analista.get('/privado/priorizacion');
    expect(permitida.status).toBe(200);
    expect(permitida.text).toMatch(/Laboratorio de priorización/);
    expect((await agentes.ingeniero.get('/privado/priorizacion')).status).toBe(403);
  });

  it('responde 403 cuando el rol no tiene permiso', async () => {
    const respuesta = await agentes.analista.get('/privado/ingenieria');
    expect(respuesta.status).toBe(403);
    expect(respuesta.text).toMatch(/Acceso denegado/);
  });
});
