import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  EVENTO,
  USUARIOS,
  agenteConSesion,
  conectarComoPropietario,
  crearEntornoDePrueba,
  leerSemilla,
} from './apoyo.js';

let entorno;
let propietario;
let ingeniero;

beforeAll(async () => {
  entorno = crearEntornoDePrueba();
  propietario = await conectarComoPropietario();
  ingeniero = await agenteConSesion(entorno.aplicacion, USUARIOS.ingeniero);
});

afterAll(async () => {
  await propietario.end();
  await entorno.cerrar();
});

async function idsDeAuditoria() {
  const { rows } = await propietario.query('SELECT id FROM seguridad.auditoria ORDER BY id');
  return rows.map(({ id }) => id);
}

async function asegurarAuditoria(minimo) {
  const faltan = minimo - (await idsDeAuditoria()).length;
  for (let indice = 0; indice < faltan; indice += 1) {
    await propietario.query(
      "SELECT seguridad.registrar_auditoria(NULL, 'CREAR', 'prueba', $1, NULL, '{}'::jsonb)",
      [`integridad-${indice}`],
    );
  }
  return idsDeAuditoria();
}

const verificar = async () => (await ingeniero.get('/api/v1/ingenieria/auditoria/verificacion')).body;

describe('estado del sistema', () => {
  it('describe el servidor, la base de datos, los registros y los procesos', async () => {
    const respuesta = await ingeniero.get('/api/v1/ingenieria/estado');
    const territorio = leerSemilla('territorio.json');
    const fuentes = leerSemilla('fuentes.json').fuentes;
    expect(respuesta.status).toBe(200);

    const { servidor, baseDeDatos, registros, procesosEtl } = respuesta.body;
    expect(servidor).toMatchObject({
      versionNode: process.version,
      entorno: 'test',
      nucleos: expect.any(Number),
    });
    expect(servidor.memoria.residenteMb).toBeGreaterThan(0);
    expect(baseDeDatos).toMatchObject({ disponible: true, version: expect.stringMatching(/^18\./) });
    expect(baseDeDatos.tamanoMb).toBeGreaterThan(0);
    expect(baseDeDatos.conexiones.aplicacion).toEqual({
      total: expect.any(Number),
      inactivas: expect.any(Number),
      enEspera: expect.any(Number),
    });

    expect(Object.fromEntries(registros.map(({ tabla, filas }) => [tabla, filas]))).toMatchObject({
      'nucleo.departamentos': 33,
      'nucleo.municipios': territorio.meta.municipiosEnLaCapa,
      'nucleo.fuentes_datos': fuentes.length,
      'nucleo.reportes_municipales': territorio.municipios.length,
      'nucleo.valores_reporte_municipal': territorio.municipios.reduce(
        (total, { valores }) => total + Object.keys(valores).length,
        0,
      ),
      'nucleo.ejecuciones_etl': 1,
      'seguridad.usuarios': Object.keys(USUARIOS).length,
    });
    expect(procesosEtl).toEqual([
      expect.objectContaining({ conjunto: 'dane-afectaciones', estado: 'TERMINADA' }),
    ]);
  });

  it('ordena las fuentes de indicadores por antigüedad de la consulta', async () => {
    const { fuentes } = (await ingeniero.get('/api/v1/ingenieria/estado')).body;
    const deIndicadores = leerSemilla('fuentes.json').fuentes.filter(({ uso }) => uso === 'indicadores');
    expect(new Set(fuentes.map(({ id }) => id))).toEqual(new Set(deIndicadores.map(({ id }) => id)));
    const fechas = fuentes.map(({ fechaConsulta }) => fechaConsulta ?? '9999-12-31');
    expect(fechas).toEqual([...fechas].sort());
    expect(fuentes.find(({ id }) => id === 'generador-andes')).toMatchObject({
      fechaConsulta: null,
      diasDesdeConsulta: null,
    });
    expect(
      fuentes
        .filter(({ fechaConsulta }) => fechaConsulta)
        .every(({ diasDesdeConsulta }) => diasDesdeConsulta >= 0),
    ).toBe(true);
  });

  it('agrupa las métricas por patrón de ruta, sin valores concretos', async () => {
    const aislado = crearEntornoDePrueba();
    try {
      const anonimo = request(aislado.aplicacion);
      const agente = await agenteConSesion(aislado.aplicacion, USUARIOS.ingeniero);
      for (let vez = 0; vez < 3; vez += 1) {
        await anonimo.get('/api/v1/fuentes');
      }
      await anonimo.get(`/api/v1/eventos/${EVENTO}/indicadores/viviendas_destruidas`);
      await anonimo.get(`/api/v1/eventos/${EVENTO}/indicadores/no_existe`);
      await anonimo.get('/api/v1/eventos/otro-sismo/territorio');
      await anonimo.get('/api/v1/admin/conjuntos');
      await anonimo.get('/api/v1/inexistente');
      await anonimo.get('/api/v2/fuentes');

      const { solicitudes } = (await agente.get('/api/v1/ingenieria/estado')).body;
      const porRuta = Object.fromEntries(
        solicitudes.masFrecuentes.map(({ ruta, solicitudes: total }) => [ruta, total]),
      );
      expect(porRuta).toEqual({
        'GET /api/v1/fuentes': 3,
        'GET /api/v1/eventos/:evento/indicadores/:codigo': 2,
        'GET /api/v1/eventos/:evento/territorio': 1,
        'GET /api/v1/admin/*': 1,
        'GET /api/v1/*': 1,
        'GET /api/*': 1,
        'POST /api/v1/sesion': 1,
      });
      expect(solicitudes.masFrecuentes[0]).toMatchObject({ ruta: 'GET /api/v1/fuentes', errores: 0 });
      expect(solicitudes.masFrecuentes[0].p95Ms).toBeGreaterThan(0);
      expect(solicitudes).toMatchObject({ solicitudes: 10, errores: 0 });
    } finally {
      await aislado.cerrar();
    }
  });
});

