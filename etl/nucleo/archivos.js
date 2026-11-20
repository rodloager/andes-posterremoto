import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

export const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const CARPETAS_DE_ENTRADA = Object.freeze([
  path.join(raiz, 'data'),
  path.join(raiz, 'tests', 'fixtures'),
]);

export async function calcularHuella(ruta) {
  const huella = createHash('sha256');
  await pipeline(createReadStream(ruta), huella);
  return huella.digest('hex');
}

export function rutaRelativa(ruta) {
  const relativa = path.relative(raiz, path.resolve(ruta));
  return relativa.startsWith('..') ? path.resolve(ruta) : relativa.split(path.sep).join('/');
}

export function resolverRutaGuardada(guardada) {
  const absoluta = path.resolve(raiz, guardada);
  const permitida = CARPETAS_DE_ENTRADA.some((carpeta) => absoluta.startsWith(`${carpeta}${path.sep}`));
  if (!permitida) {
    throw new RangeError(`La ruta ${guardada} está fuera de las carpetas de datos.`);
  }
  return absoluta;
}
