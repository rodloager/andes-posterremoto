import { mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { recibirArchivo } from '../../backend/src/middlewares/archivos.js';
import { cargarMunicipiosAfectados } from '../../data/generador/registros/contexto.js';
import { generarArchivo } from '../../data/generador/registros/generar.js';
import { recalcularAgregados } from '../../etl/cargadores/agregados.js';
import { trabajar } from '../../etl/cola.js';
import { leerDefinicion } from '../../etl/nucleo/definiciones.js';
import { ejecutarCarga } from '../../etl/proceso.js';
import {
  EVENTO,
  USUARIOS,
  agenteConSesion,
  conectarComoPropietario,
  crearEntornoDePrueba,
  esProblema,
  prepararBaseAislada,
} from './apoyo.js';

const FIXTURES = path.resolve(import.meta.dirname, '..', 'fixtures');
const ARCHIVO = path.join(FIXTURES, 'etl', 'personas-con-errores.csv');
const NOMBRE_DEL_ARCHIVO = 'personas de prueba.csv';
const TAMANO_MAXIMO = 64 * 1024;
const RUTA_DE_CARGAS = '/api/v1/admin/cargas';

let entorno;
let propietario;
let carpeta;
let administrador;
let analista;
let ingeniero;
let carga;
let pares = [];

beforeAll(async () => {
  const baseDeDatos = await prepararBaseAislada('cargas');
  const temporales = path.join(FIXTURES, 'cargas-temporales');
  await mkdir(temporales, { recursive: true });
  carpeta = await mkdtemp(path.join(temporales, 'prueba-'));
  entorno = crearEntornoDePrueba({
    baseDeDatos,
    recibirArchivo: recibirArchivo({ carpeta, tamanoMaximo: TAMANO_MAXIMO }),
  });
  propietario = await conectarComoPropietario(baseDeDatos);
  [administrador, analista, ingeniero] = await Promise.all([
    agenteConSesion(entorno.aplicacion, USUARIOS.administradorDatos),
    agenteConSesion(entorno.aplicacion, USUARIOS.analista),
    agenteConSesion(entorno.aplicacion, USUARIOS.ingeniero),
  ]);
});

afterAll(async () => {
  await propietario?.end();
  await entorno?.cerrar();
  if (carpeta) {
    await rm(carpeta, { recursive: true, force: true });
  }
});

const filas = async (sql, parametros = []) => (await propietario.query(sql, parametros)).rows;
const una = async (sql, parametros) => (await filas(sql, parametros))[0];

function subir(
  agente,
  { conjunto = 'personas-simuladas', contenido = ARCHIVO, nombre = NOMBRE_DEL_ARCHIVO } = {},
) {
  return agente.post(RUTA_DE_CARGAS).field('conjunto', conjunto).attach('archivo', contenido, nombre);
}

const totalNacional = async () =>
  (
    await una(
      "SELECT cantidad FROM analitica.agregados WHERE destino = 'personas' AND nivel = 'NACIONAL' AND dimension = 'total'",
    )
  ).cantidad;

const ultimaAuditoria = (id) =>
  una(
    `SELECT accion, entidad, antes, despues, usuario_id FROM seguridad.auditoria
     WHERE entidad = 'persona' AND entidad_id = $1 ORDER BY id DESC LIMIT 1`,
    [String(id)],
  );

const encontrar = (nuevo, candidato) =>
  pares.find((par) => par.nuevo.fila === nuevo && par.candidato.fila === candidato);

const decidir = (agente, id, decision) =>
  agente.post(`/api/v1/admin/duplicados/${id}/decision`).send({ decision });

const sumar = (lista, campo = 'cantidad') => lista.reduce((total, elemento) => total + elemento[campo], 0);

describe('subida de archivos', () => {
  it('exige sesión', async () => {
    esProblema(await subir(request(entorno.aplicacion)), 401, 'NO_AUTENTICADO');
  });

  it('exige permiso para importar', async () => {
    esProblema(await subir(analista), 403, 'SIN_PERMISO');
  });

  it('rechaza solicitudes que vienen de otro sitio', async () => {
    esProblema(
      await subir(administrador).set('Origin', 'https://otro-sitio.example'),
      403,
      'ORIGEN_NO_PERMITIDO',
    );
  });

  it('rechaza una extensión que no es CSV, JSON ni JSON Lines', async () => {
    esProblema(
      await subir(administrador, { contenido: Buffer.from('hola'), nombre: 'notas.txt' }),
      400,
      'FORMATO_NO_ADMITIDO',
    );
  });

  it('rechaza un formato que el conjunto no acepta', async () => {
    esProblema(await subir(administrador, { conjunto: 'dane-afectaciones' }), 400, 'FORMATO_NO_ADMITIDO');
  });

  it('responde 404 ante un conjunto inexistente', async () => {
    esProblema(await subir(administrador, { conjunto: 'no-existe' }), 404, 'NO_ENCONTRADO');
  });

  it('valida el identificador del conjunto', async () => {
    esProblema(await subir(administrador, { conjunto: 'Personas Simuladas' }), 400, 'VALIDACION');
  });

  it('exige el archivo', async () => {
    esProblema(
      await administrador.post(RUTA_DE_CARGAS).field('conjunto', 'personas-simuladas'),
      400,
      'ARCHIVO_REQUERIDO',
    );
  });

  it('rechaza un archivo más grande que el límite', async () => {
    esProblema(
      await subir(administrador, { contenido: Buffer.alloc(TAMANO_MAXIMO + 1, 'a'), nombre: 'grande.csv' }),
      413,
      'ARCHIVO_DEMASIADO_GRANDE',
    );
  });

  it('no deja en disco los archivos de las subidas rechazadas', async () => {
    expect(await readdir(carpeta)).toEqual([]);
  });
});

describe('cola de cargas', () => {
  it('encola el archivo y responde 202 sin procesarlo en la solicitud', async () => {
    const respuesta = await subir(administrador);
    expect(respuesta.status).toBe(202);
    expect(respuesta.body).toMatchObject({
      trabajadorActivo: false,
      carga: {
        estado: 'EN_COLA',
        conjunto: 'personas-simuladas',
        nombreArchivo: NOMBRE_DEL_ARCHIVO,
        formato: 'csv',
        filasLeidas: 0,
      },
    });
    expect(respuesta.body.carga.huellaArchivo).toMatch(/^[0-9a-f]{64}$/);
    carga = respuesta.body.carga;
    expect(await readdir(carpeta)).toHaveLength(1);
  });

  it('rechaza el mismo archivo mientras espera en la cola', async () => {
    const respuesta = await subir(administrador);
    esProblema(respuesta, 409, 'EN_PROCESO');
    expect(respuesta.body.ejecucion).toBe(carga.id);
  });

  it('el trabajador procesa la cola y la carga termina', async () => {
    expect(await trabajar({ cliente: propietario, configuracion: entorno.configuracion })).toEqual({
      procesadas: 1,
      fallidas: 0,
    });
    const respuesta = await analista.get(`${RUTA_DE_CARGAS}/${carga.id}`);
    expect(respuesta.status).toBe(200);
    expect(respuesta.body.carga).toMatchObject({
      estado: 'TERMINADA',
      filasLeidas: 15,
      filasValidas: 7,
      filasRechazadas: 8,
      duplicados: 1,
      enRevision: 2,
      alertas: 1,
      filasConfirmadas: 15,
    });
    expect(respuesta.body.carga.mensaje).toMatch(/^15 filas leídas/);
  });

  it('rechaza volver a subir un archivo ya cargado', async () => {
    const respuesta = await subir(administrador, { nombre: 'otro nombre.csv' });
    esProblema(respuesta, 409, 'YA_CARGADO');
    expect(respuesta.body.ejecucion).toBe(carga.id);
  });

  it('lista la carga con su archivo y sus conteos', async () => {
    const { body } = await analista.get('/api/v1/admin/ejecuciones?limite=5');
    expect(body.elementos[0]).toMatchObject({
      id: carga.id,
      nombreArchivo: NOMBRE_DEL_ARCHIVO,
      filasRechazadas: 8,
      enRevision: 2,
    });
  });

  it('responde 404 ante una carga inexistente', async () => {
    esProblema(await analista.get(`${RUTA_DE_CARGAS}/999999`), 404, 'NO_ENCONTRADO');
  });
});

describe('filas rechazadas', () => {
  it('se recorren por páginas en el orden del archivo', async () => {
    const primera = await analista.get(`${RUTA_DE_CARGAS}/${carga.id}/rechazos?limite=5`);
    expect(primera.body.elementos.map(({ fila }) => fila)).toEqual([2, 3, 4, 5, 6]);
    expect(primera.body.siguiente).toBe(6);
    const segunda = await analista.get(`${RUTA_DE_CARGAS}/${carga.id}/rechazos?limite=5&despues=6`);
    expect(segunda.body.elementos.map(({ fila }) => fila)).toEqual([7, 8, 9]);
    expect(segunda.body.siguiente).toBeNull();
  });

  it('muestran su contenido sin el documento original', async () => {
    const { body } = await analista.get(`${RUTA_DE_CARGAS}/${carga.id}/rechazos`);
    const porFila = new Map(body.elementos.map((rechazo) => [rechazo.fila, rechazo]));
    expect(porFila.get(3)).toMatchObject({
      estructural: false,
      contenido: { documento: '•••ABC' },
      errores: [
        { campo: 'documento', codigo: 'FORMATO', mensaje: 'El valor •••ABC no tiene el formato esperado.' },
      ],
    });
    expect(Object.keys(porFila.get(2).contenido)).toEqual([
      'documento',
      'nombre_completo',
      'sexo',
      'edad',
      'municipio',
      'condicion_institucional',
      'tenencia',
      'situacion',
      'condicion_salud',
      'vulnerabilidades',
      'fecha_registro',
    ]);
    expect(porFila.get(7)).toMatchObject({ estructural: true });
    expect(porFila.get(7).contenido.valores).toContain('•••007');
    expect(JSON.stringify(body)).not.toMatch(/7000000002|70000-ABC|7000000007/);
  });

  it('se resumen por motivo junto con los duplicados pendientes', async () => {
    const { body } = await analista.get('/api/v1/admin/calidad/registros');
    expect(body.rechazosPorMotivo).toEqual(
      expect.arrayContaining([
        { conjunto: 'personas-simuladas', codigo: 'TIPO', campo: 'edad', filas: 1 },
        { conjunto: 'personas-simuladas', codigo: 'COLUMNAS', campo: null, filas: 1 },
      ]),
    );
    expect(sumar(body.rechazosPorMotivo, 'filas')).toBe(8);
    expect(body.duplicadosPendientes).toEqual({
      personas: { pares: 3, registros: 2 },
      viviendas: { pares: 0, registros: 0 },
    });
  });
});

describe('revisión de duplicados', () => {
  it('solo la ven quienes pueden editar datos', async () => {
    esProblema(await analista.get('/api/v1/admin/duplicados?destino=personas'), 403, 'SIN_PERMISO');
  });

  it('lista los pares pendientes con el grupo que forman', async () => {
    const respuesta = await administrador.get('/api/v1/admin/duplicados?destino=personas');
    expect(respuesta.status).toBe(200);
    pares = respuesta.body.elementos;
    expect(
      pares
        .map(({ nuevo, candidato, motivo }) => [nuevo.fila, candidato.fila, motivo])
        .sort(([uno, dos], [tres, cuatro]) => uno - tres || dos - cuatro),
    ).toEqual([
      [13, 1, 'SIMILITUD'],
      [15, 1, 'CLAVE_NATURAL'],
      [15, 13, 'SIMILITUD'],
    ]);
    for (const par of pares) {
      expect(par.grupo).toEqual({ id: expect.any(Number), registros: 3 });
      expect(par.similitud).toBeGreaterThanOrEqual(0.8);
      expect(par.estado).toBe('PENDIENTE');
    }
    expect(encontrar(13, 1).nuevo).toMatchObject({
      nombre: 'ANA MARIA PEREZ GOMES',
      edad: 34,
      sexo: 'F',
      municipio: '17001',
      nombreMunicipio: 'Manizales',
      estado: 'EN_REVISION',
      carga: carga.id,
      fila: 13,
    });
    expect(JSON.stringify(pares)).not.toMatch(/identificador|hmac/);
  });

  it('«son distintos» deja vigente el registro y lo suma a las estadísticas', async () => {
    const par = encontrar(13, 1);
    const antes = await totalNacional();
    const respuesta = await decidir(administrador, par.id, 'DISTINTO');
    expect(respuesta.status).toBe(200);
    expect(respuesta.body.decision).toEqual({
      id: par.id,
      destino: 'personas',
      decision: 'DISTINTO',
      registro: { id: par.nuevo.id, estado: 'VIGENTE' },
      pendientes: 0,
    });
    expect(await totalNacional()).toBe(antes + 1);
    expect(await ultimaAuditoria(par.nuevo.id)).toMatchObject({
      accion: 'ACTUALIZAR',
      entidad: 'persona',
      antes: { estado: 'EN_REVISION' },
      despues: { estado: 'VIGENTE', decision: 'DISTINTO', par: par.id },
      usuario_id: expect.any(Number),
    });
  });

  it('«es el mismo» fusiona el registro y resuelve sus otros pares', async () => {
    const par = encontrar(15, 1);
    const otro = encontrar(15, 13);
    const antes = await totalNacional();
    const respuesta = await decidir(administrador, par.id, 'MISMO');
    expect(respuesta.status).toBe(200);
    expect(respuesta.body.decision).toEqual({
      id: par.id,
      destino: 'personas',
      decision: 'MISMO',
      registro: { id: par.nuevo.id, estado: 'FUSIONADO', fusionadoCon: par.candidato.id },
      pendientes: 0,
    });
    expect(await totalNacional()).toBe(antes);
    expect(
      await una('SELECT estado, fusionado_con FROM nucleo.personas_afectadas WHERE id = $1', [par.nuevo.id]),
    ).toEqual({ estado: 'FUSIONADO', fusionado_con: par.candidato.id });
    expect(
      await una('SELECT estado, decidido_por FROM staging.revision_duplicados WHERE id = $1', [otro.id]),
    ).toEqual({ estado: 'RESUELTO', decidido_por: expect.any(Number) });
    expect((await ultimaAuditoria(par.nuevo.id)).despues).toMatchObject({
      estado: 'FUSIONADO',
      decision: 'MISMO',
      fusionadoCon: par.candidato.id,
    });
  });

  it('no permite decidir dos veces sobre el mismo registro', async () => {
    esProblema(await decidir(administrador, encontrar(15, 1).id, 'DISTINTO'), 409, 'YA_DECIDIDO');
    esProblema(await decidir(administrador, encontrar(15, 13).id, 'MISMO'), 409, 'YA_DECIDIDO');
  });

  it('valida la decisión, el par y el permiso', async () => {
    esProblema(await decidir(administrador, encontrar(13, 1).id, 'TAL_VEZ'), 400, 'VALIDACION');
    esProblema(await decidir(administrador, 999999, 'MISMO'), 404, 'NO_ENCONTRADO');
    esProblema(await decidir(analista, encontrar(13, 1).id, 'MISMO'), 403, 'SIN_PERMISO');
  });

  it('deja la cola vacía y los pares decididos se consultan por estado', async () => {
    const pendientes = await administrador.get('/api/v1/admin/duplicados?destino=personas');
    expect(pendientes.body.elementos).toEqual([]);
    const fusionados = await administrador.get('/api/v1/admin/duplicados?destino=personas&estado=FUSIONADO');
    expect(fusionados.body.elementos.map(({ id }) => id)).toEqual([encontrar(15, 1).id]);
    expect(fusionados.body.elementos[0].decididoEn).toEqual(expect.any(String));
    const resumen = await analista.get('/api/v1/admin/calidad/registros');
    expect(resumen.body.duplicadosPendientes.personas).toEqual({ pares: 0, registros: 0 });
  });

  it('las decisiones aparecen en el historial de cambios', async () => {
    const { body } = await analista.get('/api/v1/admin/historial?limite=2');
    expect(body.elementos.map(({ entidad, accion, despues }) => [entidad, accion, despues.decision])).toEqual(
      [
        ['persona', 'ACTUALIZAR', 'MISMO'],
        ['persona', 'ACTUALIZAR', 'DISTINTO'],
      ],
    );
  });

  it('los agregados siguen iguales a un recálculo completo', async () => {
    const leer = () =>
      filas(
        `SELECT destino, nivel, territorio, dimension, categoria, cantidad, suma
         FROM analitica.agregados WHERE destino = 'personas' ORDER BY 1, 2, 3, 4, 5`,
      );
    const incremental = await leer();
    await recalcularAgregados(propietario, { destino: 'personas' });
    expect(await leer()).toEqual(incremental);
  });
});

describe('consultas estadísticas', () => {
  let carpetaGenerada;

  beforeAll(async () => {
    carpetaGenerada = await mkdtemp(path.join(os.tmpdir(), 'andes-estadisticas-'));
    const municipios = await cargarMunicipiosAfectados();
    for (const [tipo, conjunto, cantidad, semilla] of [
      ['personas', 'personas-simuladas', 600, 201],
      ['viviendas', 'viviendas-simuladas', 400, 202],
    ]) {
      const ruta = path.join(carpetaGenerada, `${tipo}.csv`);
      await generarArchivo({ tipo, cantidad, formato: 'csv', ruta, municipios, semilla });
      await ejecutarCarga({
        cliente: propietario,
        definicion: await leerDefinicion(conjunto),
        ruta,
        formato: 'csv',
        configuracion: entorno.configuracion,
      });
    }
  });

  afterAll(async () => {
    if (carpetaGenerada) {
      await rm(carpetaGenerada, { recursive: true, force: true });
    }
  });

  it('la población nacional cuadra con los registros vigentes', async () => {
    const { status, body } = await analista.get('/api/v1/admin/estadisticas/poblacion');
    expect(status).toBe(200);
    const { vigentes, promedio } = await una(
      "SELECT count(*) AS vigentes, avg(edad_al_evento)::float8 AS promedio FROM nucleo.personas_afectadas WHERE estado = 'VIGENTE'",
    );
    expect(body.total).toBe(vigentes);
    expect(body.edadPromedio).toBeCloseTo(promedio, 10);
    expect(body.meta).toMatchObject({
      evento: EVENTO,
      origen: 'SIMULADO',
      territorio: { codigo: '00', nivel: 'NACIONAL', nombre: 'Colombia' },
    });
    expect(body.meta.aviso).toMatch(/simulados/);
    expect(body.distribuciones.grupoEdad.map(({ categoria }) => categoria)).toEqual([
      'DE_0_A_9',
      'DE_10_A_17',
      'DE_18_A_59',
      'DE_60_O_MAS',
    ]);
    for (const distribucion of [
      'grupoEdad',
      'sexo',
      'condicion',
      'situacion',
      'condicionSalud',
      'vulnerable',
    ]) {
      expect(sumar(body.distribuciones[distribucion]), distribucion).toBe(vigentes);
    }
    expect(sumar(body.piramide)).toBe(vigentes);
    expect(sumar(body.registrosPorSemana.serie, 'valor')).toBe(vigentes);
    expect(['CRECIENTE', 'ESTABLE', 'DECRECIENTE', 'INSUFICIENTE']).toContain(
      body.registrosPorSemana.tendencia,
    );
  });

  it('filtra por municipio y por departamento', async () => {
    const municipio = await analista.get('/api/v1/admin/estadisticas/poblacion?territorio=17001');
    const { enElMunicipio } = await una(
      "SELECT count(*) AS \"enElMunicipio\" FROM nucleo.personas_afectadas WHERE estado = 'VIGENTE' AND municipio_codigo = '17001'",
    );
    expect(municipio.body.total).toBe(enElMunicipio);
    expect(municipio.body.meta.territorio).toEqual({
      codigo: '17001',
      nivel: 'MUNICIPIO',
      nombre: 'Manizales',
      departamento: { codigo: '17', nombre: 'Caldas' },
    });
    const departamento = await analista.get('/api/v1/admin/estadisticas/poblacion?territorio=17');
    const { enElDepartamento } = await una(
      `SELECT count(*) AS "enElDepartamento" FROM nucleo.personas_afectadas p
       JOIN nucleo.municipios m ON m.codigo = p.municipio_codigo
       WHERE p.estado = 'VIGENTE' AND m.departamento_codigo = '17'`,
    );
    expect(departamento.body.total).toBe(enElDepartamento);
  });

  it('responde vacío, no con ceros inventados, en un municipio sin registros', async () => {
    const { codigo } = await una(
      `SELECT codigo FROM nucleo.municipios m
       WHERE NOT EXISTS (SELECT 1 FROM nucleo.personas_afectadas p WHERE p.municipio_codigo = m.codigo)
       ORDER BY codigo LIMIT 1`,
    );
    const { body } = await analista.get(`/api/v1/admin/estadisticas/poblacion?territorio=${codigo}`);
    expect(body.total).toBe(0);
    expect(body.edadPromedio).toBeNull();
    expect(body.distribuciones.grupoEdad).toEqual([]);
    expect(body.registrosPorSemana).toMatchObject({ serie: [], tendencia: 'INSUFICIENTE' });
  });

  it('valida el territorio y el evento', async () => {
    esProblema(await analista.get('/api/v1/admin/estadisticas/poblacion?territorio=1'), 400, 'VALIDACION');
    esProblema(
      await analista.get('/api/v1/admin/estadisticas/poblacion?territorio=99999'),
      404,
      'NO_ENCONTRADO',
    );
    esProblema(await analista.get('/api/v1/admin/estadisticas/poblacion?evento=otro'), 404, 'NO_ENCONTRADO');
    esProblema(
      await request(entorno.aplicacion).get('/api/v1/admin/estadisticas/poblacion'),
      401,
      'NO_AUTENTICADO',
    );
  });

  it('el aseguramiento sale del cubo y cuadra con las viviendas vigentes', async () => {
    const { status, body } = await analista.get('/api/v1/admin/estadisticas/aseguramiento');
    expect(status).toBe(200);
    const { vigentes, aseguradas } = await una(
      `SELECT count(*) AS vigentes, count(*) FILTER (WHERE aseguramiento = 'ASEGURADA') AS aseguradas
       FROM analitica.viviendas_vigentes`,
    );
    expect(vigentes).toBeGreaterThan(0);
    expect(body.total).toBe(vigentes);
    expect(body.analisis.total).toBe(vigentes);
    expect(Object.values(body.analisis.porAseguramiento).reduce((total, valor) => total + valor, 0)).toBe(
      vigentes,
    );
    expect(body.analisis.porAseguramiento.ASEGURADA).toBe(aseguradas);
    expect(body.analisis.cobertura.minima).toBeCloseTo(aseguradas / vigentes, 12);
    expect(body.reclamaciones.aseguradas).toBe(aseguradas);
    expect(body.celdasDescartadas).toBe(0);
  });

  it('la priorización exige su permiso', async () => {
    esProblema(await ingeniero.get('/api/v1/admin/priorizacion'), 403, 'SIN_PERMISO');
  });

  it('ordena las zonas con el aviso, los pesos y el aporte de cada criterio', async () => {
    const { status, body } = await analista.get('/api/v1/admin/priorizacion?k=5');
    expect(status).toBe(200);
    const { zonas } = await una(
      'SELECT count(DISTINCT municipio_codigo) AS zonas FROM analitica.reportes_municipales WHERE evento = $1',
      [EVENTO],
    );
    expect(body.aviso).toBe(
      'Modelo analítico de carácter académico; no constituye una decisión oficial de asignación de ayudas.',
    );
    expect(body.meta).toMatchObject({ evento: EVENTO, zonas, k: 5 });
    expect(body.meta.notas[0]).toMatch(/combina cifras oficiales con datos simulados/);
    const incluidos = body.criterios.filter(({ incluido }) => incluido);
    expect(sumar(incluidos, 'peso')).toBeCloseTo(1, 12);
    expect(
      body.criterios
        .filter(({ incluido }) => !incluido)
        .map(({ codigo, motivo, peso }) => [codigo, motivo, peso]),
    ).toEqual([
      ['suministros', 'La plataforma no tiene datos para este criterio.', null],
      ['capacidad_respuesta', 'La plataforma no tiene datos para este criterio.', null],
    ]);
    expect(body.zonas).toHaveLength(5);
    body.zonas.forEach((zona, posicion) => {
      expect(zona.posicion).toBe(posicion + 1);
      expect(zona.puntaje).toBeCloseTo(sumar(zona.aportes, 'aporte'), 12);
      expect(zona.aportes.map(({ criterio }) => criterio)).toEqual(incluidos.map(({ codigo }) => codigo));
      if (posicion > 0) {
        expect(zona.puntaje).toBeLessThanOrEqual(body.zonas[posicion - 1].puntaje);
      }
    });
  });

  it('usa el tamaño de la configuración y valida el que llega', async () => {
    const { body } = await analista.get('/api/v1/admin/priorizacion');
    expect(body.meta.k).toBe(20);
    expect(body.zonas).toHaveLength(20);
    esProblema(await analista.get('/api/v1/admin/priorizacion?k=0'), 400, 'VALIDACION');
    esProblema(await analista.get('/api/v1/admin/priorizacion?k=101'), 400, 'VALIDACION');
  });

  it('recalcula con pesos propios y compara cada zona con los pesos configurados', async () => {
    const base = await analista.get('/api/v1/admin/priorizacion?k=10');
    expect(base.body.meta.pesosPersonalizados).toBe(false);
    expect(
      base.body.zonas.every(
        ({ cambio, posicion, posicionBase }) => cambio === 0 && posicion === posicionBase,
      ),
    ).toBe(true);
    expect(base.body.salientes).toEqual([]);

    const { status, body } = await analista.get(
      '/api/v1/admin/priorizacion?k=10&pesos=personas_afectadas:100,personas_vulnerables:0,viviendas_destruidas:0,infraestructura_critica:0',
    );
    expect(status).toBe(200);
    expect(body.meta.pesosPersonalizados).toBe(true);
    expect(
      Object.fromEntries(
        body.criterios.filter(({ incluido }) => incluido).map(({ codigo, peso }) => [codigo, peso]),
      ),
    ).toEqual({
      personas_afectadas: 1,
      personas_vulnerables: 0,
      viviendas_destruidas: 0,
      infraestructura_critica: 0,
    });
    const posicionesBase = new Map(base.body.zonas.map(({ codigo, posicion }) => [codigo, posicion]));
    for (const zona of body.zonas) {
      expect(zona.cambio).toBe(zona.posicionBase - zona.posicion);
      if (posicionesBase.has(zona.codigo)) {
        expect(zona.posicionBase).toBe(posicionesBase.get(zona.codigo));
      }
    }
    expect(body.salientes).toHaveLength(body.zonas.filter(({ posicionBase }) => posicionBase > 10).length);
    for (const zona of body.salientes) {
      expect(posicionesBase.get(zona.codigo)).toBe(zona.posicionBase);
      expect(zona.posicion).toBeGreaterThan(10);
    }
  });

  it('conserva el reparto configurado de los criterios que no reciben peso', async () => {
    const { body } = await analista.get('/api/v1/admin/priorizacion?pesos=personas_afectadas:50');
    const incluidos = body.criterios.filter(({ incluido }) => incluido);
    const configurado = incluidos.reduce((suma, { pesoConfigurado }) => suma + pesoConfigurado, 0);
    const repartos = incluidos.map(({ codigo, pesoConfigurado }) =>
      codigo === 'personas_afectadas' ? 50 : (pesoConfigurado / configurado) * 100,
    );
    const total = repartos.reduce((suma, valor) => suma + valor, 0);
    incluidos.forEach(({ peso }, posicion) => {
      expect(peso).toBeCloseTo(repartos[posicion] / total, 12);
    });
  });

  it.each([
    ['un formato distinto', 'personas_afectadas=50'],
    ['un criterio inexistente', 'no_existe:10'],
    ['un peso mayor que cien', 'personas_afectadas:101'],
    [
      'todos los pesos en cero',
      'personas_afectadas:0,personas_vulnerables:0,viviendas_destruidas:0,infraestructura_critica:0',
    ],
  ])('rechaza pesos con %s', async (_, pesos) => {
    esProblema(
      await analista.get(`/api/v1/admin/priorizacion?pesos=${encodeURIComponent(pesos)}`),
      400,
      'VALIDACION',
    );
  });
});
