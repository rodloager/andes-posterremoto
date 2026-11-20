import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  USUARIOS,
  agenteConSesion,
  conectarComoPropietario,
  crearEntornoDePrueba,
  esProblema,
  huellaDeSemilla,
  leerSemilla,
} from './apoyo.js';

const FUENTE = 'dane-mgn';

let entorno;
let propietario;
let administrador;
let analista;
let ingeniero;
let territorio;

beforeAll(async () => {
  entorno = crearEntornoDePrueba();
  propietario = await conectarComoPropietario();
  administrador = await agenteConSesion(entorno.aplicacion, USUARIOS.administradorDatos);
  analista = await agenteConSesion(entorno.aplicacion, USUARIOS.analista);
  ingeniero = await agenteConSesion(entorno.aplicacion, USUARIOS.ingeniero);
  territorio = leerSemilla('territorio.json');
});

afterAll(async () => {
  await propietario.end();
  await entorno.cerrar();
});

const conAlerta = (alerta) => territorio.municipios.filter(({ alertas }) => alertas.includes(alerta));

async function leerFuente(id = FUENTE) {
  const { rows } = await propietario.query(
    'SELECT origen, nivel, fecha_consulta, cobertura, variables, limitaciones FROM nucleo.fuentes_datos WHERE id = $1',
    [id],
  );
  return rows[0];
}

async function conFuenteRestaurada(prueba) {
  const original = await leerFuente();
  try {
    await prueba(original);
  } finally {
    await propietario.query(
      'UPDATE nucleo.fuentes_datos SET fecha_consulta = $2, cobertura = $3, variables = $4, limitaciones = $5 WHERE id = $1',
      [FUENTE, original.fecha_consulta, original.cobertura, original.variables, original.limitaciones],
    );
  }
}

async function contarAuditoria() {
  const { rows } = await propietario.query('SELECT count(*)::int AS total FROM seguridad.auditoria');
  return rows[0].total;
}

async function recorrer(agente, ruta, consulta) {
  const paginas = [];
  let despues;
  do {
    const respuesta = await agente.get(ruta).query({ ...consulta, ...(despues ? { despues } : {}) });
    expect(respuesta.status).toBe(200);
    paginas.push(respuesta.body.elementos);
    despues = respuesta.body.siguiente;
  } while (despues);
  return paginas;
}

describe('conjuntos y cargas', () => {
  it('describe el conjunto oficial con su última carga', async () => {
    const respuesta = await analista.get('/api/v1/admin/conjuntos');
    expect(respuesta.status).toBe(200);
    const porId = Object.fromEntries(respuesta.body.conjuntos.map((conjunto) => [conjunto.id, conjunto]));
    expect(Object.keys(porId)).toEqual(['dane-afectaciones', 'personas-simuladas', 'viviendas-simuladas']);
    expect(porId['dane-afectaciones']).toEqual({
      id: 'dane-afectaciones',
      nombre: expect.any(String),
      descripcion: expect.any(String),
      destino: 'reportes',
      fuente: { id: 'dane-afectaciones', nombre: expect.any(String), origen: 'OFICIAL', nivel: 'A' },
      ultimaCarga: {
        id: expect.any(Number),
        estado: 'TERMINADA',
        finalizadaEn: expect.any(String),
        filasLeidas: territorio.meta.municipiosEnLaCapa,
      },
      registros: territorio.municipios.length,
    });
  });

  it('registra los conjuntos simulados definidos en YAML, marcados como simulados', async () => {
    const { conjuntos } = (await analista.get('/api/v1/admin/conjuntos')).body;
    for (const [id, destino] of [
      ['personas-simuladas', 'personas'],
      ['viviendas-simuladas', 'viviendas'],
    ]) {
      expect(conjuntos.find((conjunto) => conjunto.id === id)).toMatchObject({
        destino,
        fuente: { id: 'generador-andes', origen: 'SIMULADO', nivel: 'S' },
      });
    }
  });

  it('registra la procedencia de cada carga: archivo, huella y conteos', async () => {
    const respuesta = await analista.get('/api/v1/admin/ejecuciones');
    const alertas = territorio.municipios.reduce((total, municipio) => total + municipio.alertas.length, 0);
    expect(respuesta.body.siguiente).toBeNull();
    expect(respuesta.body.elementos).toEqual([
      expect.objectContaining({
        conjunto: 'dane-afectaciones',
        origenArchivo: 'database/seeds/oficial/territorio.json',
        huellaArchivo: huellaDeSemilla('territorio.json'),
        estado: 'TERMINADA',
        filasLeidas: territorio.meta.municipiosEnLaCapa,
        filasValidas: territorio.municipios.length,
        filasRechazadas: 0,
        duplicados: 0,
        alertas,
      }),
    ]);
  });
});

