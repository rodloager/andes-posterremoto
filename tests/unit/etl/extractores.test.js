import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { formatoPorExtension, leerArchivo } from '../../../etl/extractores/archivo.js';
import { ErrorDeArchivo, esErrorDeEstructura } from '../../../etl/extractores/errores.js';
import { TAMANO_MAXIMO_DE_ELEMENTO } from '../../../etl/extractores/json.js';

let carpeta;
let contador = 0;

beforeAll(async () => {
  carpeta = await mkdtemp(path.join(os.tmpdir(), 'andes-extractores-'));
});

afterAll(() => rm(carpeta, { recursive: true, force: true }));

async function archivo(extension, contenido) {
  contador += 1;
  const ruta = path.join(carpeta, `archivo-${contador}.${extension}`);
  await writeFile(ruta, contenido);
  return ruta;
}

async function leerTodo(ruta, formato) {
  const filas = [];
  for await (const fila of leerArchivo(ruta, formato)) {
    filas.push(fila);
  }
  return filas;
}

describe('formatoPorExtension', () => {
  it.each([
    ['datos.csv', 'csv'],
    ['DATOS.JSON', 'json'],
    ['registros.v2.jsonl', 'jsonl'],
    ['notas.txt', null],
    ['sin-extension', null],
    ['archivo.csv.exe', null],
  ])('%s → %s', (nombre, formato) => {
    expect(formatoPorExtension(nombre)).toBe(formato);
  });

  it('rechaza un formato que no tiene lector', () => {
    expect(() => leerArchivo('datos.xml', 'xml')).toThrow(ErrorDeArchivo);
  });
});

describe('lector de CSV', () => {
  it('quita la marca de orden de bytes y normaliza los encabezados', async () => {
    const ruta = await archivo('csv', '\uFEFF Documento ,EDAD\n123,40\n');
    expect(await leerTodo(ruta, 'csv')).toEqual([{ numero: 1, datos: { documento: '123', edad: '40' } }]);
  });

  it('numera las filas de datos sin contar el encabezado ni las líneas vacías, aunque mezcle finales de línea', async () => {
    const ruta = await archivo('csv', 'a,b\n1,2\n\n3,4\r\n');
    expect((await leerTodo(ruta, 'csv')).map(({ numero, datos }) => [numero, datos])).toEqual([
      [1, { a: '1', b: '2' }],
      [2, { a: '3', b: '4' }],
    ]);
  });

  it('respeta las comillas, las comas y los saltos de línea dentro de un campo', async () => {
    const ruta = await archivo('csv', 'nombre,nota\n"Pérez, Ana","dijo ""sí""\nluego"\n');
    expect((await leerTodo(ruta, 'csv'))[0].datos).toEqual({
      nombre: 'Pérez, Ana',
      nota: 'dijo "sí"\nluego',
    });
  });

  it('marca como error de estructura una fila con columnas de más o de menos', async () => {
    const ruta = await archivo('csv', 'a,b\n1,2,3\n4\n5,6\n');
    const filas = await leerTodo(ruta, 'csv');
    expect(filas[0]).toEqual({
      numero: 1,
      error: {
        campo: null,
        codigo: 'COLUMNAS',
        mensaje: 'La fila tiene 3 columnas y el encabezado tiene 2.',
      },
      crudo: { valores: ['1', '2', '3'] },
    });
    expect(filas[1].error.codigo).toBe('COLUMNAS');
    expect(filas[2]).toEqual({ numero: 3, datos: { a: '5', b: '6' } });
    expect(esErrorDeEstructura(filas[0].error.codigo)).toBe(true);
  });

  it.each([
    ['encabezados repetidos', 'a,A\n1,2\n'],
    ['un encabezado vacío', 'a,,c\n1,2,3\n'],
  ])('rechaza el archivo con %s', async (descripcion, contenido) => {
    await expect(leerTodo(await archivo('csv', contenido), 'csv')).rejects.toThrow(
      /columnas vacías o repetidas/,
    );
  });

  it('rechaza un archivo vacío', async () => {
    await expect(leerTodo(await archivo('csv', ''), 'csv')).rejects.toThrow(/vacío/);
  });

  it('rechaza unas comillas sin cerrar e indica cerca de qué fila', async () => {
    await expect(leerTodo(await archivo('csv', 'a,b\n1,2\n"3,4\n'), 'csv')).rejects.toThrow(
      /cerca de la fila 2/,
    );
  });
});

