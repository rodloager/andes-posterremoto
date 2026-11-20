import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { leerDefinicion } from '../../etl/nucleo/definiciones.js';
import { ejecutarCarga } from '../../etl/proceso.js';
import { EVENTO, conectarComoPropietario, configuracionDePrueba, prepararBaseAislada } from './apoyo.js';

const ARCHIVO = path.resolve(
  import.meta.dirname,
  '..',
  '..',
  'data',
  'raw',
  'dane-afectaciones',
  '2026-11-11.json',
);

let cliente;
let configuracion;
let definicion;
let totalesDeLaSemilla;

const filas = async (sql, parametros = []) => (await cliente.query(sql, parametros)).rows;

async function totalesNacionales() {
  const resultado = await filas(
    `SELECT variable_codigo, valor FROM analitica.afectacion_agregada
     WHERE evento = $1 AND nivel = 'NACIONAL' ORDER BY variable_codigo`,
    [EVENTO],
  );
  return Object.fromEntries(
    resultado.map(({ variable_codigo: variable, valor }) => [variable, Number(valor)]),
  );
}

const cargar = () => ejecutarCarga({ cliente, definicion, ruta: ARCHIVO, formato: 'json', configuracion });

beforeAll(async () => {
  const baseDeDatos = await prepararBaseAislada('reportes');
  configuracion = configuracionDePrueba(baseDeDatos);
  cliente = await conectarComoPropietario(baseDeDatos);
  definicion = await leerDefinicion('dane-afectaciones');
  totalesDeLaSemilla = await totalesNacionales();
});

afterAll(async () => {
  await cliente?.end();
});

describe('carga del reporte municipal oficial con el ETL', () => {
  it('lee el archivo guardado del DANE, omite los 624 municipios sin reporte y lo vuelve vigente', async () => {
    await cargar();
    const [ejecucion] = await filas(
      `SELECT id, estado, filas_leidas, filas_validas, filas_rechazadas FROM nucleo.ejecuciones_etl
       WHERE conjunto_id = 'dane-afectaciones' ORDER BY id DESC LIMIT 1`,
    );
    expect(ejecucion).toMatchObject({
      estado: 'TERMINADA',
      filas_leidas: 1122,
      filas_validas: 498,
      filas_rechazadas: 0,
    });
    const [vigente] = await filas(
      "SELECT ejecucion_id FROM analitica.ejecuciones_vigentes WHERE conjunto_id = 'dane-afectaciones'",
    );
    expect(vigente.ejecucion_id).toBe(ejecucion.id);
    const [{ municipios }] = await filas(
      'SELECT count(DISTINCT municipio_codigo)::int AS municipios FROM analitica.reportes_municipales WHERE evento = $1',
      [EVENTO],
    );
    expect(municipios).toBe(498);
  });

  it('reproduce los totales nacionales de la semilla oficial', async () => {
    expect(await totalesNacionales()).toEqual(totalesDeLaSemilla);
    expect(totalesDeLaSemilla.personas).toBe(128818);
  });

  it('no vuelve a cargar el mismo archivo', async () => {
    await expect(cargar()).rejects.toMatchObject({ codigo: 'YA_CARGADO' });
  });
});
