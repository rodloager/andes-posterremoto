import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const RUTA_DE_LAS_MEDIDAS = path.join(path.dirname(fileURLToPath(import.meta.url)), 'medidas.dax');
export const TABLA_DE_MEDIDAS = 'Medidas';

const ENCABEZADO = /^(\S(?:.*\S)?) =$/;
const TEXTO = /"(?:[^"]|"")*"/g;
const TABLA = /\b((?:dim|hecho)_[a-z_]+)\b/g;
const COLUMNA = /\b((?:dim|hecho)_[a-z_]+)\[([^\]]+)\]/g;
const MEDIDA = /(?<![\w\]])\[([^\]]+)\]/g;
const IGUALDAD = /\b((?:dim|hecho)_[a-z_]+)\[([^\]]+)\]\s*=\s*"((?:[^"]|"")*)"/g;
const PERTENENCIA = /\b((?:dim|hecho)_[a-z_]+)\[([^\]]+)\]\s+IN\s*\{([^}]*)\}/g;
const PAREJAS = { ')': '(', '}': '{', ']': '[' };

function sinTextos(expresion) {
  return expresion.replace(TEXTO, '""');
}

function valoresDeTexto(lista) {
  return [...lista.matchAll(TEXTO)].map(([literal]) => literal.slice(1, -1).replaceAll('""', '"'));
}

export function leerMedidas(texto) {
  return texto
    .replace(/\r\n/g, '\n')
    .trim()
    .split(/\n[ \t]*\n/)
    .map((bloque) => {
      const [encabezado, ...lineas] = bloque.split('\n');
      const nombre = ENCABEZADO.exec(encabezado)?.[1];
      if (!nombre || lineas.length === 0) {
        throw new SyntaxError(`El bloque «${encabezado}» no empieza con «Nombre de la medida =».`);
      }
      return { nombre, expresion: lineas.join('\n') };
    });
}

export async function cargarMedidas(ruta = RUTA_DE_LAS_MEDIDAS) {
  return leerMedidas(await readFile(ruta, 'utf8'));
}

export function describirMedida({ expresion }) {
  const codigo = sinTextos(expresion);
  return {
    tablas: [...new Set([...codigo.matchAll(TABLA)].map(([, tabla]) => tabla))],
    columnas: [...codigo.matchAll(COLUMNA)].map(([, tabla, columna]) => ({ tabla, columna })),
    medidas: [
      ...new Set(
        [...codigo.matchAll(MEDIDA)].map(([, nombre]) => nombre).filter((nombre) => !nombre.startsWith('@')),
      ),
    ],
    filtros: [
      ...[...expresion.matchAll(IGUALDAD)].map(([, tabla, columna, valor]) => ({
        tabla,
        columna,
        valores: [valor.replaceAll('""', '"')],
      })),
      ...[...expresion.matchAll(PERTENENCIA)].map(([, tabla, columna, lista]) => ({
        tabla,
        columna,
        valores: valoresDeTexto(lista),
      })),
    ],
  };
}

function signosDesbalanceados(expresion) {
  const pila = [];
  for (const signo of sinTextos(expresion)) {
    if ('({['.includes(signo)) {
      pila.push(signo);
    } else if (PAREJAS[signo] && pila.pop() !== PAREJAS[signo]) {
      return true;
    }
  }
  return pila.length > 0;
}

function buscarCiclo(dependencias) {
  const estado = new Map();
  const visitar = (nombre, camino) => {
    if (estado.get(nombre) === 'terminada') {
      return null;
    }
    if (estado.get(nombre) === 'abierta') {
      return [...camino.slice(camino.indexOf(nombre)), nombre];
    }
    estado.set(nombre, 'abierta');
    for (const siguiente of dependencias.get(nombre) ?? []) {
      const ciclo = visitar(siguiente, [...camino, nombre]);
      if (ciclo) {
        return ciclo;
      }
    }
    estado.set(nombre, 'terminada');
    return null;
  };
  for (const nombre of dependencias.keys()) {
    const ciclo = visitar(nombre, []);
    if (ciclo) {
      return ciclo;
    }
  }
  return null;
}

export function revisarMedidas(medidas) {
  const problemas = [];
  const nombres = new Set();
  for (const { nombre } of medidas) {
    if (nombres.has(nombre)) {
      problemas.push(`La medida «${nombre}» está repetida.`);
    }
    nombres.add(nombre);
  }
  const dependencias = new Map();
  for (const medida of medidas) {
    if (signosDesbalanceados(medida.expresion)) {
      problemas.push(`La medida «${medida.nombre}» tiene paréntesis, llaves o corchetes sin cerrar.`);
    }
    const { medidas: usadas } = describirMedida(medida);
    for (const usada of usadas.filter((nombre) => !nombres.has(nombre))) {
      problemas.push(`La medida «${medida.nombre}» usa «${usada}», que no está definida.`);
    }
    dependencias.set(
      medida.nombre,
      usadas.filter((nombre) => nombres.has(nombre)),
    );
  }
  const ciclo = buscarCiclo(dependencias);
  if (ciclo) {
    problemas.push(`Hay una dependencia circular: ${ciclo.join(' → ')}.`);
  }
  return problemas;
}

function sangrar(texto, espacios) {
  const margen = ' '.repeat(espacios);
  return texto
    .split('\n')
    .map((linea) => (linea ? `${margen}${linea}` : linea))
    .join('\n');
}

export function consultaDeMedidas(medidas, tabla = TABLA_DE_MEDIDAS) {
  const definiciones = medidas.map(
    ({ nombre, expresion }) => `    MEASURE '${tabla}'[${nombre}] =\n${sangrar(expresion, 8)}`,
  );
  const columnas = medidas.map(({ nombre }) => `        "${nombre}", [${nombre}]`);
  return `DEFINE\n${definiciones.join('\n\n')}\n\nEVALUATE\n    ROW (\n${columnas.join(',\n')}\n    )\n`;
}
