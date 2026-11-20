import { leerCsv } from './csv.js';
import { ErrorDeArchivo } from './errores.js';
import { leerJsonArreglo, leerJsonLineas } from './json.js';

const LECTORES = Object.freeze({ csv: leerCsv, json: leerJsonArreglo, jsonl: leerJsonLineas });

export function formatoPorExtension(ruta) {
  const extension = ruta.toLowerCase().split('.').at(-1);
  return Object.hasOwn(LECTORES, extension) ? extension : null;
}

export function leerArchivo(ruta, formato) {
  const lector = LECTORES[formato];
  if (!lector) {
    throw new ErrorDeArchivo(`Formato no admitido: ${formato}. Use CSV, JSON o JSON Lines.`);
  }
  return lector(ruta);
}
