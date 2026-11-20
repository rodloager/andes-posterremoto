import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { from as copiarDesde } from 'pg-copy-streams';

const IDENTIFICADOR = /^[a-z_]+(\.[a-z_]+)?$/;

const entreComillas = (texto) => `"${texto.replaceAll('"', '""')}"`;
const elementoDeArreglo = (texto) => `"${String(texto).replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;

export function valorParaCopia(valor) {
  if (valor === null || valor === undefined) {
    return '';
  }
  if (Array.isArray(valor)) {
    return entreComillas(`{${valor.map(elementoDeArreglo).join(',')}}`);
  }
  if (typeof valor === 'object') {
    return entreComillas(JSON.stringify(valor));
  }
  if (typeof valor === 'number' || typeof valor === 'boolean') {
    return String(valor);
  }
  return entreComillas(String(valor));
}

function* lineas(filas) {
  for (const fila of filas) {
    yield `${fila.map(valorParaCopia).join(',')}\n`;
  }
}

export async function copiarFilas(cliente, tabla, columnas, filas) {
  if (filas.length === 0) {
    return 0;
  }
  if (!IDENTIFICADOR.test(tabla) || !columnas.every((columna) => IDENTIFICADOR.test(columna))) {
    throw new RangeError(`Identificador no permitido en la copia a ${tabla}.`);
  }
  const destino = cliente.query(
    copiarDesde(`COPY ${tabla} (${columnas.join(', ')}) FROM STDIN WITH (FORMAT csv)`),
  );
  await pipeline(Readable.from(lineas(filas)), destino);
  return filas.length;
}
