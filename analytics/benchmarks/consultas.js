import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { configuracionDeConexion } from '../../backend/src/config/baseDeDatos.js';
import { leerEntorno } from '../../backend/src/config/entorno.js';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const BASE_DE_MEDICION = 'andes_medicion_api';
const REPETICIONES = 5;
const SIN_INDICES = Object.freeze([
  'SET LOCAL enable_indexscan = off',
  'SET LOCAL enable_bitmapscan = off',
  'SET LOCAL enable_indexonlyscan = off',
]);

const escribir = (texto = '') => process.stdout.write(`${texto}\n`);
const mediana = (valores) => [...valores].sort((uno, otro) => uno - otro)[Math.floor(valores.length / 2)];

function nodosDe(plan, encontrados = []) {
  encontrados.push(plan['Node Type']);
  for (const hijo of plan.Plans ?? []) {
    nodosDe(hijo, encontrados);
  }
  return encontrados;
}

async function ejecutarVariante(cliente, consulta, parametros, ajustes) {
  const tiempos = [];
  let plan = null;
  for (let vuelta = 0; vuelta <= REPETICIONES; vuelta += 1) {
    await cliente.query('BEGIN');
    try {
      for (const ajuste of ajustes) {
        await cliente.query(ajuste);
      }
      const { rows } = await cliente.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${consulta}`, parametros);
      [plan] = rows[0]['QUERY PLAN'];
      if (vuelta > 0) {
        tiempos.push(plan['Execution Time']);
      }
    } finally {
      await cliente.query('ROLLBACK');
    }
  }
  const nodos = nodosDe(plan.Plan);
  return {
    ms: Math.round(mediana(tiempos) * 1000) / 1000,
    nodo: nodos.find((nodo) => /Scan|Aggregate|Limit/.test(nodo)) ?? nodos[0],
    nodos: [...new Set(nodos)],
    bloques: (plan.Plan['Shared Hit Blocks'] ?? 0) + (plan.Plan['Shared Read Blocks'] ?? 0),
  };
}

const configuracion = leerEntorno({ ...process.env, BD_NOMBRE: BASE_DE_MEDICION });
const cliente = new pg.Client(configuracionDeConexion(configuracion, 'propietario'));
await cliente.connect();
try {
  const {
    rows: [muestra],
  } = await cliente.query(
    `SELECT evento_id, clave_bloque, identificador_hmac, municipio_codigo, id,
            (SELECT count(*) FROM nucleo.personas_afectadas)::int AS personas
     FROM nucleo.personas_afectadas WHERE estado = 'VIGENTE' AND identificador_hmac IS NOT NULL
     ORDER BY id OFFSET 700000 LIMIT 1`,
  );
  if (!muestra) {
    throw new Error(`La base ${BASE_DE_MEDICION} no tiene registros. Ejecuta primero npm run medir:api.`);
  }
  const comparaciones = [
    {
      nombre: 'Candidatos de un bloque de duplicados',
      donde: 'ETL, algoritmo 3',
      consulta: 'SELECT id FROM nucleo.personas_afectadas WHERE evento_id = $1 AND clave_bloque = $2',
      parametros: [muestra.evento_id, muestra.clave_bloque],
      variantes: [
        ['Índice personas_bloque', []],
        ['Recorrido secuencial', SIN_INDICES],
      ],
    },
    {
      nombre: 'Duplicado exacto por seudónimo',
      donde: 'ETL, algoritmo 3',
      consulta: 'SELECT id FROM nucleo.personas_afectadas WHERE evento_id = $1 AND identificador_hmac = $2',
      parametros: [muestra.evento_id, muestra.identificador_hmac],
      variantes: [
        ['Índice único personas_identificador_unico', []],
        ['Recorrido secuencial', SIN_INDICES],
      ],
    },
    {
      nombre: 'Personas vigentes de un municipio',
      donde: 'Estadísticas por territorio',
      consulta: `SELECT count(*) FROM nucleo.personas_afectadas
                 WHERE evento_id = $1 AND municipio_codigo = $2 AND estado = 'VIGENTE'`,
      parametros: [muestra.evento_id, muestra.municipio_codigo],
      variantes: [
        ['Índice parcial personas_vigentes', []],
        ['Recorrido secuencial', SIN_INDICES],
      ],
    },
    {
      nombre: 'Personas vigentes por municipio',
      donde: 'Recálculo de agregados, algoritmo 2',
      consulta: `SELECT municipio_codigo, count(*) FROM nucleo.personas_afectadas
                 WHERE estado = 'VIGENTE' GROUP BY municipio_codigo`,
      parametros: [],
      variantes: [
        ['Agregación por hash', []],
        ['Agregación por ordenamiento', ['SET LOCAL enable_hashagg = off']],
      ],
    },
    {
      nombre: 'Página de 50 registros cerca del final',
      donde: 'Paginación de listas privadas',
      consulta: 'SELECT id FROM nucleo.personas_afectadas WHERE id > $1 ORDER BY id LIMIT 50',
      parametros: [muestra.id],
      variantes: [['Paginación por clave', []]],
      alternativa: {
        etiqueta: 'Paginación por desplazamiento',
        consulta: 'SELECT id FROM nucleo.personas_afectadas ORDER BY id OFFSET 700000 LIMIT 50',
      },
    },
    {
      nombre: 'Agregados publicables de población',
      donde: 'API pública, registros de población',
      consulta: `SELECT nivel, territorio, dimension, categoria, cantidad FROM analitica.agregados_publicables
                 WHERE evento = 'sismo-2026-08-10' AND destino = 'personas' AND origen = 'SIMULADO'`,
      parametros: [],
      variantes: [
        ['Índice agregados_dimension', []],
        ['Recorrido secuencial', SIN_INDICES],
      ],
    },
  ];

  const resultados = [];
  for (const comparacion of comparaciones) {
    const variantes = [];
    for (const [etiqueta, ajustes] of comparacion.variantes) {
      variantes.push({
        etiqueta,
        ...(await ejecutarVariante(cliente, comparacion.consulta, comparacion.parametros, ajustes)),
      });
    }
    if (comparacion.alternativa) {
      variantes.push({
        etiqueta: comparacion.alternativa.etiqueta,
        ...(await ejecutarVariante(cliente, comparacion.alternativa.consulta, [], [])),
      });
    }
    const [elegida, alternativa] = variantes;
    resultados.push({
      nombre: comparacion.nombre,
      donde: comparacion.donde,
      variantes,
      aceleracion: Math.round((alternativa.ms / elegida.ms) * 10) / 10,
    });
    escribir(
      `${comparacion.nombre.padEnd(42)} ${variantes.map(({ etiqueta, ms, nodo }) => `${etiqueta}: ${ms} ms (${nodo})`).join(' · ')}`,
    );
  }

  const {
    rows: [{ version }],
  } = await cliente.query("SELECT current_setting('server_version') AS version");
  const salida = {
    medidoEn: new Date().toISOString(),
    baseDeDatos: BASE_DE_MEDICION,
    personas: muestra.personas,
    metodo: {
      repeticiones: REPETICIONES,
      estadistico: 'mediana del Execution Time de EXPLAIN ANALYZE',
      calentamiento: 1,
    },
    postgres: version,
    resultados,
  };
  const carpeta = path.join(raiz, 'analytics', 'benchmarks', 'resultados');
  await mkdir(carpeta, { recursive: true });
  await writeFile(path.join(carpeta, 'consultas.json'), `${JSON.stringify(salida, null, 2)}\n`, 'utf8');
  escribir('Resultado: analytics/benchmarks/resultados/consultas.json');
} finally {
  await cliente.end();
}
