import { crearAplicacion } from './src/app.js';
import { crearConexiones } from './src/config/baseDeDatos.js';
import { leerEntorno } from './src/config/entorno.js';
import { crearRegistro } from './src/config/registro.js';
import { crearLanzadorDeTrabajador } from './src/services/trabajador.js';

const configuracion = leerEntorno();
const registro = crearRegistro(configuracion);
const conexiones = crearConexiones(configuracion, {
  alError: (error, cuenta) =>
    registro.error({ err: error, cuenta }, 'Falló una conexión inactiva a la base de datos'),
});
const etlHabilitado = Boolean(configuracion.claves.propietario && configuracion.seudonimos.secreto);
const lanzarTrabajador = crearLanzadorDeTrabajador({ habilitado: etlHabilitado, registro });
const { aplicacion, cerrar } = crearAplicacion({ configuracion, conexiones, registro, lanzarTrabajador });

const servidor = aplicacion.listen(configuracion.puerto, () => {
  registro.info(`ANDES disponible en http://localhost:${configuracion.puerto}`);
  if (etlHabilitado) {
    lanzarTrabajador();
  } else {
    registro.warn(
      'Las cargas quedarán en cola: faltan BD_PROPIETARIO_CLAVE o SEUDONIMO_SECRETO para el ETL.',
    );
  }
});

async function apagar(senal) {
  registro.info({ senal }, 'Cerrando el servidor');
  servidor.close();
  cerrar();
  await conexiones.cerrar();
  process.exit(0);
}

process.once('SIGINT', apagar);
process.once('SIGTERM', apagar);
