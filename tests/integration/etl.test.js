import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cargarMunicipiosAfectados } from '../../data/generador/registros/contexto.js';
import { generarArchivo } from '../../data/generador/registros/generar.js';
import { recalcularAgregados } from '../../etl/cargadores/agregados.js';
import { leerDefinicion } from '../../etl/nucleo/definiciones.js';
import { ejecutarCarga } from '../../etl/proceso.js';
import { conectarComoPropietario, configuracionDePrueba, prepararBaseAislada } from './apoyo.js';

const FIXTURES = path.resolve(import.meta.dirname, '..', 'fixtures', 'etl');
const TABLAS = Object.freeze({ personas: 'nucleo.personas_afectadas', viviendas: 'nucleo.viviendas' });

let configuracion;
let cliente;
let carpeta;
let municipios;
const definiciones = {};

beforeAll(async () => {
  const baseDeDatos = await prepararBaseAislada('etl');
  configuracion = configuracionDePrueba(baseDeDatos);
  cliente = await conectarComoPropietario(baseDeDatos);
  carpeta = await mkdtemp(path.join(os.tmpdir(), 'andes-etl-'));
  municipios = await cargarMunicipiosAfectados();
  definiciones.personas = await leerDefinicion('personas-simuladas');
  definiciones.viviendas = await leerDefinicion('viviendas-simuladas');
});

afterAll(async () => {
  await cliente?.end();
  if (carpeta) {
    await rm(carpeta, { recursive: true, force: true });
  }
});

const filas = async (sql, parametros = []) => (await cliente.query(sql, parametros)).rows;
const una = async (sql, parametros) => (await filas(sql, parametros))[0];

function cargar(definicion, ruta, opciones = {}) {
  return ejecutarCarga({
    cliente,
    definicion,
    ruta,
    formato: path.extname(ruta).slice(1),
    configuracion,
    ...opciones,
  });
}

async function generar(tipo, { cantidad, semilla, formato = 'csv' }) {
  const ruta = path.join(carpeta, `${tipo}-${cantidad}-s${semilla}.${formato}`);
  const manifiesto = await generarArchivo({ tipo, cantidad, formato, ruta, municipios, semilla });
  return { ruta, manifiesto };
}

async function conteosDe(ejecucion, tipo) {
  const { insertadas } = await una(
    `SELECT count(*) AS insertadas FROM ${TABLAS[tipo]} WHERE ejecucion_id = $1`,
    [ejecucion.id],
  );
  return {
    leidas: ejecucion.filas_leidas,
    validas: ejecucion.filas_validas,
    rechazadas: ejecucion.filas_rechazadas,
    duplicados: ejecucion.duplicados,
    insertadas,
  };
}

const esperadosDe = (manifiesto) => ({
  leidas: manifiesto.filas,
  validas: manifiesto.validasEsperadas,
  rechazadas: manifiesto.rechazadas.total,
  duplicados: manifiesto.duplicadosExactos,
  insertadas: manifiesto.insertadasEsperadas,
});

const motivos = (rechazadas) =>
  rechazadas.map(({ numero_fila: fila, errores }) => [
    fila,
    errores.map(({ campo, codigo }) => `${campo ?? 'fila'}:${codigo}`),
  ]);

