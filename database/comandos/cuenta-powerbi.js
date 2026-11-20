import pg from 'pg';
import { configuracionDeConexion } from '../../backend/src/config/baseDeDatos.js';
import { CUENTAS, leerEntorno } from '../../backend/src/config/entorno.js';

const CONEXIONES_MAXIMAS = 5;
const escribir = (texto) => process.stdout.write(`${texto}\n`);

const configuracion = leerEntorno();
if (!configuracion.claves.powerbi) {
  process.stderr.write(
    'Falta BD_POWERBI_CLAVE en el archivo .env. Agrega una clave aleatoria de al menos 16 caracteres y vuelve a ejecutar el comando.\n',
  );
  process.exit(1);
}

const propietario = new pg.Client(configuracionDeConexion(configuracion, 'propietario'));
await propietario.connect();
try {
  const { rows } = await propietario.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [CUENTAS.powerbi]);
  if (rows.length === 0) {
    process.stderr.write('La cuenta powerbi_lector no existe. Ejecuta primero npm run db:migrate.\n');
    process.exitCode = 1;
  } else {
    await propietario.query(
      `ALTER ROLE ${CUENTAS.powerbi} WITH LOGIN PASSWORD ${propietario.escapeLiteral(configuracion.claves.powerbi)} CONNECTION LIMIT ${CONEXIONES_MAXIMAS}`,
    );
    await propietario.query(`ALTER ROLE ${CUENTAS.powerbi} SET default_transaction_read_only = on`);
  }
} finally {
  await propietario.end();
}

if (!process.exitCode) {
  const lector = new pg.Client(configuracionDeConexion(configuracion, 'powerbi'));
  await lector.connect();
  try {
    const {
      rows: [{ vistas }],
    } = await lector.query(
      "SELECT count(*)::int AS vistas FROM information_schema.views WHERE table_schema = 'bi'",
    );
    const { baseDeDatos } = configuracion;
    escribir(`La cuenta ${CUENTAS.powerbi} puede iniciar sesión y leer ${vistas} vistas del esquema bi.`);
    escribir(`Servidor: ${baseDeDatos.host}:${baseDeDatos.puerto} · Base de datos: ${baseDeDatos.nombre}`);
    escribir('La clave es el valor de BD_POWERBI_CLAVE en el archivo .env.');
  } finally {
    await lector.end();
  }
}
