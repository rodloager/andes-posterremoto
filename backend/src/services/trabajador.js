import { spawn } from 'node:child_process';
import path from 'node:path';
import { raiz } from '../../../etl/nucleo/archivos.js';

export const LIMITE_DEL_MONTON_DEL_ETL_MB = 96;

export function crearLanzadorDeTrabajador({ habilitado, registro, generar = spawn }) {
  let activo = null;
  let pendiente = false;

  function lanzar() {
    if (!habilitado) {
      return false;
    }
    if (activo) {
      pendiente = true;
      return true;
    }
    activo = generar(
      process.execPath,
      [`--max-old-space-size=${LIMITE_DEL_MONTON_DEL_ETL_MB}`, path.join(raiz, 'etl', 'cli.js'), 'trabajar'],
      { cwd: raiz, env: process.env, stdio: 'ignore' },
    );
    activo.on('error', (error) => {
      registro.error({ err: error }, 'No se pudo iniciar el trabajador del ETL');
    });
    activo.on('exit', (codigo) => {
      activo = null;
      if (codigo !== 0) {
        registro.warn({ codigo }, 'El trabajador del ETL terminó con error');
      }
      if (pendiente) {
        pendiente = false;
        lanzar();
      }
    });
    return true;
  }

  return lanzar;
}
