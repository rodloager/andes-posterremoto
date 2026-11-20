import { createReadStream } from 'node:fs';
import { parse } from 'csv-parse';
import { ERRORES_DE_ESTRUCTURA, ErrorDeArchivo } from './errores.js';

const TAMANO_MAXIMO_DE_REGISTRO = 64 * 1024;

export const normalizarEncabezado = (encabezado) => String(encabezado).trim().toLowerCase();

export async function* leerCsv(ruta) {
  const lector = createReadStream(ruta).pipe(
    parse({
      bom: true,
      relax_column_count: true,
      record_delimiter: ['\r\n', '\n'],
      max_record_size: TAMANO_MAXIMO_DE_REGISTRO,
      skip_empty_lines: true,
    }),
  );
  let encabezados = null;
  let numero = 0;
  try {
    for await (const registro of lector) {
      if (encabezados === null) {
        encabezados = registro.map(normalizarEncabezado);
        if (
          new Set(encabezados).size !== encabezados.length ||
          encabezados.some((encabezado) => !encabezado)
        ) {
          throw new ErrorDeArchivo('El encabezado del CSV tiene columnas vacías o repetidas.');
        }
        continue;
      }
      numero += 1;
      if (registro.length !== encabezados.length) {
        yield {
          numero,
          error: {
            campo: null,
            codigo: ERRORES_DE_ESTRUCTURA.columnas,
            mensaje: `La fila tiene ${registro.length} columnas y el encabezado tiene ${encabezados.length}.`,
          },
          crudo: { valores: registro },
        };
        continue;
      }
      yield {
        numero,
        datos: Object.fromEntries(
          encabezados.map((encabezado, posicion) => [encabezado, registro[posicion]]),
        ),
      };
    }
  } catch (error) {
    if (error instanceof ErrorDeArchivo) {
      throw error;
    }
    throw new ErrorDeArchivo(`El CSV está mal formado cerca de la fila ${numero + 1}: ${error.message}`);
  }
  if (encabezados === null) {
    throw new ErrorDeArchivo('El archivo CSV está vacío.');
  }
}
