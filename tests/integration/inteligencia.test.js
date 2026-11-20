import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { exportarModelo, listarVistas } from '../../analytics/powerbi/exportacion.js';
import { cargarMedidas, describirMedida } from '../../analytics/powerbi/medidas.js';
import { leerKpi } from '../../backend/src/config/kpi.js';
import { cargarMunicipiosAfectados } from '../../data/generador/registros/contexto.js';
import { SIN_DEFECTOS } from '../../data/generador/registros/defectos.js';
import { generarArchivo } from '../../data/generador/registros/generar.js';
import { leerDefinicion } from '../../etl/nucleo/definiciones.js';
import { ejecutarCarga } from '../../etl/proceso.js';
import {
  EVENTO,
  conectarComoPropietario,
  configuracionDePrueba,
  crearEntornoDePrueba,
  esProblema,
  prepararBaseAislada,
} from './apoyo.js';

const UMBRAL = 10;
const CLAVES_QUE_NO_SON_CONTEOS = new Set(['porcentajeMinimo', 'porcentajeMaximo', 'umbralDePublicacion']);
const RELACIONES = Object.freeze([
  ...[
    'hecho_personas_afectadas',
    'hecho_vulnerabilidad',
    'hecho_viviendas_afectadas',
    'hecho_afectacion_municipal',
    'hecho_infraestructura',
  ].map((hecho) => [hecho, 'codigo_municipio', 'dim_geografia', 'codigo_municipio']),
  ['hecho_personas_afectadas', 'perfil_clave', 'dim_poblacion', 'perfil_clave'],
  ['hecho_vulnerabilidad', 'vulnerabilidad', 'dim_vulnerabilidad', 'vulnerabilidad'],
  ['hecho_viviendas_afectadas', 'vivienda_clave', 'dim_vivienda', 'vivienda_clave'],
  ['hecho_viviendas_afectadas', 'aseguramiento_clave', 'dim_aseguramiento', 'aseguramiento_clave'],
  ['hecho_infraestructura', 'tipo_infraestructura', 'dim_infraestructura', 'tipo_infraestructura'],
  ['hecho_danos_economicos', 'concepto_clave', 'dim_economia', 'concepto_clave'],
  ['hecho_reclamaciones_seguros', 'codigo_departamento', 'dim_departamento', 'codigo_departamento'],
  ['hecho_indicadores', 'indicador', 'dim_indicador', 'indicador'],
  ['dim_geografia', 'codigo_departamento', 'dim_departamento', 'codigo_departamento'],
]);

let cliente;
let entorno;
let carpeta;
let vistas;

const filas = async (sql, parametros = []) => (await cliente.query(sql, parametros)).rows;
const una = async (sql, parametros) => (await filas(sql, parametros))[0];
const publica = (ruta) => request(entorno.aplicacion).get(`/api/v1/eventos/${EVENTO}${ruta}`);

async function cargarRegistros(baseDeDatos) {
  const configuracion = configuracionDePrueba(baseDeDatos);
  const municipios = await cargarMunicipiosAfectados();
  for (const [tipo, conjunto, cantidad, semilla] of [
    ['personas', 'personas-simuladas', 3000, 51],
    ['viviendas', 'viviendas-simuladas', 2500, 52],
  ]) {
    const ruta = path.join(carpeta, `${tipo}.csv`);
    await generarArchivo({ tipo, cantidad, formato: 'csv', ruta, municipios, semilla, tasas: SIN_DEFECTOS });
    await ejecutarCarga({
      cliente,
      definicion: await leerDefinicion(conjunto),
      ruta,
      formato: 'csv',
      configuracion,
    });
  }
}

async function comoPowerBi(sql) {
  await cliente.query('BEGIN');
  try {
    await cliente.query('SET LOCAL ROLE powerbi_lector');
    return { filas: (await cliente.query(sql)).rows };
  } catch (error) {
    return { codigo: error.code };
  } finally {
    await cliente.query('ROLLBACK');
  }
}

function conteosPublicados(valor, clave = null, encontrados = []) {
  if (Array.isArray(valor)) {
    valor.forEach((elemento) => conteosPublicados(elemento, clave, encontrados));
  } else if (valor && typeof valor === 'object') {
    for (const [hija, contenido] of Object.entries(valor)) {
      conteosPublicados(contenido, hija, encontrados);
    }
  } else if (typeof valor === 'number' && !CLAVES_QUE_NO_SON_CONTEOS.has(clave)) {
    encontrados.push({ clave, valor });
  }
  return encontrados;
}

