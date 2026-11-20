import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import pg from 'pg';
import { configuracionDeConexion } from '../../backend/src/config/baseDeDatos.js';
import { prepararBaseDeDatosAislada } from '../../database/preparacion.js';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const BASE_DE_MEDICION = 'andes_medicion';
const SEMILLA = 20260810;
const CONJUNTOS = Object.freeze({ personas: 'personas-simuladas', viviendas: 'viviendas-simuladas' });
const TABLAS = Object.freeze({ personas: 'nucleo.personas_afectadas', viviendas: 'nucleo.viviendas' });

const { values: opciones } = parseArgs({
  options: {
    tipo: { type: 'string', default: 'personas' },
    cantidad: { type: 'string', default: '1000000' },
    formato: { type: 'string', default: 'csv' },
    monton: { type: 'string', default: '96' },
  },
});

const cantidad = Number(opciones.cantidad.replaceAll('_', ''));
if (!CONJUNTOS[opciones.tipo] || !Number.isInteger(cantidad) || cantidad < 1) {
  process.stderr.write(
    'Uso: npm run medir:etl -- --tipo personas|viviendas --cantidad 1000000 [--formato csv] [--monton 96]\n',
  );
  process.exit(1);
}

function ejecutar(argumentos, entorno = process.env) {
  return new Promise((resolver, rechazar) => {
    const proceso = spawn(process.execPath, argumentos, {
      cwd: raiz,
      env: entorno,
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    let salida = '';
    proceso.stdout.on('data', (fragmento) => {
      salida += fragmento;
    });
    proceso.on('error', rechazar);
    proceso.on('close', (codigo) =>
      codigo === 0
        ? resolver(salida)
        : rechazar(new Error(`${argumentos.join(' ')} terminó con el código ${codigo}`)),
    );
  });
}

const archivo = path.join(
  raiz,
  'data',
  'raw',
  'generador-andes',
  `${opciones.tipo}-${cantidad}-s${SEMILLA}.${opciones.formato}`,
);
if (!existsSync(archivo) || !existsSync(`${archivo}.manifiesto.json`)) {
  process.stdout.write(`Generando ${path.relative(raiz, archivo)}…\n`);
  await ejecutar([
    'data/generador/generar-registros.js',
    '--tipo',
    opciones.tipo,
    '--cantidad',
    String(cantidad),
    '--formato',
    opciones.formato,
    '--semilla',
    String(SEMILLA),
  ]);
}
const manifiesto = JSON.parse(await readFile(`${archivo}.manifiesto.json`, 'utf8'));

process.stdout.write(`Preparando la base de datos ${BASE_DE_MEDICION}…\n`);
const configuracion = await prepararBaseDeDatosAislada({ nombre: BASE_DE_MEDICION });

process.stdout.write(`Cargando ${manifiesto.filas} filas con un montón de ${opciones.monton} MB…\n`);
const inicio = performance.now();
const salida = await ejecutar(
  [
    `--max-old-space-size=${opciones.monton}`,
    'etl/cli.js',
    'cargar',
    '--conjunto',
    CONJUNTOS[opciones.tipo],
    '--archivo',
    archivo,
  ],
  { ...process.env, BD_NOMBRE: BASE_DE_MEDICION },
);
const segundosDelProceso = (performance.now() - inicio) / 1000;

const cliente = new pg.Client(configuracionDeConexion(configuracion, 'propietario'));
await cliente.connect();
let ejecucion;
let registros;
let version;
try {
  ({
    rows: [ejecucion],
  } = await cliente.query(
    'SELECT * FROM nucleo.ejecuciones_etl WHERE conjunto_id = $1 ORDER BY id DESC LIMIT 1',
    [CONJUNTOS[opciones.tipo]],
  ));
  ({
    rows: [registros],
  } = await cliente.query(
    `SELECT count(*) AS total, count(*) FILTER (WHERE estado = 'VIGENTE') AS vigentes,
            count(*) FILTER (WHERE estado = 'EN_REVISION') AS en_revision
     FROM ${TABLAS[opciones.tipo]}`,
  ));
  ({
    rows: [{ version }],
  } = await cliente.query("SELECT current_setting('server_version') AS version"));
} finally {
  await cliente.end();
}

const segundos = ejecucion.duracion_ms / 1000;
const resultado = {
  medidoEn: new Date().toISOString(),
  conjunto: CONJUNTOS[opciones.tipo],
  formato: opciones.formato,
  archivo: {
    ruta: path.relative(raiz, archivo),
    bytes: (await stat(archivo)).size,
    huella: manifiesto.huella,
  },
  limiteDelMontonMb: Number(opciones.monton),
  ejecucion: {
    id: ejecucion.id,
    estado: ejecucion.estado,
    duracionMs: ejecucion.duracion_ms,
    segundosDelProceso: Math.round(segundosDelProceso * 10) / 10,
    filasPorSegundo: Math.round(ejecucion.filas_leidas / segundos),
    memoriaMaximaMb: Number(ejecucion.memoria_maxima_mb),
    filasLeidas: ejecucion.filas_leidas,
    filasValidas: ejecucion.filas_validas,
    filasRechazadas: ejecucion.filas_rechazadas,
    duplicadosExactos: ejecucion.duplicados,
    enRevision: ejecucion.en_revision,
  },
  registros,
  esperado: {
    filas: manifiesto.filas,
    validas: manifiesto.validasEsperadas,
    rechazadas: manifiesto.rechazadas.total,
    duplicadosExactos: manifiesto.duplicadosExactos,
    duplicadosProbablesInyectados: manifiesto.duplicadosProbables,
    insertadas: manifiesto.insertadasEsperadas,
  },
  criterios: {
    filasPorSegundoMinimas: 10_000,
    memoriaMaximaMb: 300,
  },
  equipo: {
    node: process.version,
    postgres: version,
    sistema: `${os.type()} ${os.release()}`,
    procesador: os.cpus()[0]?.model ?? 'desconocido',
    nucleos: os.cpus().length,
    memoriaGb: Math.round(os.totalmem() / 1024 ** 3),
  },
};
resultado.cumple = {
  conteos:
    resultado.ejecucion.filasLeidas === resultado.esperado.filas &&
    resultado.ejecucion.filasValidas === resultado.esperado.validas &&
    resultado.ejecucion.filasRechazadas === resultado.esperado.rechazadas &&
    resultado.ejecucion.duplicadosExactos === resultado.esperado.duplicadosExactos &&
    Number(registros.total) === resultado.esperado.insertadas,
  ritmo: resultado.ejecucion.filasPorSegundo >= resultado.criterios.filasPorSegundoMinimas,
  memoria: resultado.ejecucion.memoriaMaximaMb < resultado.criterios.memoriaMaximaMb,
};

const carpeta = path.join(raiz, 'analytics', 'benchmarks', 'resultados');
await mkdir(carpeta, { recursive: true });
const destino = path.join(carpeta, `etl-${opciones.tipo}-${cantidad}.json`);
await writeFile(destino, `${JSON.stringify(resultado, null, 2)}\n`, 'utf8');
process.stdout.write(`${salida.trim().split('\n').at(-1)}\n`);
process.stdout.write(
  `Ritmo: ${resultado.ejecucion.filasPorSegundo} filas/s. Memoria máxima: ${resultado.ejecucion.memoriaMaximaMb} MB. ` +
    `Conteos: ${resultado.cumple.conteos ? 'coinciden' : 'NO coinciden'} con el manifiesto.\n`,
);
process.stdout.write(`Resultado: ${path.relative(raiz, destino)}\n`);
