import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  USUARIOS,
  agenteConSesion,
  claveDemo,
  conectarComoPropietario,
  crearEntornoDePrueba,
  esProblema,
} from './apoyo.js';

let entorno;
let propietario;

beforeAll(async () => {
  entorno = crearEntornoDePrueba();
  propietario = await conectarComoPropietario();
});

afterAll(async () => {
  await propietario.end();
  await entorno.cerrar();
});

const iniciar = (cuerpo, cabeceras = {}) =>
  request(entorno.aplicacion).post('/api/v1/sesion').set(cabeceras).send(cuerpo);

async function ultimoAcceso(correo) {
  const { rows } = await propietario.query(
    'SELECT exitoso, motivo FROM seguridad.registro_accesos WHERE correo_intentado = $1 ORDER BY id DESC LIMIT 1',
    [correo],
  );
  return rows[0];
}

describe('inicio de sesión', () => {
  it.each(Object.entries(USUARIOS))('permite entrar con el rol %s', async (rol, correo) => {
    const respuesta = await iniciar({ correo, clave: claveDemo() });
    expect(respuesta.status).toBe(200);
    expect(respuesta.body.usuario).toMatchObject({ correo, permisos: expect.any(Array) });
    expect(respuesta.body.usuario).not.toHaveProperty('hash_contrasena');
    expect(await ultimoAcceso(correo)).toEqual({ exitoso: true, motivo: 'INICIO_SESION' });
  });

  it('entrega una cookie protegida contra lectura desde JavaScript y contra envíos entre sitios', async () => {
    const respuesta = await iniciar({ correo: USUARIOS.analista, clave: claveDemo() });
    const [cookie] = respuesta.headers['set-cookie'];
    expect(cookie).toMatch(/^andes\.sid=/);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Strict/);
    expect(cookie).toMatch(/Path=\//);
  });

  it('acepta el correo sin distinguir mayúsculas', async () => {
    const respuesta = await iniciar({ correo: USUARIOS.analista.toUpperCase(), clave: claveDemo() });
    expect(respuesta.status).toBe(200);
  });

  it('rechaza una contraseña incorrecta sin revelar si el correo existe', async () => {
    const conCorreoReal = await iniciar({ correo: USUARIOS.ingeniero, clave: 'clave-equivocada' });
    const conCorreoInventado = await iniciar({ correo: 'nadie@andes.test', clave: 'clave-equivocada' });
    esProblema(conCorreoReal, 401, 'CREDENCIALES_INVALIDAS');
    esProblema(conCorreoInventado, 401, 'CREDENCIALES_INVALIDAS');
    expect(conCorreoReal.body.detail).toBe(conCorreoInventado.body.detail);
    expect(await ultimoAcceso(USUARIOS.ingeniero)).toEqual({
      exitoso: false,
      motivo: 'CREDENCIALES_INVALIDAS',
    });
    expect(await ultimoAcceso('nadie@andes.test')).toEqual({
      exitoso: false,
      motivo: 'CREDENCIALES_INVALIDAS',
    });
  });

  it.each([
    ['un correo mal formado', { correo: 'sin-arroba', clave: 'x' }, 'correo'],
    ['una contraseña vacía', { correo: USUARIOS.analista, clave: '' }, 'clave'],
    ['campos que no se esperan', { correo: USUARIOS.analista, clave: 'x', rol: 'superadministrador' }, null],
  ])('rechaza %s', async (descripcion, cuerpo, campo) => {
    const respuesta = await iniciar(cuerpo);
    esProblema(respuesta, 400, 'VALIDACION');
    expect(respuesta.body.errores[0]).toMatchObject({ ubicacion: 'body', campo });
  });

  it('rechaza un cuerpo que no es JSON', async () => {
    const respuesta = await request(entorno.aplicacion)
      .post('/api/v1/sesion')
      .set('Content-Type', 'application/json')
      .send('{"correo":');
    esProblema(respuesta, 400, 'JSON_INVALIDO');
  });
});

