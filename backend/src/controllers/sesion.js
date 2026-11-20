import { NOMBRE_COOKIE, ejecutarSobreSesion, opcionesDeCookie } from '../middlewares/sesion.js';
import { comoUsuarioPublico } from '../services/sesion.js';
import { noAutenticado } from '../utils/errores.js';

export function crearControladorSesion(servicio, { produccion }) {
  return {
    async iniciar(solicitud, respuesta) {
      const { correo, clave } = respuesta.locals.validado.body;
      const usuario = await servicio.iniciar({ correo, clave, ip: solicitud.ip });
      await ejecutarSobreSesion(solicitud, 'regenerate');
      solicitud.session.usuarioId = usuario.id;
      await ejecutarSobreSesion(solicitud, 'save');
      respuesta.json({ usuario: comoUsuarioPublico(usuario) });
    },

    actual(solicitud, respuesta) {
      if (!respuesta.locals.usuario) {
        throw noAutenticado();
      }
      respuesta.json({ usuario: comoUsuarioPublico(respuesta.locals.usuario) });
    },

    async cerrar(solicitud, respuesta) {
      if (respuesta.locals.usuario) {
        await servicio.cerrar({ usuario: respuesta.locals.usuario, ip: solicitud.ip });
      }
      if (solicitud.session) {
        await ejecutarSobreSesion(solicitud, 'destroy');
      }
      respuesta.clearCookie(NOMBRE_COOKIE, opcionesDeCookie({ produccion }));
      respuesta.status(204).end();
    },
  };
}
