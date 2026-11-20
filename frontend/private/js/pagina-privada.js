import { crear } from '/js/nucleo/dom.js';
import { ErrorDeApi, describirError, irAlAcceso } from './api.js';
import { sesionActual } from './navegacion.js';

function mostrarError(contenedor, error) {
  console.error(error);
  contenedor.replaceChildren(
    crear('p', {
      clase: 'estado-error',
      role: 'alert',
      texto: describirError(error, 'No se pudieron cargar los datos.'),
    }),
  );
}

function irAlAncla() {
  const ancla = decodeURIComponent(window.location.hash.slice(1));
  if (ancla) {
    document.getElementById(ancla)?.scrollIntoView();
  }
}

export async function iniciarPaginaPrivada(construir) {
  const contenedor = document.getElementById('contenido');
  try {
    const usuario = await sesionActual();
    contenedor.replaceChildren(...(await construir(usuario)));
    irAlAncla();
  } catch (error) {
    if (error instanceof ErrorDeApi && error.estado === 401) {
      irAlAcceso();
      return;
    }
    mostrarError(contenedor, error);
  }
}

export function estado(texto, tipo) {
  return crear('span', { clase: `estado estado--${tipo}`, texto });
}