const ocultas = (lista) => lista.filter((valor) => valor === null).length;
const conValor = (lista) => lista.some((valor) => valor !== null && valor > 0);

beforeAll(async () => {
  const baseDeDatos = await prepararBaseAislada('bi');
  cliente = await conectarComoPropietario(baseDeDatos);
  carpeta = await mkdtemp(path.join(os.tmpdir(), 'andes-bi-'));
  await cargarRegistros(baseDeDatos);
  entorno = crearEntornoDePrueba({ baseDeDatos });
  vistas = await listarVistas(cliente);
}, 120_000);

afterAll(async () => {
  await entorno?.cerrar();
  await cliente?.end();
  if (carpeta) {
    await rm(carpeta, { recursive: true, force: true });
  }
});

describe('modelo en estrella', () => {
  it('tiene las 21 vistas del esquema bi', () => {
    expect(vistas.map(({ vista }) => vista)).toHaveLength(21);
    expect(vistas.every(({ vista }) => /^(dim|hecho)_[a-z_]+$/.test(vista))).toBe(true);
  });

  it('suma en sus hechos exactamente los registros vigentes', async () => {
    const { personas, vigentes } = await una(
      `SELECT (SELECT sum(personas) FROM bi.hecho_personas_afectadas) AS personas,
              (SELECT count(*) FROM analitica.personas_vigentes) AS vigentes`,
    );
    expect(Number(personas)).toBe(Number(vigentes));
    expect(Number(vigentes)).toBeGreaterThan(2900);
    const viviendas = await una(
      `SELECT (SELECT sum(viviendas) FROM bi.hecho_viviendas_afectadas) AS hechos,
              (SELECT count(*) FROM analitica.viviendas_vigentes) AS vigentes`,
    );
    expect(Number(viviendas.hechos)).toBe(Number(viviendas.vigentes));
  });

  it.each(RELACIONES)('cada %s.%s tiene pareja en %s', async (hecho, columna, dimension, clave) => {
    const { huerfanas } = await una(
      `SELECT count(*) AS huerfanas FROM bi.${hecho} h
       WHERE h.${columna} IS NOT NULL AND NOT EXISTS (SELECT 1 FROM bi.${dimension} d WHERE d.${clave} = h.${columna})`,
    );
    expect(Number(huerfanas)).toBe(0);
  });

  it('relaciona cada fecha de un hecho con dim_tiempo y cada fuente con dim_fuente', async () => {
    for (const { vista } of vistas.filter(({ vista: nombre }) => nombre.startsWith('hecho_'))) {
      const { fechas, fuentes } = await una(
        `SELECT count(*) FILTER (WHERE h.fecha IS NOT NULL AND t.fecha IS NULL) AS fechas,
                count(*) FILTER (WHERE f.fuente_id IS NULL) AS fuentes
         FROM bi.${vista} h
         LEFT JOIN bi.dim_tiempo t ON t.fecha = h.fecha
         LEFT JOIN bi.dim_fuente f ON f.fuente_id = h.fuente_id`,
      );
      expect([vista, Number(fechas), Number(fuentes)]).toEqual([vista, 0, 0]);
    }
  });
});

