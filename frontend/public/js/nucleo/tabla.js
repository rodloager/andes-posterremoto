import { crear } from './dom.js';

function celda(etiqueta, contenido, columna) {
  const atributos = { clase: columna?.numerica ? 'numero' : null };
  if (etiqueta === 'th') {
    atributos.scope = 'col';
  }
  return contenido instanceof Node
    ? crear(etiqueta, atributos, contenido)
    : crear(etiqueta, { ...atributos, texto: contenido });
}

function fila(valores, columnas) {
  const [primera, ...resto] = valores;
  const encabezado = crear('th', { scope: 'row' });
  encabezado.append(primera instanceof Node ? primera : String(primera));
  return crear(
    'tr',
    {},
    encabezado,
    resto.map((valor, posicion) => celda('td', valor, columnas[posicion + 1])),
  );
}

export function crearTabla({ titulo, columnas, filas }) {
  return crear(
    'div',
    { clase: 'tabla-desplazable', tabindex: '0', role: 'region', 'aria-label': titulo },
    crear(
      'table',
      { clase: 'tabla-datos' },
      titulo ? crear('caption', { texto: titulo }) : null,
      crear(
        'thead',
        {},
        crear(
          'tr',
          {},
          columnas.map((columna) => celda('th', columna.nombre, columna)),
        ),
      ),
      crear(
        'tbody',
        {},
        filas.map((valores) => fila(valores, columnas)),
      ),
    ),
  );
}
