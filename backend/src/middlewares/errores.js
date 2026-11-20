import { ErrorHttp, crearProblema, noEncontrado } from '../utils/errores.js';

const CODIGOS_SIN_CONEXION = new Set([
  'ECONNREFUSED',
  'ENOTFOUND',
  'ETIMEDOUT',
  '57P01',
  '57P03',
  '08001',
  '08006',
  '53300',
]);
const MENSAJES_SIN_CONEXION = /timeout exceeded when trying to connect|Connection terminated/i;

function clasificar(error) {
  if (error instanceof ErrorHttp) {
    return {
      estado: error.estado,
      codigo: error.codigo,
      detalle: error.message,
      extensiones: error.extensiones,
    };
  }
  if (error.name === 'MulterError') {
    return error.code === 'LIMIT_FILE_SIZE'
      ? {
          estado: 413,
          codigo: 'ARCHIVO_DEMASIADO_GRANDE',
          detalle: 'El archivo supera el tamaño máximo de 250 MB.',
        }
      : {
          estado: 400,
          codigo: 'ARCHIVO_INVALIDO',
          detalle: 'La solicitud debe traer un solo archivo en el campo «archivo».',
        };
  }
  if (error.type === 'entity.parse.failed') {
    return {
      estado: 400,
      codigo: 'JSON_INVALIDO',
      detalle: 'El cuerpo de la solicitud no es un JSON válido.',
    };
  }
  if (error.type === 'entity.too.large') {
    return {
      estado: 413,
      codigo: 'CUERPO_DEMASIADO_GRANDE',
      detalle: 'El cuerpo de la solicitud supera el tamaño permitido.',
    };
  }
  if (CODIGOS_SIN_CONEXION.has(error.code) || MENSAJES_SIN_CONEXION.test(error.message ?? '')) {
    return {
      estado: 503,
      codigo: 'BASE_DE_DATOS_NO_DISPONIBLE',
      detalle: 'La base de datos no está disponible en este momento.',
    };
  }
  return {
    estado: 500,
    codigo: 'ERROR_INTERNO',
    detalle: 'Ocurrió un error inesperado. Ya quedó registrado.',
  };
}

export function rutaApiInexistente(solicitud) {
  throw noEncontrado(`No existe la ruta ${solicitud.method} ${solicitud.originalUrl}.`);
}

export function crearManejadorDeErrores({ registro, alFallar = () => {} }) {
  return (error, solicitud, respuesta, siguiente) => {
    if (respuesta.headersSent) {
      siguiente(error);
      return;
    }
    const problema = clasificar(error);
    if (problema.estado >= 500) {
      registro.error({ err: error, ruta: solicitud.originalUrl }, 'Error al atender la solicitud');
      alFallar({
        ruta: `${solicitud.method} ${solicitud.path}`,
        estado: problema.estado,
        mensaje: problema.detalle,
      });
    }
    respuesta
      .status(problema.estado)
      .type('application/problem+json')
      .send(JSON.stringify(crearProblema({ ...problema, instancia: solicitud.originalUrl })));
  };
}
