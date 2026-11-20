import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { crearSelectorAlias } from '../aleatorio.js';
import { pesarPorCercania } from '../territorio.js';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const carpetaMunicipios = path.join(raiz, 'frontend', 'public', 'datos', 'geo', 'municipios');
const carpetaOficiales = path.join(raiz, 'database', 'seeds', 'oficial');

export const FECHA_DEL_SISMO = '2026-08-10';
export const FECHA_DE_CORTE = '2026-11-08';

async function leerJson(ruta) {
  return JSON.parse(await readFile(ruta, 'utf8'));
}

export async function cargarMunicipiosAfectados() {
  const [evento, territorio, archivos] = await Promise.all([
    leerJson(path.join(carpetaOficiales, 'evento.json')),
    leerJson(path.join(carpetaOficiales, 'territorio.json')),
    readdir(carpetaMunicipios),
  ]);
  const conReporte = new Set(territorio.municipios.map(({ codigo }) => codigo));
  const colecciones = await Promise.all(
    archivos
      .filter((archivo) => archivo.endsWith('.json'))
      .map((archivo) => leerJson(path.join(carpetaMunicipios, archivo))),
  );
  const entidades = colecciones
    .flatMap(({ features }) => features)
    .filter((entidad) => conReporte.has(entidad.properties.codigo))
    .sort((una, otra) => una.properties.codigo.localeCompare(otra.properties.codigo));
  return pesarPorCercania(entidades, evento.coordenadas);
}

export function crearContexto(municipios) {
  if (municipios.length === 0) {
    throw new RangeError('Se necesita al menos un municipio para generar registros.');
  }
  return {
    municipios,
    elegirMunicipio: crearSelectorAlias(municipios.map(({ peso }) => peso)),
    fechaDelSismo: FECHA_DEL_SISMO,
    fechaDeCorte: FECHA_DE_CORTE,
  };
}
