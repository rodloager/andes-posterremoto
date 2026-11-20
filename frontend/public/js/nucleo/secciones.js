import { crear } from './dom.js';

export function seccion({ titulo, descripcion, id }, ...hijos) {
  return crear(
    'section',
    { clase: 'seccion', id },
    crear(
      'header',
      { clase: 'seccion-cabecera' },
      crear('h2', { texto: titulo }),
      descripcion ? crear('p', { texto: descripcion }) : null,
    ),
    hijos,
  );
}

export function nota(texto, { alerta = false } = {}) {
  return crear('p', { clase: alerta ? 'nota nota--alerta' : 'nota', texto });
}

export function rejilla(...elementos) {
  return crear('div', { clase: 'rejilla-graficas' }, elementos);
}
