import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { to as copiarHacia } from 'pg-copy-streams';

export const ESQUEMA_DEL_MODELO = 'bi';
const MARCA_DE_ORDEN_DE_BYTES = Buffer.from([0xef, 0xbb, 0xbf]);
const NOMBRE_DE_VISTA = /^(dim|hecho)_[a-z_]+$/;

export async function listarVistas(cliente) {
  const { rows } = await cliente.query(
    `SELECT c.table_name AS vista, array_agg(c.column_name::text ORDER BY c.ordinal_position) AS columnas
     FROM information_schema.columns c
     JOIN information_schema.views v ON v.table_schema = c.table_schema AND v.table_name = c.table_name
     WHERE c.table_schema = $1
     GROUP BY c.table_name
     ORDER BY c.table_name`,
    [ESQUEMA_DEL_MODELO],
  );
  return rows;
}

function crearContador() {
  const huella = createHash('sha256');
  let bytes = 0;
  let iniciado = false;
  const emitir = (flujo, fragmento) => {
    huella.update(fragmento);
    bytes += fragmento.length;
    flujo.push(fragmento);
  };
  const contador = new Transform({
    transform(fragmento, codificacion, listo) {
      if (!iniciado) {
        iniciado = true;
        emitir(this, MARCA_DE_ORDEN_DE_BYTES);
      }
      emitir(this, fragmento);
      listo();
    },
    flush(listo) {
      if (!iniciado) {
        emitir(this, MARCA_DE_ORDEN_DE_BYTES);
      }
      listo();
    },
  });
  return { contador, resumen: () => ({ bytes, sha256: huella.digest('hex') }) };
}

async function exportarVista(cliente, { vista, columnas }, carpeta) {
  if (!NOMBRE_DE_VISTA.test(vista)) {
    throw new RangeError(`La vista ${vista} no sigue el patrón dim_ o hecho_.`);
  }
  const archivo = `${vista}.csv`;
  const orden = columnas.map((columna, posicion) => posicion + 1).join(', ');
  const copia = cliente.query(
    copiarHacia(
      `COPY (SELECT * FROM ${ESQUEMA_DEL_MODELO}.${vista} ORDER BY ${orden}) TO STDOUT WITH (FORMAT csv, HEADER true, ENCODING 'UTF8')`,
    ),
  );
  const { contador, resumen } = crearContador();
  await pipeline(copia, contador, createWriteStream(path.join(carpeta, archivo)));
  return { vista, archivo, filas: copia.rowCount, columnas, ...resumen() };
}

export async function exportarModelo({ cliente, carpeta, ahora = () => new Date() }) {
  await mkdir(carpeta, { recursive: true });
  const archivos = [];
  for (const vista of await listarVistas(cliente)) {
    archivos.push(await exportarVista(cliente, vista, carpeta));
  }
  const manifiesto = {
    generadoEn: ahora().toISOString(),
    esquema: ESQUEMA_DEL_MODELO,
    formato: 'CSV en UTF-8 con marca de orden de bytes, separado por comas, con encabezado y punto decimal',
    archivos,
  };
  await writeFile(path.join(carpeta, 'manifiesto.json'), `${JSON.stringify(manifiesto, null, 2)}\n`, 'utf8');
  return manifiesto;
}