describe('lector de JSON Lines', () => {
  it('interpreta cada línea, admite CRLF y omite las líneas vacías', async () => {
    const ruta = await archivo('jsonl', '{"a":1}\r\n\n  \n{"a":2}');
    expect(await leerTodo(ruta, 'jsonl')).toEqual([
      { numero: 1, datos: { a: 1 } },
      { numero: 2, datos: { a: 2 } },
    ]);
  });

  it('marca las líneas mal formadas o que no son objetos sin detener la lectura', async () => {
    const ruta = await archivo('jsonl', '{"a":\n[1,2]\n"texto"\n{"a":3}\n');
    const filas = await leerTodo(ruta, 'jsonl');
    expect(filas.map(({ numero, error, datos }) => [numero, error?.codigo ?? null, datos ?? null])).toEqual([
      [1, 'JSON_INVALIDO', null],
      [2, 'JSON_NO_OBJETO', null],
      [3, 'JSON_NO_OBJETO', null],
      [4, null, { a: 3 }],
    ]);
    expect(filas[0].crudo).toEqual({ texto: '{"a":' });
  });

  it('guarda como muestra solo los primeros 500 caracteres de una línea inválida', async () => {
    const ruta = await archivo('jsonl', `{"a": "${'x'.repeat(800)}"\n`);
    const [fila] = await leerTodo(ruta, 'jsonl');
    expect(fila.crudo.texto).toHaveLength(500);
  });

  it('rechaza una línea que supera 1 MB', async () => {
    const ruta = await archivo('jsonl', `{"a":"${'x'.repeat(TAMANO_MAXIMO_DE_ELEMENTO + 10)}"}`);
    await expect(leerTodo(ruta, 'jsonl')).rejects.toThrow(/1 MB/);
  });
});

describe('lector de arreglos JSON', () => {
  it('separa los objetos sin cargar el archivo completo y respeta las cadenas', async () => {
    const ruta = await archivo(
      'json',
      '\uFEFF[\n {"a": "}{", "b": [1, {"c": "\\"]"}]},\n {"a": "\\\\"}\n]\n',
    );
    expect(await leerTodo(ruta, 'json')).toEqual([
      { numero: 1, datos: { a: '}{', b: [1, { c: '"]' }] } },
      { numero: 2, datos: { a: '\\' } },
    ]);
  });

  it('lee objetos que quedan partidos entre dos fragmentos del archivo', async () => {
    const elementos = Array.from({ length: 3000 }, (valor, indice) => ({
      indice,
      texto: `fila "${indice}" {}`,
    }));
    const ruta = await archivo('json', JSON.stringify(elementos));
    const filas = await leerTodo(ruta, 'json');
    expect(filas).toHaveLength(3000);
    expect(filas.at(-1)).toEqual({ numero: 3000, datos: elementos.at(-1) });
  });

  it('acepta un arreglo vacío', async () => {
    expect(await leerTodo(await archivo('json', ' [ ] '), 'json')).toEqual([]);
  });

  it.each([
    ['un objeto en lugar de un arreglo', '{"a": 1}', /arreglo de objetos/],
    ['elementos que no son objetos', '[1, 2]', /mal formado después del registro 0/],
    ['dos elementos sin coma', '[{"a":1} {"a":2}]', /mal formado después del registro 1/],
    ['contenido después del cierre', '[{"a":1}] {}', /después del cierre/],
    ['un arreglo sin cerrar', '[{"a":1},', /incompleto/],
  ])('rechaza %s', async (descripcion, contenido, mensaje) => {
    await expect(leerTodo(await archivo('json', contenido), 'json')).rejects.toThrow(mensaje);
  });

  it('marca como inválido un objeto con la sintaxis rota por dentro', async () => {
    const [fila] = await leerTodo(await archivo('json', '[{"a": 1,}]'), 'json');
    expect(fila.error.codigo).toBe('JSON_INVALIDO');
  });

  it('rechaza un objeto que supera 1 MB', async () => {
    const ruta = await archivo('json', `[{"a":"${'x'.repeat(TAMANO_MAXIMO_DE_ELEMENTO + 10)}"}]`);
    await expect(leerTodo(ruta, 'json')).rejects.toThrow(/1 MB/);
  });
});
