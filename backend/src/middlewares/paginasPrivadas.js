import { tienePermiso } from './autenticacion.js';

const RECURSOS_LIBRES = /^\/(?:|index(?:\.html)?|css\/\w[\w.-]*\.css|js\/(?:[\w-]+\/)*\w[\w.-]*\.js)$/;

const PERMISO_POR_PAGINA = new Map([
  ['/administracion', 'datos:consultar'],
  ['/calidad', 'datos:consultar'],
  ['/priorizacion', 'priorizacion:usar'],
  ['/ingenieria', 'sistema:ver'],
]);

function normalizar(ruta) {
  try {
    return decodeURIComponent(ruta)
      .toLowerCase()
      .replace(/\/+$/, '')
      .replace(/\.html$/, '');
  } catch {
    return null;
  }
}

export function crearProteccionDePaginas({ paginaProhibida, paginaNoEncontrada }) {
  return (solicitud, respuesta, siguiente) => {
    if (RECURSOS_LIBRES.test(solicitud.path)) {
      siguiente();
      return;
    }
    const pagina = normalizar(solicitud.path);
    const permiso = PERMISO_POR_PAGINA.get(pagina);
    if (!permiso) {
      respuesta.status(404).sendFile(paginaNoEncontrada);
      return;
    }
    const usuario = respuesta.locals.usuario;
    if (!usuario) {
      respuesta.redirect(303, `/privado/?siguiente=${encodeURIComponent(`/privado${pagina}`)}`);
      return;
    }
    if (!tienePermiso(usuario, permiso)) {
      respuesta.status(403).sendFile(paginaProhibida);
      return;
    }
    solicitud.url = `${pagina}.html`;
    siguiente();
  };
}