describe('explorador de registros', () => {
  it('recorre todos los municipios por páginas sin repetir ni saltar ninguno', async () => {
    const paginas = await recorrer(analista, '/api/v1/admin/registros', { limite: 200 });
    const registros = paginas.flat();
    expect(paginas.map((pagina) => pagina.length)).toEqual([200, 200, territorio.municipios.length - 400]);
    expect(
      registros.map(({ municipio, nombre, departamento, valores, fechaReporte, alertas }) => ({
        codigo: municipio,
        nombre,
        departamento,
        valores,
        fechaReporte,
        alertas,
      })),
    ).toEqual([...territorio.municipios].sort((uno, otro) => uno.codigo.localeCompare(otro.codigo)));
  });

  it('filtra por departamento', async () => {
    const respuesta = await analista
      .get('/api/v1/admin/registros')
      .query({ departamento: '66', limite: 200 });
    const risaralda = territorio.departamentos.find(({ codigo }) => codigo === '66');
    expect(respuesta.body.elementos).toHaveLength(risaralda.municipiosConReporte);
    expect(new Set(respuesta.body.elementos.map((registro) => registro.nombreDepartamento))).toEqual(
      new Set(['Risaralda']),
    );
  });

  it.each(['PERSONAS_MENOR_QUE_FAMILIAS', 'FECHA_REPORTE_INVALIDA'])(
    'filtra por la alerta %s',
    async (alerta) => {
      const respuesta = await analista.get('/api/v1/admin/registros').query({ alerta, limite: 200 });
      expect(respuesta.body.elementos.map((registro) => registro.municipio)).toEqual(
        conAlerta(alerta)
          .map(({ codigo }) => codigo)
          .sort(),
      );
      expect(respuesta.body.siguiente).toBeNull();
    },
  );

  it('combina los filtros', async () => {
    const respuesta = await analista
      .get('/api/v1/admin/registros')
      .query({ alerta: 'FECHA_REPORTE_INVALIDA', departamento: '66' });
    const esperados = conAlerta('FECHA_REPORTE_INVALIDA').filter(({ departamento }) => departamento === '66');
    expect(respuesta.body.elementos).toHaveLength(esperados.length);
  });

  it.each([
    [{ limite: 0 }, 'limite'],
    [{ limite: 201 }, 'limite'],
    [{ limite: 'todos' }, 'limite'],
    [{ departamento: '6' }, 'departamento'],
    [{ departamento: "05' OR '1'='1" }, 'departamento'],
    [{ alerta: 'OTRA' }, 'alerta'],
    [{ despues: '1; DROP TABLE nucleo.municipios' }, 'despues'],
    [{ orden: 'nombre' }, null],
  ])('rechaza la consulta %o', async (consulta, campo) => {
    const respuesta = await analista.get('/api/v1/admin/registros').query(consulta);
    esProblema(respuesta, 400, 'VALIDACION');
    expect(respuesta.body.errores[0]).toMatchObject({ ubicacion: 'query', campo });
  });
});

