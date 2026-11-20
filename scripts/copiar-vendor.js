import { cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const carpetaVendor = path.join(raiz, 'frontend', 'public', 'vendor');

const desdeModulos = (...partes) => path.join(raiz, 'node_modules', ...partes);
const haciaVendor = (...partes) => path.join(carpetaVendor, ...partes);

const copias = [
  ['bootstrap/dist/css/bootstrap.min.css', 'bootstrap/bootstrap.min.css'],
  ['bootstrap/dist/css/bootstrap.min.css.map', 'bootstrap/bootstrap.min.css.map'],
  ['bootstrap/dist/js/bootstrap.bundle.min.js', 'bootstrap/bootstrap.bundle.min.js'],
  ['bootstrap/dist/js/bootstrap.bundle.min.js.map', 'bootstrap/bootstrap.bundle.min.js.map'],
  ['echarts/dist/echarts.esm.min.js', 'echarts/echarts.esm.min.js'],
  ['leaflet/dist/leaflet-src.esm.js', 'leaflet/leaflet-src.esm.js'],
  ['leaflet/dist/leaflet-src.esm.js.map', 'leaflet/leaflet-src.esm.js.map'],
  ['leaflet/dist/leaflet.css', 'leaflet/leaflet.css'],
  ['leaflet/dist/images', 'leaflet/images'],
  ['@fontsource-variable/inter/files/inter-latin-wght-normal.woff2', 'fuentes/inter-latin-wght-normal.woff2'],
];

async function copiar([origen, destino]) {
  const rutaDestino = haciaVendor(...destino.split('/'));
  await mkdir(path.dirname(rutaDestino), { recursive: true });
  await cp(desdeModulos(...origen.split('/')), rutaDestino, { recursive: true });
}

await rm(carpetaVendor, { recursive: true, force: true });
await Promise.all(copias.map(copiar));
process.stdout.write(`Bibliotecas copiadas a ${path.relative(raiz, carpetaVendor)}\n`);