describe('archivo CSV con errores conocidos', () => {
  const ruta = path.join(FIXTURES, 'personas-con-errores.csv');
  let ejecucion;

  beforeAll(async () => {
    ({ ejecucion } = await cargar(definiciones.personas, ruta));
  });

  it('cuenta cada fila según su resultado', () => {
    expect(ejecucion).toMatchObject({
      estado: 'TERMINADA',
      filas_leidas: 15,
      filas_validas: 7,
      filas_rechazadas: 8,
      duplicados: 1,
      en_revision: 2,
      alertas: 1,
      filas_confirmadas: 15,
      agregados_aplicados: true,
    });
  });

  it('guarda cada fila rechazada con su número y el motivo exacto', async () => {
    const rechazadas = await filas(
      'SELECT numero_fila, errores FROM staging.filas_rechazadas WHERE ejecucion_id = $1 ORDER BY numero_fila',
      [ejecucion.id],
    );
    expect(motivos(rechazadas)).toEqual([
      [2, ['edad:TIPO']],
      [3, ['documento:FORMATO']],
      [4, ['municipio:MUNICIPIO_INEXISTENTE']],
      [5, ['fecha_registro:FECHA_INVALIDA']],
      [6, ['fecha_registro:RANGO']],
      [7, ['fila:COLUMNAS']],
      [8, ['documento:OBLIGATORIO']],
      [9, ['condicion_institucional:VALOR_NO_PERMITIDO']],
    ]);
  });

  it('no guarda el documento original ni en el contenido ni en los mensajes', async () => {
    const rechazadas = await filas(
      'SELECT numero_fila, errores, fila_cruda FROM staging.filas_rechazadas WHERE ejecucion_id = $1',
      [ejecucion.id],
    );
    const guardado = JSON.stringify(rechazadas);
    for (const documento of ['7000000002', '70000-ABC', '7000000004', '7000000007', '7000000009']) {
      expect(guardado).not.toContain(documento);
    }
    const porFila = new Map(rechazadas.map((fila) => [fila.numero_fila, fila]));
    expect(porFila.get(3).fila_cruda.documento).toBe('•••ABC');
    expect(porFila.get(3).errores[0].mensaje).toBe('El valor •••ABC no tiene el formato esperado.');
    expect(porFila.get(2).fila_cruda).toMatchObject({
      documento: '•••002',
      nombre_completo: 'Luis Pardo Ríos',
      edad: 'treinta',
    });
    expect(porFila.get(7).fila_cruda.valores).toEqual([
      '•••007',
      'Pedro Pablo León',
      'M',
      '20',
      '•••001',
      'CIVIL',
      '',
      'AFECTADA',
      'ILESA',
      '',
      '2026-08-20',
      'SOBRANTE',
    ]);
  });

  it('guarda el documento solo como seudónimo HMAC', async () => {
    const guardadas = await filas(
      'SELECT identificador_hmac FROM nucleo.personas_afectadas WHERE ejecucion_id = $1',
      [ejecucion.id],
    );
    expect(guardadas).toHaveLength(6);
    for (const { identificador_hmac: seudonimo } of guardadas) {
      expect(seudonimo).toMatch(/^[0-9a-f]{64}$/);
    }
    const columnas = await filas(
      "SELECT column_name FROM information_schema.columns WHERE table_schema = 'nucleo' AND table_name = 'personas_afectadas'",
    );
    expect(columnas.map(({ column_name: columna }) => columna)).not.toContain('documento');
  });

  it('normaliza los valores corregibles antes de guardarlos', async () => {
    const persona = await una(
      `SELECT p.sexo, p.municipio_codigo, ci.codigo AS condicion, p.edad_al_evento, p.tenencia_id
       FROM nucleo.personas_afectadas p
       JOIN nucleo.condiciones_institucionales ci ON ci.id = p.condicion_institucional_id
       WHERE p.ejecucion_id = $1 AND p.numero_fila = 10`,
      [ejecucion.id],
    );
    expect(persona).toMatchObject({
      sexo: 'M',
      municipio_codigo: '05001',
      condicion: 'CIVIL',
      edad_al_evento: 28,
    });
    const ausente = await una(
      'SELECT tenencia_id FROM nucleo.personas_afectadas WHERE ejecucion_id = $1 AND numero_fila = 14',
      [ejecucion.id],
    );
    expect(ausente.tenencia_id).toBeNull();
  });

  it('marca la alerta de una regla sin rechazar la fila', async () => {
    const { alertas } = await una(
      'SELECT alertas FROM nucleo.personas_afectadas WHERE ejecucion_id = $1 AND numero_fila = 11',
      [ejecucion.id],
    );
    expect(alertas).toEqual(['EMBARAZO_SEXO_MASCULINO']);
  });

  it('descarta el duplicado exacto y deja en revisión los probables', async () => {
    const estados = await filas(
      'SELECT numero_fila, estado FROM nucleo.personas_afectadas WHERE ejecucion_id = $1 ORDER BY numero_fila',
      [ejecucion.id],
    );
    expect(estados.map(({ numero_fila: fila, estado }) => [fila, estado])).toEqual([
      [1, 'VIGENTE'],
      [10, 'VIGENTE'],
      [11, 'VIGENTE'],
      [13, 'EN_REVISION'],
      [14, 'VIGENTE'],
      [15, 'EN_REVISION'],
    ]);
    const pares = await filas(
      `SELECT n.numero_fila AS nuevo, c.numero_fila AS candidato, r.motivo, r.estado
       FROM staging.revision_duplicados r
       JOIN nucleo.personas_afectadas n ON n.id = r.persona_id
       JOIN nucleo.personas_afectadas c ON c.id = r.persona_candidata_id
       WHERE r.ejecucion_id = $1
       ORDER BY 1, 2`,
      [ejecucion.id],
    );
    expect(pares).toEqual([
      { nuevo: 13, candidato: 1, motivo: 'SIMILITUD', estado: 'PENDIENTE' },
      { nuevo: 15, candidato: 1, motivo: 'CLAVE_NATURAL', estado: 'PENDIENTE' },
      { nuevo: 15, candidato: 13, motivo: 'SIMILITUD', estado: 'PENDIENTE' },
    ]);
  });

  it('no suma en las estadísticas los registros en revisión', async () => {
    const { cantidad } = await una(
      "SELECT cantidad FROM analitica.agregados WHERE destino = 'personas' AND nivel = 'NACIONAL' AND dimension = 'total'",
    );
    expect(cantidad).toBe(4);
  });

  it('rechaza volver a cargar el mismo archivo', async () => {
    await expect(cargar(definiciones.personas, ruta)).rejects.toMatchObject({ codigo: 'YA_CARGADO' });
  });
});