describe('auditoría', () => {
  it('confirma que la cadena de auditoría está íntegra', async () => {
    const ids = await asegurarAuditoria(3);
    expect(await verificar()).toEqual({ registros: ids.length, integra: true, primerRegistroAlterado: null });
  });

  it('detecta un registro modificado y señala cuál fue', async () => {
    const ids = await asegurarAuditoria(3);
    const alterado = ids.at(-2);
    const { rows } = await propietario.query('SELECT entidad_id FROM seguridad.auditoria WHERE id = $1', [
      alterado,
    ]);
    await propietario.query(
      "UPDATE seguridad.auditoria SET entidad_id = entidad_id || '-alterado' WHERE id = $1",
      [alterado],
    );
    try {
      expect(await verificar()).toMatchObject({ integra: false, primerRegistroAlterado: alterado });
    } finally {
      await propietario.query('UPDATE seguridad.auditoria SET entidad_id = $2 WHERE id = $1', [
        alterado,
        rows[0].entidad_id,
      ]);
    }
    expect((await verificar()).integra).toBe(true);
  });

  it('detecta un registro eliminado a partir del registro siguiente', async () => {
    const ids = await asegurarAuditoria(3);
    const eliminado = ids.at(-2);
    await propietario.query('CREATE TEMP TABLE respaldo_auditoria (LIKE seguridad.auditoria)');
    await propietario.query(
      'INSERT INTO respaldo_auditoria SELECT * FROM seguridad.auditoria WHERE id = $1',
      [eliminado],
    );
    await propietario.query('DELETE FROM seguridad.auditoria WHERE id = $1', [eliminado]);
    try {
      expect(await verificar()).toMatchObject({
        registros: ids.length - 1,
        integra: false,
        primerRegistroAlterado: ids.at(-1),
      });
    } finally {
      await propietario.query(
        'INSERT INTO seguridad.auditoria OVERRIDING SYSTEM VALUE SELECT * FROM respaldo_auditoria',
      );
      await propietario.query('DROP TABLE respaldo_auditoria');
    }
    expect(await verificar()).toMatchObject({ registros: ids.length, integra: true });
  });

  it('pagina la auditoría del más reciente al más antiguo', async () => {
    await asegurarAuditoria(3);
    const primera = await ingeniero.get('/api/v1/ingenieria/auditoria').query({ limite: 2 });
    expect(primera.body.elementos).toHaveLength(2);
    expect(primera.body.siguiente).toBe(primera.body.elementos[1].id);
    const segunda = await ingeniero
      .get('/api/v1/ingenieria/auditoria')
      .query({ limite: 2, despues: primera.body.siguiente });
    expect(segunda.body.elementos.every(({ id }) => id < primera.body.siguiente)).toBe(true);
  });
});

describe('registro de accesos', () => {
  it('lista los intentos de acceso con su resultado, del más reciente al más antiguo', async () => {
    await request(entorno.aplicacion)
      .post('/api/v1/sesion')
      .send({ correo: 'intruso@andes.test', clave: 'adivinanza' });
    const respuesta = await ingeniero.get('/api/v1/ingenieria/accesos').query({ limite: 2 });
    expect(respuesta.body.elementos[0]).toMatchObject({
      correo: 'intruso@andes.test',
      usuario: null,
      exitoso: false,
      motivo: 'CREDENCIALES_INVALIDAS',
      ip: expect.stringMatching(/127\.0\.0\.1|::1/),
    });
    expect(respuesta.body.siguiente).toBe(respuesta.body.elementos[1].id);
    const siguiente = await ingeniero
      .get('/api/v1/ingenieria/accesos')
      .query({ despues: respuesta.body.siguiente });
    expect(siguiente.body.elementos.every(({ id }) => id < respuesta.body.siguiente)).toBe(true);
  });

  it('no expone contraseñas ni hashes en las respuestas del panel', async () => {
    for (const ruta of ['estado', 'auditoria', 'accesos']) {
      const respuesta = await ingeniero.get(`/api/v1/ingenieria/${ruta}`);
      expect(respuesta.text).not.toMatch(/argon2|hash_contrasena|clave/i);
    }
  });
});
