import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cargarMunicipiosAfectados } from '../../../data/generador/registros/contexto.js';
import { SIN_DEFECTOS } from '../../../data/generador/registros/defectos.js';
import {
  CANTIDAD_MAXIMA,
  generarArchivo,
  primerIndiceDe,
} from '../../../data/generador/registros/generar.js';

let carpeta;
let municipios;
let contador = 0;

beforeAll(async () => {
  carpeta = await mkdtemp(path.join(os.tmpdir(), 'andes-generador-'));
  municipios = await cargarMunicipiosAfectados();
});

afterAll(() => rm(carpeta, { recursive: true, force: true }));

async function generar(opciones) {
  contador += 1;
  const ruta = path.join(carpeta, `${opciones.tipo}-${contador}.${opciones.formato ?? 'csv'}`);
  const manifiesto = await generarArchivo({ formato: 'csv', municipios, ...opciones, ruta });
  return { ruta, manifiesto };
}

async function lineasJson(ruta) {
  return (await readFile(ruta, 'utf8'))
    .split('\n')
    .filter(Boolean)
    .map((linea) => JSON.parse(linea));
}

describe('generador de registros simulados', () => {
  it('produce el mismo archivo con la misma semilla', async () => {
    const primero = await generar({ tipo: 'personas', cantidad: 500, semilla: 11 });
    const segundo = await generar({ tipo: 'personas', cantidad: 500, semilla: 11 });
    expect(segundo.manifiesto.huella).toBe(primero.manifiesto.huella);
    expect(segundo.manifiesto).toEqual(primero.manifiesto);
  });

  it('produce archivos distintos con semillas distintas', async () => {
    const primero = await generar({ tipo: 'viviendas', cantidad: 200, semilla: 12 });
    const segundo = await generar({ tipo: 'viviendas', cantidad: 200, semilla: 13 });
    expect(segundo.manifiesto.huella).not.toBe(primero.manifiesto.huella);
  });

  it('no repite documentos entre semillas distintas', async () => {
    const documentos = async (semilla) => {
      const { ruta } = await generar({
        tipo: 'personas',
        cantidad: 2000,
        semilla,
        formato: 'jsonl',
        tasas: SIN_DEFECTOS,
      });
      return new Set((await lineasJson(ruta)).map(({ documento }) => documento));
    };
    const [primera, segunda] = await Promise.all([documentos(21), documentos(22)]);
    expect(primera.size).toBe(2000);
    expect([...segunda].filter((documento) => primera.has(documento))).toEqual([]);
    expect(primerIndiceDe(21)).not.toBe(primerIndiceDe(22));
  });

  it('el manifiesto cuadra: filas, rechazos, duplicados exactos e insertadas', async () => {
    const { manifiesto } = await generar({ tipo: 'personas', cantidad: 5000, semilla: 31 });
    const porMotivo = Object.values(manifiesto.rechazadas.porMotivo).reduce(
      (total, cantidad) => total + cantidad,
      0,
    );
    expect(manifiesto).toMatchObject({ conjunto: 'personas-simuladas', origen: 'SIMULADO', filas: 5000 });
    expect(porMotivo).toBe(manifiesto.rechazadas.total);
    expect(manifiesto.validasEsperadas).toBe(5000 - manifiesto.rechazadas.total);
    expect(manifiesto.insertadasEsperadas).toBe(manifiesto.validasEsperadas - manifiesto.duplicadosExactos);
    expect(manifiesto.rechazadas.total).toBeGreaterThan(0);
    expect(manifiesto.duplicadosExactos).toBeGreaterThan(0);
    expect(manifiesto.duplicadosProbables).toBeGreaterThan(0);
  });

  it('sin defectos, todas las filas son válidas y los documentos son únicos', async () => {
    const { ruta, manifiesto } = await generar({
      tipo: 'personas',
      cantidad: 1000,
      semilla: 41,
      formato: 'jsonl',
      tasas: SIN_DEFECTOS,
    });
    expect(manifiesto).toMatchObject({
      duplicadosExactos: 0,
      duplicadosProbables: 0,
      insertadasEsperadas: 1000,
    });
    expect(manifiesto.rechazadas.total).toBe(0);
    const filas = await lineasJson(ruta);
    expect(new Set(filas.map(({ documento }) => documento)).size).toBe(1000);
    for (const fila of filas) {
      expect(fila.edad).toBeGreaterThanOrEqual(0);
      expect(fila.edad).toBeLessThanOrEqual(120);
      expect(fila.fecha_registro >= '2026-08-10').toBe(true);
    }
  });

  it('escribe un arreglo JSON válido con las mismas filas que JSON Lines', async () => {
    const opciones = { tipo: 'viviendas', cantidad: 300, semilla: 51 };
    const arreglo = await generar({ ...opciones, formato: 'json' });
    const lineas = await generar({ ...opciones, formato: 'jsonl' });
    expect(JSON.parse(await readFile(arreglo.ruta, 'utf8'))).toEqual(await lineasJson(lineas.ruta));
  });

  it('valida el tipo y la cantidad', async () => {
    await expect(generar({ tipo: 'empresas', cantidad: 10 })).rejects.toThrow(RangeError);
    await expect(generar({ tipo: 'personas', cantidad: 0 })).rejects.toThrow(RangeError);
    await expect(generar({ tipo: 'personas', cantidad: CANTIDAD_MAXIMA + 1 })).rejects.toThrow(RangeError);
  });
});
