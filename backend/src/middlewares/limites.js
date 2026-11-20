import { rateLimit } from 'express-rate-limit';
import { ErrorHttp } from '../utils/errores.js';

export const LIMITES_POR_DEFECTO = Object.freeze({
  api: Object.freeze({ ventanaMs: 60_000, maximo: 300 }),
  sesion: Object.freeze({ ventanaMs: 15 * 60_000, maximo: 10 }),
});

function crearLimitador({ ventanaMs, maximo }, { soloFallidas, codigo, detalle }) {
  return rateLimit({
    windowMs: ventanaMs,
    limit: maximo,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skipSuccessfulRequests: soloFallidas,
    handler: (solicitud, respuesta, siguiente) => siguiente(new ErrorHttp(429, codigo, detalle)),
  });
}

export function limitarSolicitudes(limite) {
  return crearLimitador(limite, {
    soloFallidas: false,
    codigo: 'DEMASIADAS_SOLICITUDES',
    detalle: 'Se superó el número de solicitudes permitidas por minuto. Intenta de nuevo en un momento.',
  });
}

export function limitarIntentosDeSesion(limite) {
  return crearLimitador(limite, {
    soloFallidas: true,
    codigo: 'DEMASIADOS_INTENTOS',
    detalle: 'Hubo demasiados intentos fallidos de inicio de sesión. Espera unos minutos.',
  });
}
