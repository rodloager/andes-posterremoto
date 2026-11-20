import { crear } from '/js/nucleo/dom.js';
import { crearTabla } from '/js/nucleo/tabla.js';
import { conParametros, pedir } from './api.js';

export function crearListaPaginada({ titulo, ruta, filtros: iniciales = {}, columnas, aFila, vacio }) {
  const contenedor = crear('div', { clase: 'lista-paginada' });
  const boton = crear('button', {
    type: 'button',
    clase: 'btn btn-sm btn-outline-primary',
    texto: 'Cargar más',
  });
  const filas = [];
  let filtros = iniciales;
  let siguiente = null;

  function pintar() {
    const tabla =
      filas.length > 0
        ? crearTabla({ titulo, columnas, filas })
        : crear('p', { clase: 'estado-carga', texto: vacio });
    boton.hidden = siguiente === null;
    contenedor.replaceChildren(tabla, crear('div', { clase: 'acciones' }, boton));
  }

  async function cargarPagina() {
    boton.disabled = true;
    const pagina = await pedir(conParametros(ruta, { ...filtros, despues: siguiente }));
    filas.push(...pagina.elementos.map(aFila));
    siguiente = pagina.siguiente;
    boton.disabled = false;
    pintar();
  }

  function reiniciar(nuevosFiltros = filtros) {
    filtros = nuevosFiltros;
    filas.length = 0;
    siguiente = null;
    return cargarPagina();
  }

  boton.addEventListener('click', cargarPagina);
  return { elemento: contenedor, cargar: cargarPagina, reiniciar };
}
