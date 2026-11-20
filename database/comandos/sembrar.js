import pg from 'pg';
import { configuracionDeConexion } from '../../backend/src/config/baseDeDatos.js';
import { leerEntorno } from '../../backend/src/config/entorno.js';
import { sembrar } from '../siembra.js';

const configuracion = leerEntorno();
const cliente = new pg.Client(configuracionDeConexion(configuracion, 'propietario'));
const claveUsuariosDemo = configuracion.produccion ? null : configuracion.claveUsuariosDemo;

await cliente.connect();
try {
  const resumen = await sembrar(cliente, { claveUsuariosDemo });
  process.stdout.write(`Datos cargados:\n${JSON.stringify(resumen, null, 2)}\n`);
  if (!claveUsuariosDemo) {
    process.stdout.write(
      'No se crearon usuarios de demostración. Define CLAVE_USUARIOS_DEMO para crearlos.\n',
    );
  }
} finally {
  await cliente.end();
}
