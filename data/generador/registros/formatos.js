import { once } from 'node:events';
import { createWriteStream } from 'node:fs';

export const FORMATOS = Object.freeze({ csv: 'csv', jsonl: 'jsonl', json: 'json' });

const FILAS_POR_BLOQUE = 1000;
const NECESITA_COMILLAS = /[",\n\r]|^\s|\s$/;

export function valorCsv(valor) {
  if (valor === null || valor === undefined) {
    return '';
  }
  const texto = Array.isArray(valor) ? valor.join('|') : String(valor);
  return NECESITA_COMILLAS.test(texto) ? `"${texto.replaceAll('"', '""')}"` : texto;
}

function seleccionar(fila, columnas) {
  return Object.fromEntries(columnas.map((columna) => [columna, fila[columna] ?? null]));
}

export async function crearEscritor(ruta, { formato, columnas }) {
  if (!Object.values(FORMATOS).includes(formato)) {
    throw new RangeError(`Formato no admitido: ${formato}`);
  }
  const flujo = createWriteStream(ruta, { encoding: 'utf8', highWaterMark: 1 << 20 });
  let pendiente = [];
  let filas = 0;

  async function escribir(texto) {
    if (!flujo.write(texto)) {
      await once(flujo, 'drain');
    }
  }

  async function vaciar() {
    if (pendiente.length > 0) {
      const bloque = pendiente.join('');
      pendiente = [];
      await escribir(bloque);
    }
  }

  function serializar(fila) {
    if (formato === FORMATOS.csv) {
      return `${columnas.map((columna) => valorCsv(fila[columna])).join(',')}\n`;
    }
    const texto = JSON.stringify(seleccionar(fila, columnas));
    if (formato === FORMATOS.jsonl) {
      return `${texto}\n`;
    }
    return filas === 0 ? texto : `,\n${texto}`;
  }

  if (formato === FORMATOS.csv) {
    await escribir(`${columnas.join(',')}\n`);
  } else if (formato === FORMATOS.json) {
    await escribir('[\n');
  }

  return {
    async agregar(fila) {
      pendiente.push(serializar(fila));
      filas += 1;
      if (pendiente.length >= FILAS_POR_BLOQUE) {
        await vaciar();
      }
    },
    async cerrar() {
      await vaciar();
      if (formato === FORMATOS.json) {
        await escribir('\n]\n');
      }
      flujo.end();
      await once(flujo, 'finish');
      return filas;
    },
  };
}
