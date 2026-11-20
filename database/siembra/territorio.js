import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { insertarFilas } from './insercion.js';

async function leerColeccion(ruta) {
  return JSON.parse(await readFile(ruta, 'utf8')).features.map(({ properties }) => properties);
}

async function leerMunicipios(carpetaGeo) {
  const carpeta = path.join(carpetaGeo, 'municipios');
  const archivos = (await readdir(carpeta)).filter((archivo) => archivo.endsWith('.json')).sort();
  const colecciones = await Promise.all(
    archivos.map((archivo) => leerColeccion(path.join(carpeta, archivo))),
  );
  return colecciones.flat();
}

export async function sembrarDivisionTerritorial(cliente, carpetaGeo) {
  const departamentos = await leerColeccion(path.join(carpetaGeo, 'departamentos.json'));
  const municipios = await leerMunicipios(carpetaGeo);
  await insertarFilas(
    cliente,
    'nucleo.departamentos',
    ['codigo', 'nombre'],
    departamentos.map(({ codigo, nombre }) => [codigo, nombre]),
  );
  await insertarFilas(
    cliente,
    'nucleo.municipios',
    ['codigo', 'departamento_codigo', 'nombre'],
    municipios.map(({ codigo, departamento, nombre }) => [codigo, departamento, nombre]),
  );
  return { departamentos: departamentos.length, municipios: municipios.length };
}