describe('nombres de las categorías', () => {
  it('son los mismos en el portal y en el modelo en estrella', async () => {
    const diferencias = await filas(
      `WITH bi AS (
         SELECT DISTINCT 'personas' AS destino, 'grupo_edad' AS dimension, grupo_edad AS categoria, grupo_edad_nombre AS nombre FROM bi.dim_poblacion
         UNION SELECT DISTINCT 'personas', 'sexo', sexo, sexo_nombre FROM bi.dim_poblacion
         UNION SELECT DISTINCT 'personas', 'condicion', condicion, condicion_nombre FROM bi.dim_poblacion
         UNION SELECT DISTINCT 'personas', 'grupo_condicion', grupo_condicion, grupo_condicion_nombre FROM bi.dim_poblacion
         UNION SELECT DISTINCT 'personas', 'tenencia', tenencia, tenencia_nombre FROM bi.dim_poblacion
         UNION SELECT DISTINCT 'personas', 'situacion', situacion, situacion_nombre FROM bi.dim_poblacion
         UNION SELECT DISTINCT 'personas', 'condicion_salud', condicion_salud, condicion_salud_nombre FROM bi.dim_poblacion
         UNION SELECT DISTINCT 'personas', 'vulnerable', con_vulnerabilidad, con_vulnerabilidad_nombre FROM bi.dim_poblacion
         UNION SELECT DISTINCT 'personas', 'vulnerabilidad', vulnerabilidad, vulnerabilidad_nombre FROM bi.dim_vulnerabilidad
         UNION SELECT DISTINCT 'viviendas', 'estado_fisico', estado_fisico, estado_fisico_nombre FROM bi.dim_vivienda
         UNION SELECT DISTINCT 'viviendas', 'ocupacion', ocupacion, ocupacion_nombre FROM bi.dim_vivienda
         UNION SELECT DISTINCT 'viviendas', 'financiacion', financiacion, financiacion_nombre FROM bi.dim_vivienda
         UNION SELECT DISTINCT 'viviendas', 'zona', zona, zona_nombre FROM bi.dim_vivienda
         UNION SELECT DISTINCT 'viviendas', 'estrato', estrato, estrato_nombre FROM bi.dim_vivienda
         UNION SELECT DISTINCT 'viviendas', 'aseguramiento', condicion, condicion_nombre FROM bi.dim_aseguramiento
         UNION SELECT DISTINCT 'viviendas', 'reclamacion', reclamacion, reclamacion_nombre FROM bi.dim_aseguramiento
       ),
       portal AS (SELECT destino, dimension, categoria, nombre FROM analitica.categorias_de_registros)
       (SELECT 'solo en bi' AS lado, * FROM bi EXCEPT SELECT 'solo en bi', * FROM portal)
       UNION ALL
       (SELECT 'solo en el portal', * FROM portal EXCEPT SELECT 'solo en el portal', * FROM bi)`,
    );
    expect(diferencias).toEqual([]);
  });
});

describe('cuenta de Power BI', () => {
  it('lee las vistas del esquema bi', async () => {
    const { filas: resultado, codigo } = await comoPowerBi('SELECT count(*) AS eventos FROM bi.dim_evento');
    expect(codigo).toBeUndefined();
    expect(Number(resultado[0].eventos)).toBe(1);
  });

  it.each([
    'SELECT 1 FROM nucleo.personas_afectadas LIMIT 1',
    'SELECT 1 FROM analitica.agregados LIMIT 1',
    'SELECT 1 FROM analitica.agregados_publicables LIMIT 1',
    'SELECT 1 FROM seguridad.usuarios LIMIT 1',
    'SELECT 1 FROM staging.filas_rechazadas LIMIT 1',
    'CREATE TABLE bi.intrusa (id integer)',
  ])('no puede ejecutar %s', async (sql) => {
    expect((await comoPowerBi(sql)).codigo).toBe('42501');
  });
});

describe('medidas DAX frente al modelo', () => {
  let medidas;
  let columnas;

  beforeAll(async () => {
    medidas = await cargarMedidas();
    columnas = new Map(vistas.map(({ vista, columnas: lista }) => [vista, new Set(lista)]));
  });

  it('solo nombran tablas y columnas que existen', () => {
    const faltantes = medidas.flatMap((medida) => {
      const { tablas, columnas: usadas } = describirMedida(medida);
      return [
        ...tablas.filter((tabla) => !columnas.has(tabla)).map((tabla) => `${medida.nombre}: ${tabla}`),
        ...usadas
          .filter(({ tabla, columna }) => !columnas.get(tabla)?.has(columna))
          .map(({ tabla, columna }) => `${medida.nombre}: ${tabla}[${columna}]`),
      ];
    });
    expect(faltantes).toEqual([]);
  });

  it('solo filtran por valores que aparecen en su columna', async () => {
    const faltantes = [];
    for (const medida of medidas) {
      for (const { tabla, columna, valores } of describirMedida(medida).filtros) {
        for (const valor of valores) {
          const encontrada = await una(`SELECT 1 AS hay FROM bi.${tabla} WHERE ${columna} = $1 LIMIT 1`, [
            valor,
          ]);
          if (!encontrada) {
            faltantes.push(`${medida.nombre}: ${tabla}[${columna}] = ${valor}`);
          }
        }
      }
    }
    expect(faltantes).toEqual([]);
  });
});