describe('protección contra solicitudes de otros sitios', () => {
  it('rechaza un origen distinto al del servidor', async () => {
    const respuesta = await iniciar(
      { correo: USUARIOS.analista, clave: claveDemo() },
      { Origin: 'https://sitio-malicioso.example' },
    );
    esProblema(respuesta, 403, 'ORIGEN_NO_PERMITIDO');
  });

  it('rechaza una solicitud que el navegador marca como de otro sitio', async () => {
    const respuesta = await iniciar(
      { correo: USUARIOS.analista, clave: claveDemo() },
      { 'Sec-Fetch-Site': 'cross-site' },
    );
    esProblema(respuesta, 403, 'ORIGEN_NO_PERMITIDO');
  });

  it('acepta el origen del propio servidor', async () => {
    const agente = request(entorno.aplicacion);
    const respuesta = await agente
      .post('/api/v1/sesion')
      .set('Host', 'andes.local')
      .set('Origin', 'http://andes.local')
      .send({ correo: USUARIOS.analista, clave: claveDemo() });
    expect(respuesta.status).toBe(200);
  });
});

describe('sesión activa', () => {
  it('informa el usuario actual y lo olvida al cerrar la sesión', async () => {
    const agente = await agenteConSesion(entorno.aplicacion, USUARIOS.administradorDatos);
    const actual = await agente.get('/api/v1/sesion');
    expect(actual.status).toBe(200);
    expect(actual.body.usuario).toMatchObject({
      rol: 'administrador_datos',
      nombreRol: 'Administrador de datos',
    });
    expect(actual.headers['cache-control']).toBe('no-store');

    const cierre = await agente.delete('/api/v1/sesion');
    expect(cierre.status).toBe(204);
    expect(cierre.headers['set-cookie'][0]).toMatch(/andes\.sid=;/);
    esProblema(await agente.get('/api/v1/sesion'), 401, 'NO_AUTENTICADO');
    expect(await ultimoAcceso(USUARIOS.administradorDatos)).toEqual({
      exitoso: true,
      motivo: 'CIERRE_SESION',
    });
  });

  it('responde 401 sin sesión', async () => {
    esProblema(await request(entorno.aplicacion).get('/api/v1/sesion'), 401, 'NO_AUTENTICADO');
  });

  it('retira el acceso de inmediato cuando se desactiva la cuenta', async () => {
    const agente = await agenteConSesion(entorno.aplicacion, USUARIOS.analista);
    await propietario.query('UPDATE seguridad.usuarios SET activo = false WHERE correo = $1', [
      USUARIOS.analista,
    ]);
    try {
      esProblema(await agente.get('/api/v1/admin/conjuntos'), 401, 'NO_AUTENTICADO');
      esProblema(
        await iniciar({ correo: USUARIOS.analista, clave: claveDemo() }),
        401,
        'CREDENCIALES_INVALIDAS',
      );
      expect(await ultimoAcceso(USUARIOS.analista)).toEqual({ exitoso: false, motivo: 'USUARIO_INACTIVO' });
    } finally {
      await propietario.query('UPDATE seguridad.usuarios SET activo = true WHERE correo = $1', [
        USUARIOS.analista,
      ]);
    }
  });
});

describe('límite de intentos', () => {
  it('bloquea tras varios intentos fallidos y no cuenta los exitosos', async () => {
    const limitado = crearEntornoDePrueba({ limites: { sesion: { ventanaMs: 60_000, maximo: 3 } } });
    try {
      const intentar = (clave) =>
        request(limitado.aplicacion).post('/api/v1/sesion').send({ correo: USUARIOS.ingeniero, clave });
      expect((await intentar(claveDemo())).status).toBe(200);
      for (let intento = 0; intento < 3; intento += 1) {
        expect((await intentar('equivocada')).status).toBe(401);
      }
      const bloqueado = await intentar(claveDemo());
      esProblema(bloqueado, 429, 'DEMASIADOS_INTENTOS');
      expect(bloqueado.headers.ratelimit).toBeDefined();
    } finally {
      await limitado.cerrar();
    }
  });
});
