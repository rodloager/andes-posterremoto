import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import pg from 'pg';
import pino from 'pino';
import { crearAplicacion } from '../../backend/src/app.js';
import { configuracionDeConexion, crearConexiones } from '../../backend/src/config/baseDeDatos.js';
import { leerEntorno } from '../../backend/src/config/entorno.js';
import { percentil, crearMetricas } from '../../backend/src/services/metricas.js';
import { prepararBaseDeDatosAislada } from '../../database/preparacion.js';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const BASE_DE_MEDICION = 'andes_medicion_api';
const EVENTO = 'sismo-2026-08-10';
const P95_MAXIMO_MS = 300;
const CALENTAMIENTO = 30;
const ARCHIVOS = Object.freeze([
  ['personas-simuladas', 'personas-1000000-s20260810.csv'],
  ['viviendas-simuladas', 'viviendas-50000-s20261111.csv'],
]);
const RUTAS = Object.freeze([
  '/api/v1/estado',
  '/api/v1/fuentes',
  `/api/v1/eventos/${EVENTO}`,
  `/api/v1/eventos/${EVENTO}/indicadores`,
  `/api/v1/eventos/${EVENTO}/territorio`,
  `/api/v1/eventos/${EVENTO}/territorio/departamentos/27`,
  `/api/v1/eventos/${EVENTO}/seguros`,
  `/api/v1/eventos/${EVENTO}/economia`,
  `/api/v1/eventos/${EVENTO}/kpi`,
  `/api/v1/eventos/${EVENTO}/registros/poblacion`,
  `/api/v1/eventos/${EVENTO}/registros/viviendas`,
  '/api/v1/municipios?prefijo=san',
]);
const SIN_LIMITE = Object.freeze({
  api: { ventanaMs: 60_000, maximo: Number.MAX_SAFE_INTEGER },
  sesion: { ventanaMs: 60_000, maximo: Number.MAX_SAFE_INTEGER },
});

const { values: opciones } = parseArgs({
  options: {
    solicitudes: { type: 'string', default: '500' },
    concurrencia: { type: 'string', default: '8' },
    reutilizar: { type: 'boolean', default: false },
  },
});
const solicitudesPorRuta = Number(opciones.solicitudes);
const concurrencia = Number(opciones.concurrencia);
const escribir = (texto = '') => process.stdout.write(`${texto}\n`);
const redondear = (valor) => (valor === null ? null : Math.round(valor * 10) / 10);

function ejecutar(argumentos, entorno) {
  return new Promise((resolver, rechazar) => {
    const proceso = spawn(process.execPath, argumentos, { cwd: raiz, env: entorno, stdio: 'ignore' });
    proceso.on('error', rechazar);
    proceso.on('close', (codigo) =>
      codigo === 0
        ? resolver()
        : rechazar(new Error(`${argumentos.join(' ')} terminó con el código ${codigo}`)),
    );
  });
}

async function contarRegistros(configuracion) {
  const cliente = new pg.Client(configuracionDeConexion(configuracion, 'propietario'));
  await cliente.connect();
  try {
    const { rows } = await cliente.query(
      `SELECT (SELECT count(*) FROM nucleo.personas_afectadas)::int AS personas,
              (SELECT count(*) FROM nucleo.viviendas)::int AS viviendas,
              current_setting('server_version') AS version`,
    );
    return rows[0];
  } catch {
    return null;
  } finally {
    await cliente.end();
  }
}

async function prepararDatos() {
  const configuracion = leerEntorno({ ...process.env, BD_NOMBRE: BASE_DE_MEDICION });
  const existentes = opciones.reutilizar ? await contarRegistros(configuracion) : null;
  if (existentes?.personas > 0 && existentes.viviendas > 0) {
    escribir(
      `Reutilizo ${BASE_DE_MEDICION}: ${existentes.personas} personas y ${existentes.viviendas} viviendas.`,
    );
    return configuracion;
  }
  for (const [, archivo] of ARCHIVOS) {
    if (!existsSync(path.join(raiz, 'data', 'raw', 'generador-andes', archivo))) {
      throw new Error(`Falta data/raw/generador-andes/${archivo}. Genéralo con npm run datos:registros.`);
    }
  }
  escribir(`Preparando ${BASE_DE_MEDICION} y cargando un millón de personas y 50.000 viviendas…`);
  await prepararBaseDeDatosAislada({ nombre: BASE_DE_MEDICION });
  for (const [conjunto, archivo] of ARCHIVOS) {
    await ejecutar(
      [
        'etl/cli.js',
        'cargar',
        '--conjunto',
        conjunto,
        '--archivo',
        path.join('data', 'raw', 'generador-andes', archivo),
      ],
      { ...process.env, BD_NOMBRE: BASE_DE_MEDICION },
    );
  }
  return configuracion;
}