describe('archivo JSON Lines con líneas mal formadas', () => {
  it('rechaza las líneas que no son objetos JSON sin detener la carga', async () => {
    const { ejecucion } = await cargar(
      definiciones.personas,
      path.join(FIXTURES, 'personas-con-errores.jsonl'),
    );
    expect(ejecucion).toMatchObject({
      estado: 'TERMINADA',
      filas_leidas: 4,
      filas_validas: 2,
      filas_rechazadas: 2,
    });
    const rechazadas = await filas(
      'SELECT numero_fila, errores, fila_cruda FROM staging.filas_rechazadas WHERE ejecucion_id = $1 ORDER BY numero_fila',
      [ejecucion.id],
    );
    expect(motivos(rechazadas)).toEqual([
      [2, ['fila:JSON_INVALIDO']],
      [3, ['fila:JSON_NO_OBJETO']],
    ]);
    expect(rechazadas[0].fila_cruda.texto).toBe(
      '{"documento": "•••002", "nombre_completo": "Óscar Mejía", "edad": 3',
    );
    const guardadas = await filas(
      `SELECT p.numero_fila, p.municipio_codigo, coalesce(array_agg(t.codigo) FILTER (WHERE t.codigo IS NOT NULL), '{}') AS vulnerabilidades
       FROM nucleo.personas_afectadas p
       LEFT JOIN nucleo.personas_vulnerabilidades pv ON pv.persona_id = p.id
       LEFT JOIN nucleo.tipos_vulnerabilidad t ON t.id = pv.tipo_vulnerabilidad_id
       WHERE p.ejecucion_id = $1
       GROUP BY p.numero_fila, p.municipio_codigo
       ORDER BY p.numero_fila`,
      [ejecucion.id],
    );
    expect(guardadas).toEqual([
      { numero_fila: 1, municipio_codigo: '17001', vulnerabilidades: ['DISCAPACIDAD'] },
      { numero_fila: 4, municipio_codigo: '17001', vulnerabilidades: [] },
    ]);
  });
});

