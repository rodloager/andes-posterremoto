import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runner } from 'node-pg-migrate';

const carpetaMigraciones = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

export const TABLA_DE_MIGRACIONES = 'migraciones';

export function migrar(conexion, { direccion = 'up', cantidad = Infinity, registrar = () => {} } = {}) {
  return runner({
    databaseUrl: conexion,
    dir: carpetaMigraciones,
    migrationsTable: TABLA_DE_MIGRACIONES,
    direction: direccion,
    count: cantidad,
    checkOrder: true,
    singleTransaction: true,
    migrationLoaderStrategies: [{ extensions: ['.sql'], loader: 'sql' }],
    log: registrar,
    verbose: false,
  });
}