describe('calidad de los datos', () => {
  it('cuenta los municipios afectados por cada regla de validación', async () => {
    const respuesta = await analista.get('/api/v1/admin/calidad');
    const fechaInvalida = conAlerta('FECHA_REPORTE_INVALIDA').length;
    const sinFecha = territorio.municipios.filter(({ fechaReporte }) => fechaReporte === null).length;
    expect(respuesta.status).toBe(200);
    expect(respuesta.body.municipios).toBe(territorio.municipios.length);
    expect(respuesta.body.carga.filasLeidas).toBe(territorio.meta.municipiosEnLaCapa);
    expect(
      Object.fromEntries(respuesta.body.reglas.map(({ codigo, municipios }) => [codigo, municipios])),
    ).toEqual({
      PERSONAS_MENOR_QUE_FAMILIAS: conAlerta('PERSONAS_MENOR_QUE_FAMILIAS').length,
      FECHA_REPORTE_INVALIDA: fechaInvalida,
      SIN_FECHA_DE_REPORTE: sinFecha - fechaInvalida,
    });
  });

  it('calcula los campos vacíos por variable, de mayor a menor', async () => {
    const respuesta = await analista.get('/api/v1/admin/calidad');
    const total = territorio.municipios.length;
    const esperados = Object.fromEntries(
      territorio.variables.map(({ codigo }) => [
        codigo,
        territorio.municipios.filter(({ valores }) => valores[codigo] === undefined).length,
      ]),
    );
    const vacios = respuesta.body.camposVacios;
    expect(Object.fromEntries(vacios.map(({ variable, sinValor }) => [variable, sinValor]))).toEqual(
      esperados,
    );
    expect(vacios.find(({ variable }) => variable === 'fallecidos')).toMatchObject({
      sinValor: 470,
      proporcion: 470 / total,
    });
    expect(
      vacios.every((campo, indice) => indice === 0 || vacios[indice - 1].sinValor >= campo.sinValor),
    ).toBe(true);
  });
});

