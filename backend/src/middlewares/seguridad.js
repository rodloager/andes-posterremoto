import helmet from 'helmet';
import { ErrorHttp } from '../utils/errores.js';

const METODOS_SEGUROS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function cabecerasDeSeguridad({ produccion }) {
  return helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        'font-src': ["'self'"],
        'style-src': ["'self'", "'unsafe-inline'"],
        'img-src': ["'self'", 'data:'],
        'connect-src': ["'self'"],
        'upgrade-insecure-requests': produccion ? [] : null,
      },
    },
    strictTransportSecurity: produccion ? { maxAge: 31_536_000 } : false,
  });
}

export function sinCache(solicitud, respuesta, siguiente) {
  respuesta.set('Cache-Control', 'no-store');
  siguiente();
}

export function revalidarCache(solicitud, respuesta, siguiente) {
  respuesta.set('Cache-Control', 'no-cache');
  siguiente();
}

function esMismoAnfitrion(origen, anfitrion) {
  try {
    return new URL(origen).host === anfitrion;
  } catch {
    return false;
  }
}

export function verificarOrigen(solicitud, respuesta, siguiente) {
  if (METODOS_SEGUROS.has(solicitud.method)) {
    siguiente();
    return;
  }
  const origen = solicitud.get('origin');
  const permitido = origen
    ? esMismoAnfitrion(origen, solicitud.get('host'))
    : solicitud.get('sec-fetch-site') !== 'cross-site';
  if (!permitido) {
    throw new ErrorHttp(403, 'ORIGEN_NO_PERMITIDO', 'La solicitud proviene de otro sitio y fue rechazada.');
  }
  siguiente();
}
