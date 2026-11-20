import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import multer from 'multer';
import { formatoPorExtension } from '../../../etl/extractores/archivo.js';
import { raiz } from '../../../etl/nucleo/archivos.js';
import { ErrorHttp } from '../utils/errores.js';

export const CARPETA_DE_CARGAS = path.join(raiz, 'data', 'uploads');
export const TAMANO_MAXIMO_DE_CARGA = 250 * 1024 * 1024;

export function recibirArchivo({ carpeta = CARPETA_DE_CARGAS, tamanoMaximo = TAMANO_MAXIMO_DE_CARGA } = {}) {
  mkdirSync(carpeta, { recursive: true });
  const almacenamiento = multer.diskStorage({
    destination: carpeta,
    filename: (solicitud, archivo, listo) => {
      listo(null, `${randomUUID()}.${formatoPorExtension(archivo.originalname)}`);
    },
  });
  const recibir = multer({
    storage: almacenamiento,
    limits: { fileSize: tamanoMaximo, files: 1, fields: 4, fieldSize: 1024, parts: 5 },
    fileFilter: (solicitud, archivo, listo) => {
      if (!formatoPorExtension(archivo.originalname)) {
        listo(new ErrorHttp(400, 'FORMATO_NO_ADMITIDO', 'Solo se aceptan archivos CSV, JSON o JSON Lines.'));
        return;
      }
      listo(null, true);
    },
  }).single('archivo');

  return function recibirArchivoUnico(solicitud, respuesta, siguiente) {
    recibir(solicitud, respuesta, (error) => {
      if (error) {
        siguiente(error);
        return;
      }
      if (!solicitud.file) {
        siguiente(new ErrorHttp(400, 'ARCHIVO_REQUERIDO', 'Adjunte el archivo en el campo «archivo».'));
        return;
      }
      siguiente();
    });
  };
}

export async function descartarArchivoAlFallar(error, solicitud, respuesta, siguiente) {
  if (solicitud.file?.path) {
    await rm(solicitud.file.path, { force: true }).catch(() => null);
  }
  siguiente(error);
}