async function medirRuta(conexiones, configuracion, ruta) {
  const metricas = crearMetricas({ capacidadDuraciones: solicitudesPorRuta });
  const { aplicacion, cerrar } = crearAplicacion({
    configuracion,
    conexiones,
    registro: pino({ level: 'silent' }),
    metricas,
    limites: SIN_LIMITE,
  });
  const servidor = createServer(aplicacion);
  await new Promise((resolver) => servidor.listen(0, '127.0.0.1', resolver));
  const direccion = `http://127.0.0.1:${servidor.address().port}${ruta}`;
  const pedir = async () => {
    const inicio = performance.now();
    const respuesta = await fetch(direccion, { headers: { Accept: 'application/json' } });
    const cuerpo = await respuesta.arrayBuffer();
    return { estado: respuesta.status, ms: performance.now() - inicio, bytes: cuerpo.byteLength };
  };
  try {
    for (let vuelta = 0; vuelta < CALENTAMIENTO; vuelta += 1) {
      await pedir();
    }
    const duraciones = [];
    let errores = 0;
    let bytes = 0;
    let pendientes = solicitudesPorRuta;
    await Promise.all(
      Array.from({ length: concurrencia }, async () => {
        while (pendientes > 0) {
          pendientes -= 1;
          const resultado = await pedir();
          duraciones.push(resultado.ms);
          bytes = resultado.bytes;
          errores += resultado.estado === 200 ? 0 : 1;
        }
      }),
    );
    const patron = metricas
      .resumen()
      .masFrecuentes.find(({ solicitudes }) => solicitudes >= solicitudesPorRuta);
    return {
      ruta,
      solicitudes: duraciones.length,
      errores,
      bytes,
      cliente: {
        p50Ms: redondear(percentil(duraciones, 0.5)),
        p95Ms: redondear(percentil(duraciones, 0.95)),
        p99Ms: redondear(percentil(duraciones, 0.99)),
        maximoMs: redondear(Math.max(...duraciones)),
      },
      servidor: { patron: patron?.ruta ?? null, p95Ms: redondear(patron?.p95Ms ?? null) },
    };
  } finally {
    cerrar();
    await new Promise((resolver) => servidor.close(resolver));
  }
}

const configuracion = await prepararDatos();
const registros = await contarRegistros(configuracion);
const conexiones = crearConexiones(configuracion);
const rutas = [];
try {
  for (const ruta of RUTAS) {
    const medicion = await medirRuta(conexiones, configuracion, ruta);
    rutas.push({ ...medicion, cumple: medicion.errores === 0 && medicion.servidor.p95Ms <= P95_MAXIMO_MS });
    escribir(
      `${ruta.padEnd(58)} servidor p95 ${String(medicion.servidor.p95Ms).padStart(6)} ms · cliente p95 ${String(medicion.cliente.p95Ms).padStart(6)} ms · ${medicion.errores} errores`,
    );
  }
} finally {
  await conexiones.cerrar();
}

const resultado = {
  medidoEn: new Date().toISOString(),
  baseDeDatos: BASE_DE_MEDICION,
  registros: { personas: registros.personas, viviendas: registros.viviendas },
  carga: { solicitudesPorRuta, concurrencia, calentamientoPorRuta: CALENTAMIENTO },
  criterio: {
    p95MaximoMs: P95_MAXIMO_MS,
    medida: 'p95 del servidor, el mismo cálculo del panel de ingeniería',
  },
  rutas,
  cumple: rutas.every(({ cumple }) => cumple),
  equipo: {
    node: process.version,
    postgres: registros.version,
    sistema: `${os.type()} ${os.release()}`,
    procesador: os.cpus()[0]?.model ?? 'desconocido',
    nucleos: os.cpus().length,
    memoriaGb: Math.round(os.totalmem() / 1024 ** 3),
  },
};
const carpeta = path.join(raiz, 'analytics', 'benchmarks', 'resultados');
await mkdir(carpeta, { recursive: true });
await writeFile(path.join(carpeta, 'api.json'), `${JSON.stringify(resultado, null, 2)}\n`, 'utf8');
escribir();
escribir(
  `${registros.personas} personas y ${registros.viviendas} viviendas. ${resultado.cumple ? 'Todas las rutas' : 'NO todas las rutas'} cumplen p95 ≤ ${P95_MAXIMO_MS} ms.`,
);
escribir('Resultado: analytics/benchmarks/resultados/api.json');
