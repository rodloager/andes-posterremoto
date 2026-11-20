import { copyFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import pg from 'pg';
import { configuracionDeConexion } from '../../backend/src/config/baseDeDatos.js';
import { leerEntorno } from '../../backend/src/config/entorno.js';
import { exportarModelo } from './exportacion.js';
import { RUTA_DE_LAS_MEDIDAS, cargarMedidas, consultaDeMedidas, revisarMedidas } from './medidas.js';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const numero = new Intl.NumberFormat('es-CO');
const escribir = (texto = '') => process.stdout.write(`${texto}\n`);

const { values: opciones } = parseArgs({
  options: { salida: { type: 'string', default: path.join(raiz, 'analytics', 'powerbi', 'datos') } },
});

const medidas = await cargarMedidas();
const problemas = revisarMedidas(medidas);
if (problemas.length > 0) {
  process.stderr.write(`El archivo de medidas tiene problemas:\n${problemas.join('\n')}\n`);
  process.exit(1);
}

const configuracion = leerEntorno();
if (!configuracion.claves.powerbi) {
  process.stderr.write(
    'Falta BD_POWERBI_CLAVE en el archivo .env. La exportación usa la cuenta de solo lectura de Power BI: agrega la clave y ejecuta npm run bi:cuenta.\n',
  );
  process.exit(1);
}

const cliente = new pg.Client(configuracionDeConexion(configuracion, 'powerbi'));
await cliente.connect();
try {
  const inicio = performance.now();
  const carpeta = path.resolve(opciones.salida);
  const { archivos } = await exportarModelo({ cliente, carpeta });
  await copyFile(RUTA_DE_LAS_MEDIDAS, path.join(carpeta, 'medidas.dax'));
  await writeFile(path.join(carpeta, 'consulta-de-medidas.dax'), consultaDeMedidas(medidas), 'utf8');
  for (const { archivo, filas, bytes } of archivos) {
    escribir(
      `${archivo.padEnd(36)} ${numero.format(filas).padStart(9)} filas  ${numero.format(bytes).padStart(12)} bytes`,
    );
  }
  escribir();
  escribir(
    `${archivos.length} archivos CSV, manifiesto.json y ${medidas.length} medidas DAX en ${path.relative(raiz, carpeta) || carpeta}, en ${((performance.now() - inicio) / 1000).toFixed(1)} s.`,
  );
} finally {
  await cliente.end();
}