describe('archivos del generador', () => {
  it.each([
    ['personas', 'csv', 3000, 101],
    ['personas', 'json', 1000, 102],
    ['personas', 'jsonl', 1000, 103],
    ['viviendas', 'csv', 1500, 104],
    ['viviendas', 'json', 600, 106],
  ])('carga %s en %s y reproduce el manifiesto', async (tipo, formato, cantidad, semilla) => {
    const { ruta, manifiesto } = await generar(tipo, { cantidad, semilla, formato });
    const { ejecucion } = await cargar(definiciones[tipo], ruta);
    expect(ejecucion.estado).toBe('TERMINADA');
    expect(await conteosDe(ejecucion, tipo)).toEqual(esperadosDe(manifiesto));
    const { revision } = await una(
      `SELECT count(*) AS revision FROM ${TABLAS[tipo]} WHERE ejecucion_id = $1 AND estado = 'EN_REVISION'`,
      [ejecucion.id],
    );
    expect(revision).toBe(ejecucion.en_revision);
    const { huerfanos } = await una(
      `SELECT count(*) AS huerfanos FROM ${TABLAS[tipo]} registro
       WHERE registro.ejecucion_id = $1 AND registro.estado = 'EN_REVISION'
         AND NOT EXISTS (
           SELECT 1 FROM staging.revision_duplicados r
           WHERE r.estado = 'PENDIENTE' AND coalesce(r.persona_id, r.vivienda_id) = registro.id
         )`,
      [ejecucion.id],
    );
    expect(huerfanos).toBe(0);
  });
});

describe('reanudación', () => {
  it('retoma una carga interrumpida desde la última fila confirmada', async () => {
    const { ruta, manifiesto } = await generar('personas', { cantidad: 1200, semilla: 105 });
    const definicion = { ...definiciones.personas, tamano_lote: 500 };
    const interrupcion = new Error('Interrupción simulada después del primer lote.');
    await expect(
      cargar(definicion, ruta, {
        alAvanzar: () => {
          throw interrupcion;
        },
      }),
    ).rejects.toBe(interrupcion);
    const interrumpida = await una(
      'SELECT id, estado, filas_confirmadas, filas_leidas, agregados_aplicados FROM nucleo.ejecuciones_etl WHERE huella_archivo = $1',
      [manifiesto.huella],
    );
    expect(interrumpida).toMatchObject({
      estado: 'FALLIDA',
      filas_confirmadas: 500,
      filas_leidas: 500,
      agregados_aplicados: false,
    });

    const reanudada = await cargar(definicion, ruta);
    expect(reanudada.reanudada).toBe(true);
    expect(reanudada.ejecucion.id).toBe(interrumpida.id);
    expect(reanudada.resumen.leidas).toBe(700);
    expect(await conteosDe(reanudada.ejecucion, 'personas')).toEqual(esperadosDe(manifiesto));
  });
});