describe('exportación del modelo', () => {
  it('escribe cada vista en un CSV con su manifiesto', async () => {
    const salida = path.join(carpeta, 'exportacion');
    const { archivos } = await exportarModelo({
      cliente,
      carpeta: salida,
      ahora: () => new Date('2026-11-19T00:00:00Z'),
    });
    expect((await readdir(salida)).sort()).toEqual(
      [...archivos.map(({ archivo }) => archivo), 'manifiesto.json'].sort(),
    );
    const manifiesto = JSON.parse(await readFile(path.join(salida, 'manifiesto.json'), 'utf8'));
    expect(manifiesto.generadoEn).toBe('2026-11-19T00:00:00.000Z');
    for (const { vista, archivo, filas: cantidad, columnas: lista, bytes, sha256 } of manifiesto.archivos) {
      const contenido = await readFile(path.join(salida, archivo));
      expect(contenido.subarray(0, 3)).toEqual(Buffer.from([0xef, 0xbb, 0xbf]));
      expect(contenido.length).toBe(bytes);
      expect(createHash('sha256').update(contenido).digest('hex')).toBe(sha256);
      expect(contenido.subarray(3).toString('utf8').split('\n')[0]).toBe(lista.join(','));
      const { total } = await una(`SELECT count(*) AS total FROM bi.${vista}`);
      expect([vista, cantidad]).toEqual([vista, Number(total)]);
    }
  });
});

describe('indicadores clave', () => {
  let respuesta;
  const porCodigo = (codigo) => respuesta.body.kpi.find((kpi) => kpi.codigo === codigo);

  beforeAll(async () => {
    respuesta = await publica('/kpi');
  });

  it('devuelve los trece indicadores del catálogo en su orden', async () => {
    expect(respuesta.status).toBe(200);
    const { kpi } = await leerKpi();
    expect(respuesta.body.kpi.map(({ codigo }) => codigo)).toEqual(kpi.map(({ codigo }) => codigo));
    expect(respuesta.body.meta.umbralDePublicacion).toBe(UMBRAL);
  });

  it('calcula los oficiales con las cifras cargadas', async () => {
    const ultimo = async (indicador) =>
      Number(
        (
          await una(
            `SELECT max(valor) AS valor FROM analitica.valores_indicador
             WHERE evento = $1 AND indicador_codigo = $2
               AND fecha_corte = (SELECT max(fecha_corte) FROM analitica.valores_indicador WHERE evento = $1 AND indicador_codigo = $2)`,
            [EVENTO, indicador],
          )
        ).valor,
      );
    const proporcion = porCodigo('proporcion_viviendas_destruidas');
    expect(proporcion.valor).toBeCloseTo(
      ((await ultimo('viviendas_destruidas')) / (await ultimo('viviendas_afectadas'))) * 100,
      10,
    );
    expect(proporcion.variacion).toMatchObject({ corteAnterior: '2026-08-15', valoracion: null });
    expect(porCodigo('fallecidos_por_cien_mil_afectados').valor).toBeCloseTo(
      ((await ultimo('fallecidos')) / (await ultimo('personas_afectadas'))) * 100_000,
      10,
    );
    expect(porCodigo('avance_reconstruccion_vivienda').calificador).toBe('más de');
    expect(porCodigo('desembolso_recursos_publicos').calificador).toBe('cerca de');
  });

  it('calcula la concentración territorial con los diez municipios mayores', async () => {
    const { diez, total } = await una(
      `WITH m AS (SELECT valor FROM analitica.valores_municipales WHERE evento = $1 AND variable_codigo = 'personas')
       SELECT (SELECT sum(valor) FROM (SELECT valor FROM m ORDER BY valor DESC LIMIT 10) d) AS diez, sum(valor) AS total FROM m`,
      [EVENTO],
    );
    expect(porCodigo('concentracion_territorial').valor).toBeCloseTo(
      (Number(diez) / Number(total)) * 100,
      10,
    );
  });

  it('nunca publica un numerador o un denominador simulado con menos de diez registros', () => {
    for (const kpi of respuesta.body.kpi.filter(
      ({ origen, estado }) => origen === 'SIMULADO' && estado === 'disponible',
    )) {
      expect(kpi.numerador.valor).toBeGreaterThanOrEqual(UMBRAL);
      expect(kpi.denominador.valor).toBeGreaterThanOrEqual(UMBRAL);
    }
  });

  it.each([
    "/api/v1/eventos/sismo'%20OR%20'1'%3D'1/kpi",
    '/api/v1/eventos/sismo%3B%20DROP%20TABLE%20nucleo.personas_afectadas/registros/poblacion',
    '/api/v1/eventos/%3Cscript%3E/registros/viviendas',
  ])('rechaza el intento de inyección %s', async (ruta) => {
    esProblema(await request(entorno.aplicacion).get(ruta), 400, 'VALIDACION');
  });

  it('responde 404 para un evento inexistente', async () => {
    esProblema(await request(entorno.aplicacion).get('/api/v1/eventos/no-existe/kpi'), 404, 'NO_ENCONTRADO');
  });
});

