import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CARPETAS = ['frontend', 'database', 'config', 'analytics'];
const ARCHIVOS_SUELTOS = ['docker-compose.yml'];
const CARPETAS_OMITIDAS = new Set(['vendor', 'datos', 'seeds', 'node_modules']);
const MARCAS_POR_EXTENSION = {
  '.html': [/<!--/],
  '.css': [/\/\*/],
  '.sql': [/^\s*--/, /\/\*/],
  '.yml': [/^\s*#/],
  '.sh': [/^\s*#(?!!)/],
  '.dax': [/^\s*\/\//, /^\s*--/, /\/\*/],
};

async function listarArchivos(carpeta) {
  const entradas = await readdir(carpeta, { withFileTypes: true });
  const rutas = await Promise.all(
    entradas
      .filter((entrada) => !CARPETAS_OMITIDAS.has(entrada.name))
      .map((entrada) => {
        const ruta = path.join(carpeta, entrada.name);
        return entrada.isDirectory() ? listarArchivos(ruta) : [ruta];
      }),
  );
  return rutas.flat();
}

async function buscarComentarios(ruta) {
  const marcas = MARCAS_POR_EXTENSION[path.extname(ruta)];
  if (!marcas) {
    return [];
  }
  const lineas = (await readFile(ruta, 'utf8')).split('\n');
  return lineas.flatMap((linea, posicion) =>
    marcas.some((marca) => marca.test(linea)) ? [`${path.relative(raiz, ruta)}:${posicion + 1}`] : [],
  );
}

const archivos = [
  ...(await Promise.all(CARPETAS.map((carpeta) => listarArchivos(path.join(raiz, carpeta))))).flat(),
  ...ARCHIVOS_SUELTOS.map((archivo) => path.join(raiz, archivo)),
].filter((ruta) => MARCAS_POR_EXTENSION[path.extname(ruta)]);
const hallazgos = (await Promise.all(archivos.map(buscarComentarios))).flat();

if (hallazgos.length > 0) {
  process.stderr.write(`Hay comentarios fuera del código JavaScript:\n${hallazgos.join('\n')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(
    `Sin comentarios en ${archivos.length} archivos HTML, CSS, SQL, YAML, DAX y de shell.\n`,
  );
}
