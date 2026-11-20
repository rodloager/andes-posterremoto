import { randomBytes } from 'node:crypto';
import { parseArgs } from 'node:util';
import pg from 'pg';
import { configuracionDeConexion } from '../../backend/src/config/baseDeDatos.js';
import { leerEntorno } from '../../backend/src/config/entorno.js';
import { guardarUsuario } from '../siembra/seguridad.js';

const ROLES = ['analista', 'administrador_datos', 'ingeniero', 'superadministrador'];

const { values: argumentos } = parseArgs({
  options: {
    correo: { type: 'string' },
    nombre: { type: 'string' },
    rol: { type: 'string' },
  },
});

if (!argumentos.correo || !argumentos.nombre || !ROLES.includes(argumentos.rol)) {
  process.stderr.write(
    `Uso: npm run usuarios:crear -- --correo persona@entidad.gov.co --nombre "Nombre Apellido" --rol ${ROLES.join('|')}\n`,
  );
  process.exit(1);
}

const clave = randomBytes(18).toString('base64url');
const cliente = new pg.Client(configuracionDeConexion(leerEntorno(), 'propietario'));
await cliente.connect();
try {
  await cliente.query('BEGIN');
  const { id, creado } = await guardarUsuario(cliente, { ...argumentos, clave });
  await cliente.query('SELECT seguridad.registrar_auditoria(NULL, $1, $2, $3, NULL, $4)', [
    creado ? 'CREAR' : 'ACTUALIZAR',
    'usuario',
    String(id),
    JSON.stringify({ correo: argumentos.correo.toLowerCase(), rol: argumentos.rol }),
  ]);
  await cliente.query('COMMIT');
  process.stdout.write(
    `Usuario guardado: ${argumentos.correo.toLowerCase()} (${argumentos.rol}).\nContraseña temporal: ${clave}\nEntrégala por un canal seguro. No se volverá a mostrar.\n`,
  );
} catch (error) {
  await cliente.query('ROLLBACK');
  throw error;
} finally {
  await cliente.end();
}
