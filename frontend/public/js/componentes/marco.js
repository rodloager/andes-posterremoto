import { crear } from '../nucleo/dom.js';
import { MODO_DEMOSTRACION, MODO_OFICIAL, guardarModo, leerModo } from '../nucleo/modo.js';

const ESPACIO_SVG = 'http://www.w3.org/2000/svg';
const TRAZO_MARCA = 'M2 13h4l2-7 3 13 3-17 3 15 2-4h3';
const TRAZO_MENU = 'M3 6h18M3 12h18M3 18h18';

const PAGINAS = [
  { id: 'inicio', nombre: 'Inicio', ruta: '/' },
  { id: 'poblacion', nombre: 'Población', ruta: '/poblacion' },
  { id: 'vivienda', nombre: 'Vivienda', ruta: '/vivienda' },
  { id: 'economia', nombre: 'Economía', ruta: '/economia' },
  { id: 'infraestructura', nombre: 'Infraestructura', ruta: '/infraestructura' },
  { id: 'salud', nombre: 'Salud', ruta: '/salud' },
  { id: 'educacion', nombre: 'Educación', ruta: '/educacion' },
  { id: 'logistica', nombre: 'Logística', ruta: '/logistica' },
  { id: 'mapa', nombre: 'Mapa', ruta: '/mapa' },
  { id: 'comparar', nombre: 'Comparar', ruta: '/comparar' },
  { id: 'fuentes', nombre: 'Metodología y fuentes', ruta: '/fuentes' },
];

const MODOS = [
  { valor: MODO_OFICIAL, nombre: 'Datos oficiales' },
  { valor: MODO_DEMOSTRACION, nombre: 'Demostración' },
];

export function icono(trazo, tamano = 24) {
  const svg = document.createElementNS(ESPACIO_SVG, 'svg');
  const atributos = {
    viewBox: '0 0 24 24',
    width: tamano,
    height: tamano,
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': 2,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'aria-hidden': 'true',
  };
  for (const [nombre, valor] of Object.entries(atributos)) {
    svg.setAttribute(nombre, valor);
  }
  const camino = document.createElementNS(ESPACIO_SVG, 'path');
  camino.setAttribute('d', trazo);
  svg.append(camino);
  return svg;
}

export function marca(destino) {
  return crear(
    'a',
    { clase: 'marco-marca', href: destino },
    icono(TRAZO_MARCA, 26),
    crear('span', { clase: 'marco-marca-nombre', texto: 'ANDES' }),
    crear('span', {
      clase: 'marco-marca-lema',
      texto: 'Analítica Nacional de Datos para Emergencias Sísmicas',
    }),
  );
}

function botonDeMenu() {
  return crear(
    'button',
    {
      clase: 'marco-menu d-lg-none',
      type: 'button',
      'data-bs-toggle': 'offcanvas',
      'data-bs-target': '#navegacion',
      'aria-controls': 'navegacion',
      'aria-label': 'Abrir el menú de secciones',
    },
    icono(TRAZO_MENU),
  );
}

function opcionDeModo({ valor, nombre }, modoActual) {
  const identificador = `modo-${valor}`;
  const entrada = crear('input', {
    type: 'radio',
    clase: 'btn-check',
    name: 'modo',
    id: identificador,
    value: valor,
    checked: valor === modoActual,
  });
  entrada.addEventListener('change', () => {
    guardarModo(valor);
    window.location.reload();
  });
  return [
    entrada,
    crear('label', { clase: 'btn btn-sm btn-outline-primary', for: identificador, texto: nombre }),
  ];
}

function selectorDeModo(modoActual) {
  return crear(
    'fieldset',
    { clase: 'selector-modo' },
    crear('legend', { clase: 'visually-hidden', texto: 'Modo de datos' }),
    crear('span', { clase: 'selector-modo-titulo', 'aria-hidden': 'true', texto: 'Modo de datos' }),
    crear(
      'div',
      { clase: 'btn-group', role: 'group', 'aria-label': 'Modo de datos' },
      MODOS.flatMap((modo) => opcionDeModo(modo, modoActual)),
    ),
  );
}

function barraDeContexto(modoActual) {
  return crear(
    'div',
    { clase: 'marco-contexto' },
    crear(
      'p',
      { clase: 'marco-evento' },
      'Sismo del 10 de agosto de 2026 ',
      crear('span', { texto: '· magnitud 7,4 · San José del Palmar, Chocó' }),
    ),
    selectorDeModo(modoActual),
  );
}

function avisoDeDemostracion() {
  return crear(
    'p',
    { clase: 'aviso-demostracion', role: 'status' },
    crear('strong', { texto: 'Modo de demostración. ' }),
    'Lo que lleva el sello SIMULADO lo generó el proyecto para mostrar el diseño. No son cifras oficiales.',
  );
}

function navegacion(paginaActual) {
  const enlaces = PAGINAS.map(({ id, nombre, ruta }) =>
    crear(
      'li',
      {},
      crear('a', { href: ruta, 'aria-current': id === paginaActual ? 'page' : null, texto: nombre }),
    ),
  );
  return crear(
    'nav',
    {
      clase: 'offcanvas-lg offcanvas-start marco-navegacion',
      id: 'navegacion',
      tabindex: '-1',
      'aria-label': 'Secciones del portal',
    },
    crear(
      'div',
      { clase: 'offcanvas-header d-lg-none' },
      crear('p', { clase: 'offcanvas-title fw-bold mb-0', texto: 'Secciones' }),
      crear('button', {
        type: 'button',
        clase: 'btn-close',
        'data-bs-dismiss': 'offcanvas',
        'data-bs-target': '#navegacion',
        'aria-label': 'Cerrar el menú',
      }),
    ),
    crear('ul', { clase: 'marco-navegacion-lista' }, enlaces),
  );
}

function pie() {
  return crear(
    'footer',
    { clase: 'marco-pie' },
    crear('p', {
      texto:
        'ANDES es un proyecto académico de la asignatura Análisis de Algoritmos. No es un sistema oficial ni reemplaza los canales de la Unidad Nacional para la Gestión del Riesgo de Desastres.',
    }),
    crear(
      'p',
      {},
      crear('a', { href: '/fuentes', texto: 'Metodología y fuentes' }),
      ' · ',
      crear('a', { href: '/privado/', texto: 'Acceso para personal autorizado' }),
    ),
  );
}

class Marco extends HTMLElement {
  connectedCallback() {
    if (this.dataset.listo) {
      return;
    }
    this.dataset.listo = 'true';
    const contenido = [...this.childNodes];
    const modoActual = leerModo();
    const partes = [
      crear('a', { clase: 'salto-contenido', href: '#contenido-principal', texto: 'Saltar al contenido' }),
      crear('header', { clase: 'marco-cabecera' }, botonDeMenu(), marca('/')),
      barraDeContexto(modoActual),
      modoActual === MODO_DEMOSTRACION ? avisoDeDemostracion() : null,
      crear(
        'div',
        { clase: 'marco-cuerpo' },
        navegacion(this.getAttribute('pagina')),
        crear(
          'main',
          { clase: 'marco-contenido', id: 'contenido-principal', tabindex: '-1' },
          crear('div', { clase: 'marco-contenido-interior' }, contenido),
        ),
      ),
      pie(),
    ];
    this.append(...partes.filter(Boolean));
  }
}

customElements.define('andes-marco', Marco);