describe('errores que detienen la carga', () => {
  it('marca como fallida la carga de un CSV con encabezados repetidos', async () => {
    const ruta = path.join(carpeta, 'encabezado-repetido.csv');
    await writeFile(ruta, 'documento,documento\n1,2\n', 'utf8');
    await expect(cargar(definiciones.personas, ruta)).rejects.toThrow(/encabezado/);
    const { estado, mensaje } = await una(
      'SELECT estado, mensaje FROM nucleo.ejecuciones_etl WHERE nombre_archivo = $1',
      ['encabezado-repetido.csv'],
    );
    expect(estado).toBe('FALLIDA');
    expect(mensaje).toMatch(/columnas vacías o repetidas/);
  });

  it('rechaza un formato que el conjunto no admite', async () => {
    await expect(
      ejecutarCarga({
        cliente,
        definicion: definiciones.personas,
        ruta: path.join(FIXTURES, 'personas-con-errores.csv'),
        formato: 'xml',
        configuracion,
      }),
    ).rejects.toMatchObject({ codigo: 'FORMATO_NO_ADMITIDO' });
  });

  it('no carga documentos sin el secreto de seudonimización', async () => {
    const { ruta } = await generar('personas', { cantidad: 10, semilla: 107 });
    await expect(
      cargar(definiciones.personas, ruta, {
        configuracion: { ...configuracion, seudonimos: { secreto: null } },
      }),
    ).rejects.toThrow(/SEUDONIMO_SECRETO/);
  });
});

describe('agregados del algoritmo 2', () => {
  it('coinciden con la consulta SQL de grupos de edad en los tres niveles', async () => {
    const enJavaScript = await filas(
      `SELECT nivel, territorio, categoria AS grupo_edad, cantidad, suma
       FROM analitica.agregados
       WHERE destino = 'personas' AND origen = 'SIMULADO' AND dimension = 'grupo_edad'
       ORDER BY 1, 2, 3`,
    );
    const enSql = await filas(
      `SELECT nivel, territorio::text AS territorio, grupo_edad, cantidad, suma_edad AS suma
       FROM analitica.poblacion_por_grupo_de_edad
       WHERE origen = 'SIMULADO'
       ORDER BY 1, 2, 3`,
    );
    expect(enJavaScript.length).toBeGreaterThan(0);
    expect(enJavaScript).toEqual(enSql);
  });

  it('el cubo de viviendas coincide con el CUBE de SQL', async () => {
    const cubo = await filas(
      `SELECT split_part(categoria, '|', 1) AS estado_fisico, split_part(categoria, '|', 2) AS aseguramiento,
              split_part(categoria, '|', 3) AS financiacion, sum(cantidad)::bigint AS cantidad
       FROM analitica.agregados
       WHERE destino = 'viviendas' AND nivel = 'NACIONAL' AND dimension = 'cubo'
       GROUP BY 1, 2, 3
       ORDER BY 1, 2, 3`,
    );
    const vista = await filas(
      `SELECT estado_fisico, aseguramiento, financiacion, cantidad
       FROM analitica.viviendas_por_aseguramiento
       WHERE estado_fisico <> 'TODOS' AND aseguramiento <> 'TODOS' AND financiacion <> 'TODOS'
       ORDER BY 1, 2, 3`,
    );
    expect(cubo.length).toBeGreaterThan(0);
    expect(cubo).toEqual(vista);
  });

  it('el total nacional es igual al número de registros vigentes', async () => {
    for (const [destino, tabla] of Object.entries(TABLAS)) {
      const { vigentes } = await una(`SELECT count(*) AS vigentes FROM ${tabla} WHERE estado = 'VIGENTE'`);
      const { cantidad } = await una(
        "SELECT cantidad FROM analitica.agregados WHERE destino = $1 AND nivel = 'NACIONAL' AND dimension = 'total'",
        [destino],
      );
      expect(cantidad, destino).toBe(vigentes);
    }
  });

  it('el recálculo completo produce las mismas celdas que la suma incremental', async () => {
    const leer = () =>
      filas(
        `SELECT destino, origen, nivel, territorio, dimension, categoria, cantidad, suma
         FROM analitica.agregados ORDER BY 1, 2, 3, 4, 5, 6`,
      );
    const incremental = await leer();
    const resumen = [];
    for (const destino of Object.keys(TABLAS)) {
      resumen.push(...(await recalcularAgregados(cliente, { destino })));
    }
    expect(resumen.map(({ origen }) => origen)).toEqual(['SIMULADO', 'SIMULADO']);
    expect(await leer()).toEqual(incremental);
  });
});
