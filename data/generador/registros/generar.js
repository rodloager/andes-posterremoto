import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { crearGenerador } from '../aleatorio.js';
import { crearContexto } from './contexto.js';
import { DEFECTOS_DE_PERSONAS, DEFECTOS_DE_VIVIENDAS, TASAS_POR_DEFECTO, crearInyector } from './defectos.js';
import { crearEscritor } from './formatos.js';
import { COLUMNAS_PERSONAS, crearGeneradorDePersonas } from './personas.js';
import { COLUMNAS_VIVIENDAS, crearGeneradorDeViviendas } from './viviendas.js';

export const SEMILLA_DE_REGISTROS = 20260810;
export const CANTIDAD_MAXIMA = 5_000_000;
const INDICES_POR_SEMILLA = 10_000_000;
const SEMILLAS_DISTINTAS = 900;

export const primerIndiceDe = (semilla) => (Math.abs(semilla) % SEMILLAS_DISTINTAS) * INDICES_POR_SEMILLA;

export const CONJUNTOS_GENERABLES = Object.freeze({
  personas: Object.freeze({
    conjunto: 'personas-simuladas',
    columnas: COLUMNAS_PERSONAS,
    crearBase: crearGeneradorDePersonas,
    defectos: DEFECTOS_DE_PERSONAS,
  }),
  viviendas: Object.freeze({
    conjunto: 'viviendas-simuladas',
    columnas: COLUMNAS_VIVIENDAS,
    crearBase: crearGeneradorDeViviendas,
    defectos: DEFECTOS_DE_VIVIENDAS,
  }),
});

export async function calcularHuella(ruta) {
  const huella = createHash('sha256');
  await pipeline(createReadStream(ruta), huella);
  return huella.digest('hex');
}

export async function generarArchivo({
  tipo,
  cantidad,
  formato,
  ruta,
  municipios,
  semilla = SEMILLA_DE_REGISTROS,
  tasas = TASAS_POR_DEFECTO,
}) {
  const definicion = CONJUNTOS_GENERABLES[tipo];
  if (!definicion) {
    throw new RangeError(`Tipo de registro desconocido: ${tipo}`);
  }
  if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > CANTIDAD_MAXIMA) {
    throw new RangeError(`La cantidad de filas debe ser un entero entre 1 y ${CANTIDAD_MAXIMA}.`);
  }
  const generador = crearGenerador(semilla);
  const contexto = crearContexto(municipios);
  const inyector = crearInyector({
    generador,
    generarBase: definicion.crearBase(generador, contexto),
    defectos: definicion.defectos,
    cantidad,
    tasas,
    primerIndice: primerIndiceDe(semilla),
  });
  await mkdir(path.dirname(ruta), { recursive: true });
  const escritor = await crearEscritor(ruta, { formato, columnas: definicion.columnas });
  for (let indice = 0; indice < cantidad; indice += 1) {
    await escritor.agregar(inyector.siguiente(indice));
  }
  await escritor.cerrar();
  const defectos = inyector.manifiesto();
  const rechazadas = Object.values(defectos.rechazadas).reduce((suma, total) => suma + total, 0);
  const manifiesto = {
    conjunto: definicion.conjunto,
    origen: 'SIMULADO',
    formato,
    semilla,
    tasas,
    filas: cantidad,
    rechazadas: { total: rechazadas, porMotivo: defectos.rechazadas },
    normalizables: defectos.normalizables,
    duplicadosExactos: defectos.duplicadosExactos,
    duplicadosProbables: defectos.duplicadosProbables,
    validasEsperadas: cantidad - rechazadas,
    insertadasEsperadas: cantidad - rechazadas - defectos.duplicadosExactos,
    huella: await calcularHuella(ruta),
  };
  await writeFile(`${ruta}.manifiesto.json`, `${JSON.stringify(manifiesto, null, 2)}\n`, 'utf8');
  return manifiesto;
}
