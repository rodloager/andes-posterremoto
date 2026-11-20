import pg from 'pg';
import { configuracionDeConexion } from '../../backend/src/config/baseDeDatos.js';

export async function conectarEtl(configuracion) {
  const cliente = new pg.Client({
    ...configuracionDeConexion(configuracion, 'propietario'),
    application_name: 'andes-etl',
  });
  await cliente.connect();
  return cliente;
}