describe('registros publicables (RNF-06)', () => {
  let poblacion;
  let viviendas;

  beforeAll(async () => {
    [poblacion, viviendas] = await Promise.all([
      publica('/registros/poblacion'),
      publica('/registros/viviendas'),
    ]);
  });

  it('responden con los registros cargados', () => {
    expect([poblacion.status, viviendas.status]).toEqual([200, 200]);
    expect(poblacion.body.tamanoMuestra).toBeGreaterThan(2900);
    expect(poblacion.body.meta).toMatchObject({ origen: 'SIMULADO', umbralDePublicacion: UMBRAL });
    expect(viviendas.body.tamanoMuestra).toBeGreaterThan(2400);
  });

  it('ocultan celdas pequeñas en los datos de la prueba, así que la supresión sí se ejerce', () => {
    const nulos = (valor) => JSON.stringify(valor).match(/null/g)?.length ?? 0;
    expect(nulos(viviendas.body.financiacionPorAseguramiento.valores)).toBeGreaterThan(0);
    expect(nulos(poblacion.body.condicionSalud)).toBeGreaterThan(1);
  });

  it('no publican ningún conteo entre 1 y 9', () => {
    const pequenos = [...conteosPublicados(poblacion.body), ...conteosPublicados(viviendas.body)].filter(
      ({ valor }) => valor > 0 && valor < UMBRAL,
    );
    expect(pequenos).toEqual([]);
  });

  it('no dejan una sola celda oculta en una partición', () => {
    const particiones = [
      ...['gruposEdad', 'condicionInstitucional', 'tenencia', 'situacion', 'condicionSalud'].map((clave) =>
        poblacion.body[clave].map(({ personas }) => personas),
      ),
      poblacion.body.evolucion.registradas,
      ...['estadoFisico', 'financiacion'].map((clave) =>
        viviendas.body[clave].map(({ viviendas: valor }) => valor),
      ),
    ];
    for (const particion of particiones) {
      expect(ocultas(particion) === 1 && conValor(particion)).toBe(false);
    }
  });

  it('no dejan una sola celda oculta en una fila o columna de un cruce', () => {
    for (const { valores } of [
      viviendas.body.estadoPorAseguramiento,
      viviendas.body.financiacionPorAseguramiento,
    ]) {
      const columnas = valores[0].map((_, x) => valores.map((fila) => fila[x]));
      for (const linea of [...valores, ...columnas]) {
        expect(ocultas(linea) === 1 && conValor(linea)).toBe(false);
      }
    }
  });

  it('coinciden con los indicadores clave que usan las mismas celdas', async () => {
    const { body } = await publica('/kpi');
    const destruidas = body.kpi.find(({ codigo }) => codigo === 'destruidas_con_poliza');
    const { conPoliza } = viviendas.body.coberturaDestruidas;
    if (conPoliza === null) {
      expect(destruidas.estado).toBe('sin-dato');
    } else {
      expect(destruidas.numerador.valor).toBe(conPoliza);
    }
    const cobertura = body.kpi.find(({ codigo }) => codigo === 'cobertura_aseguramiento');
    expect(cobertura.numerador.valor).toBe(viviendas.body.embudoReclamaciones[0].viviendas);
  });

  it('entregan la página pública de comparación', async () => {
    const respuesta = await request(entorno.aplicacion).get('/comparar');
    expect(respuesta.status).toBe(200);
    expect(respuesta.text).toMatch(/Comparar territorios y cortes/);
  });
});
