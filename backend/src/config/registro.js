import pino from 'pino';
import pinoHttp from 'pino-http';

function nivelPara({ pruebas, produccion }) {
  if (pruebas) {
    return 'silent';
  }
  return produccion ? 'info' : 'debug';
}

function nivelDeRespuesta(solicitud, respuesta, error) {
  if (error || respuesta.statusCode >= 500) {
    return 'error';
  }
  return respuesta.statusCode >= 400 ? 'warn' : 'info';
}

export function crearRegistro(configuracion) {
  return pino({ level: nivelPara(configuracion), base: { servicio: 'andes' } });
}

export function registrarSolicitudesHttp(registro) {
  return pinoHttp({
    logger: registro,
    autoLogging: { ignore: (solicitud) => !solicitud.url.startsWith('/api/') },
    customLogLevel: nivelDeRespuesta,
    serializers: {
      req: (solicitud) => ({ metodo: solicitud.method, url: solicitud.url }),
      res: (respuesta) => ({ estado: respuesta.statusCode }),
    },
  });
}
