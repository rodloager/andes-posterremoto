import { marca } from '/js/componentes/marco.js';
import { crear } from '/js/nucleo/dom.js';
import { pedir } from './api.js';
import { paginasPermitidas, sesionActual } from './navegacion.js';

async function cerrarSesion() {
  await pedir('/sesion', { metodo: 'DELETE' }).catch(() => null);
  window.location.assign('/privado/');
}

function identificacion(usuario) {
  const boton = crear('button', {
    type: 'button',
    clase: 'btn btn-sm btn-outline-light',
    texto: 'Cerrar sesión',
  });
  boton.addEventListener('click', cerrarSesion);
  return crear(
    'div',
    { clase: 'privado-usuario' },
    crear(
      'span',
      { clase: 'privado-usuario-nombre' },
      usuario.nombre,
      crear('span', { clase: 'privado-usuario-rol', texto: usuario.nombreRol }),
    ),
    boton,
  );
}

function navegacion(usuario, paginaActual) {
  const enlaces = paginasPermitidas(usuario).map(({ id, nombre, ruta }) =>
    crear(
      'li',
      {},
      crear('a', { href: ruta, 'aria-current': id === paginaActual ? 'page' : null, texto: nombre }),
    ),
  );
  return crear(
    'nav',
    { clase: 'marco-navegacion privado-navegacion', 'aria-label': 'Secciones del entorno privado' },
    crear(
      'ul',
      { clase: 'marco-navegacion-lista' },
      enlaces,
      crear('li', { clase: 'marco-navegacion-separador', role: 'presentation' }),
      crear('li', {}, crear('a', { href: '/', texto: 'Volver al portal público' })),
    ),
  );
}

function contenidoPrincipal(contenido) {
  return crear(
    'main',
    { clase: 'marco-contenido', id: 'contenido-principal', tabindex: '-1' },
    crear('div', { clase: 'marco-contenido-interior' }, contenido),
  );
}

class MarcoPrivado extends HTMLElement {
  async connectedCallback() {
    if (this.dataset.listo) {
      return;
    }
    this.dataset.listo = 'true';
    const contenido = [...this.childNodes];
    const pagina = this.getAttribute('pagina');
    const cabecera = crear(
      'header',
      { clase: 'marco-cabecera privado-cabecera' },
      marca('/privado/'),
      crear('span', { clase: 'privado-etiqueta', texto: 'Entorno privado' }),
    );
    const principal = contenidoPrincipal(contenido);
    this.append(
      crear('a', { clase: 'salto-contenido', href: '#contenido-principal', texto: 'Saltar al contenido' }),
      cabecera,
      principal,
    );
    if (!pagina) {
      return;
    }
    const usuario = await sesionActual().catch(() => null);
    if (!usuario) {
      return;
    }
    cabecera.append(identificacion(usuario));
    const cuerpo = crear('div', { clase: 'marco-cuerpo privado-cuerpo' }, navegacion(usuario, pagina));
    principal.before(cuerpo);
    cuerpo.append(principal);
  }
}

customElements.define('andes-marco-privado', MarcoPrivado);
