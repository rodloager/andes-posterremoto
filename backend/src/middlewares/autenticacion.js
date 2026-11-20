import { noAutenticado, sinPermiso } from '../utils/errores.js';
import { ejecutarSobreSesion } from './sesion.js';

export function cargarUsuario(servicioSesion) {
  return async (solicitud, respuesta, siguiente) => {
    const identificador = solicitud.session?.usuarioId;
    if (identificador) {
      const usuario = await servicioSesion.cargar(identificador);
      if (usuario) {
        respuesta.locals.usuario = usuario;
      } else {
        await ejecutarSobreSesion(solicitud, 'destroy');
      }
    }
    siguiente();
  };
}

export function exigirSesion(solicitud, respuesta, siguiente) {
  if (!respuesta.locals.usuario) {
    throw noAutenticado();
  }
  siguiente();
}

export function tienePermiso(usuario, permiso) {
  return Boolean(usuario?.permisos.includes(permiso));
}

export function exigirPermiso(permiso) {
  return (solicitud, respuesta, siguiente) => {
    if (!respuesta.locals.usuario) {
      throw noAutenticado();
    }
    if (!tienePermiso(respuesta.locals.usuario, permiso)) {
      throw sinPermiso();
    }
    siguiente();
  };
}
