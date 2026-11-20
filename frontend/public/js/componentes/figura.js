import { crear, enlaceExterno } from '../nucleo/dom.js';
import { crearSello } from './sello.js';

const ORIGEN_SIMULADO = 'SIMULADO';

export function esSimulado(origen) {
  return origen.tipo === ORIGEN_SIMULADO;
}

export function cabeceraDeFigura({ pregunta, descripcion }, sello) {
  return crear(
    'div',
    { clase: 'grafica-cabecera' },
    crear(
      'div',
      {},
      crear('h3', { clase: 'grafica-pregunta', texto: pregunta }),
      descripcion ? crear('p', { clase: 'grafica-descripcion', texto: descripcion }) : null,
    ),
    sello,
  );
}

export function pieDeFigura({ texto, enlace }) {
  return crear(
    'figcaption',
    { clase: 'grafica-pie' },
    texto,
    enlace ? ' ' : null,
    enlace ? enlaceExterno('Ver la fuente', enlace) : null,
  );
}

export function crearFigura({ pregunta, descripcion, origen }, ...cuerpo) {
  return crear(
    'figure',
    { clase: esSimulado(origen) ? 'grafica grafica--simulado' : 'grafica' },
    cabeceraDeFigura({ pregunta, descripcion }, crearSello(origen.tipo, origen.nivel)),
    cuerpo,
    pieDeFigura(origen),
  );
}
