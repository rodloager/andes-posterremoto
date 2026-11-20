import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SEMILLA_POR_DEFECTO, generarDemostracion } from './demostracion.js';
import { pesarPorCercania } from './territorio.js';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const carpetaDatos = path.join(raiz, 'frontend', 'public', 'datos');
const carpetaOficiales = path.join(raiz, 'database', 'seeds', 'oficial');
const carpetaSalida = path.join(carpetaDatos, 'simulado');

const ADVERTENCIA =
  'Datos simulados por el proyecto para demostrar el funcionamiento de la plataforma. No son cifras oficiales ni estimaciones.';

async function leerJson(carpeta, archivo) {
  return JSON.parse(await readFile(path.join(carpeta, archivo), 'utf8'));
}

async function escribirModulo(nombre, contenido) {
  const meta = {
    origen: 'SIMULADO',
    nivel: 'S',
    fuente: 'generador-andes',
    semilla: SEMILLA_POR_DEFECTO,
    advertencia: ADVERTENCIA,
  };
  const ruta = path.join(carpetaSalida, `${nombre}.json`);
  await writeFile(ruta, `${JSON.stringify({ meta, ...contenido }, null, 2)}\n`, 'utf8');
  return path.relative(raiz, ruta);
}

const [evento, territorio, limites] = await Promise.all([
  leerJson(carpetaOficiales, 'evento.json'),
  leerJson(carpetaOficiales, 'territorio.json'),
  leerJson(path.join(carpetaDatos, 'geo'), 'departamentos.json'),
]);

const conReporte = new Set(territorio.departamentos.map(({ codigo }) => codigo));
const departamentos = pesarPorCercania(
  limites.features.filter((entidad) => conReporte.has(entidad.properties.codigo)),
  evento.coordenadas,
);

const MODULOS_DESDE_LA_BASE = new Set(['poblacion', 'vivienda']);

const { indicadores, ...todos } = generarDemostracion({ departamentos });
const modulos = Object.fromEntries(
  Object.entries(todos).filter(([nombre]) => !MODULOS_DESDE_LA_BASE.has(nombre)),
);

await mkdir(carpetaSalida, { recursive: true });
const rutas = await Promise.all([
  escribirModulo('indicadores', { indicadores }),
  ...Object.entries(modulos).map(([nombre, contenido]) => escribirModulo(nombre, contenido)),
]);
process.stdout.write(`${rutas.join('\n')}\n`);
