import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export const carpetaDatosPublicos = path.join(raiz, 'frontend', 'public', 'datos');
export const carpetaDatosCrudos = path.join(raiz, 'data', 'raw');
export const carpetaSemillasOficiales = path.join(raiz, 'database', 'seeds', 'oficial');

export function fechaDeHoy() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
}

export async function escribirJson(ruta, contenido, { compacto = false } = {}) {
  await mkdir(path.dirname(ruta), { recursive: true });
  const texto = compacto ? JSON.stringify(contenido) : JSON.stringify(contenido, null, 2);
  await writeFile(ruta, `${texto}\n`, 'utf8');
  return path.relative(raiz, ruta);
}
