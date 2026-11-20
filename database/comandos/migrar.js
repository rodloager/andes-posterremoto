import { configuracionDeConexion } from '../../backend/src/config/baseDeDatos.js';
import { leerEntorno } from '../../backend/src/config/entorno.js';
import { migrar } from '../migraciones.js';

const OPCIONES = {
  subir: { direccion: 'up', cantidad: Infinity },
  bajar: { direccion: 'down', cantidad: 1 },
  'bajar-todo': { direccion: 'down', cantidad: Infinity },
};

const accion = process.argv[2] ?? 'subir';
const opciones = OPCIONES[accion];

if (!opciones) {
  process.stderr.write(`Acción desconocida: ${accion}. Usa ${Object.keys(OPCIONES).join(', ')}.\n`);
  process.exit(1);
}

const conexion = configuracionDeConexion(leerEntorno(), 'propietario');
const aplicadas = await migrar(conexion, opciones);
const verbo = opciones.direccion === 'up' ? 'aplicadas' : 'revertidas';
process.stdout.write(`Migraciones ${verbo}: ${aplicadas.length}\n`);
for (const { name } of aplicadas) {
  process.stdout.write(`  ${name}\n`);
}