describe('edición de fuentes', () => {
  it('actualiza los campos permitidos, deja rastro auditado y se refleja en el portal', async () => {
    await conFuenteRestaurada(async (original) => {
      const cambios = { fechaConsulta: '2026-11-12', limitaciones: 'Texto de prueba de edición.' };
      const respuesta = await administrador.patch(`/api/v1/admin/fuentes/${FUENTE}`).send(cambios);
      expect(respuesta.status).toBe(200);
      expect(respuesta.body.fuente).toMatchObject({ id: FUENTE, ...cambios, cobertura: original.cobertura });

      const historial = await administrador.get('/api/v1/admin/historial').query({ limite: 1 });
      expect(historial.body.elementos[0]).toMatchObject({
        accion: 'ACTUALIZAR',
        entidad: 'fuente',
        entidadId: FUENTE,
        antes: { fechaConsulta: original.fecha_consulta, limitaciones: original.limitaciones },
        despues: cambios,
        usuario: { correo: USUARIOS.administradorDatos },
      });

      const publica = await administrador.get('/api/v1/fuentes');
      expect(publica.body.fuentes.find(({ id }) => id === FUENTE)).toMatchObject(cambios);
    });
  });

  it('guarda el texto tal como llega, sin interpretarlo como SQL', async () => {
    await conFuenteRestaurada(async () => {
      const limitaciones = "x'); DROP TABLE nucleo.fuentes_datos; --";
      const respuesta = await administrador.patch(`/api/v1/admin/fuentes/${FUENTE}`).send({ limitaciones });
      expect(respuesta.body.fuente.limitaciones).toBe(limitaciones);
      expect((await leerFuente()).limitaciones).toBe(limitaciones);
    });
  });

  it('recorta los espacios al inicio y al final', async () => {
    await conFuenteRestaurada(async () => {
      const respuesta = await administrador
        .patch(`/api/v1/admin/fuentes/${FUENTE}`)
        .send({ cobertura: '  Nacional  ' });
      expect(respuesta.body.fuente.cobertura).toBe('Nacional');
    });
  });

  it.each([
    ['un cuerpo vacío', {}, null],
    ['una fecha con otro formato', { fechaConsulta: '12/11/2026' }, 'fechaConsulta'],
    ['una fecha que no existe', { fechaConsulta: '2026-02-30' }, 'fechaConsulta'],
    ['un texto en blanco', { limitaciones: '   ' }, 'limitaciones'],
    ['un texto demasiado largo', { limitaciones: 'x'.repeat(2001) }, 'limitaciones'],
    ['un cambio de origen', { origen: 'SIMULADO' }, null],
    ['un cambio de nivel', { nivel: 'A', limitaciones: 'Válida.' }, null],
  ])('rechaza %s sin modificar la fuente', async (descripcion, cuerpo, campo) => {
    const antes = await leerFuente();
    const auditoriaAntes = await contarAuditoria();
    const respuesta = await administrador.patch(`/api/v1/admin/fuentes/${FUENTE}`).send(cuerpo);
    esProblema(respuesta, 400, 'VALIDACION');
    expect(respuesta.body.errores[0]).toMatchObject({ ubicacion: 'body', campo });
    expect(await leerFuente()).toEqual(antes);
    expect(await contarAuditoria()).toBe(auditoriaAntes);
  });

  it('responde 404 ante una fuente inexistente y no deja registro de auditoría', async () => {
    const auditoriaAntes = await contarAuditoria();
    const respuesta = await administrador
      .patch('/api/v1/admin/fuentes/no-existe')
      .send({ limitaciones: 'x' });
    esProblema(respuesta, 404, 'NO_ENCONTRADO');
    expect(await contarAuditoria()).toBe(auditoriaAntes);
  });

  it('rechaza un identificador mal formado', async () => {
    const respuesta = await administrador
      .patch('/api/v1/admin/fuentes/DANE%20MGN')
      .send({ limitaciones: 'x' });
    esProblema(respuesta, 400, 'VALIDACION');
    expect(respuesta.body.errores[0]).toMatchObject({ ubicacion: 'params', campo: 'id' });
  });

  it('rechaza un cuerpo demasiado grande', async () => {
    const respuesta = await administrador
      .patch(`/api/v1/admin/fuentes/${FUENTE}`)
      .send({ limitaciones: 'x'.repeat(30_000) });
    esProblema(respuesta, 413, 'CUERPO_DEMASIADO_GRANDE');
  });
});

describe('historial de cambios', () => {
  it('muestra solo los cambios sobre datos, del más reciente al más antiguo', async () => {
    await propietario.query(
      "SELECT seguridad.registrar_auditoria(NULL, 'CREAR', 'usuario', 'prueba-historial', NULL, '{}'::jsonb)",
    );
    await conFuenteRestaurada(async () => {
      for (const limitaciones of ['Primer cambio.', 'Segundo cambio.']) {
        expect(
          (await administrador.patch(`/api/v1/admin/fuentes/${FUENTE}`).send({ limitaciones })).status,
        ).toBe(200);
      }
    });

    const paginas = await recorrer(administrador, '/api/v1/admin/historial', { limite: 1 });
    const cambios = paginas.flat();
    expect(cambios.length).toBeGreaterThanOrEqual(2);
    expect(cambios.every(({ entidad }) => entidad === 'fuente')).toBe(true);
    expect(cambios.every((cambio, indice) => indice === 0 || cambios[indice - 1].id > cambio.id)).toBe(true);
    expect(cambios.slice(0, 2).map(({ despues }) => despues.limitaciones)).toEqual([
      'Segundo cambio.',
      'Primer cambio.',
    ]);

    const completa = await ingeniero.get('/api/v1/ingenieria/auditoria').query({ limite: 200 });
    expect(completa.body.elementos.some(({ entidadId }) => entidadId === 'prueba-historial')).toBe(true);
  });
});
