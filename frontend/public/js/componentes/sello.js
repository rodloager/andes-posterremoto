import { crear } from '../nucleo/dom.js';

const EXPLICACIONES_POR_NIVEL = {
  A: 'Cifra leída directamente en la fuente primaria.',
  B: 'Cifra oficial leída en un tercero que cita a la entidad.',
  C: 'Cálculo o estimación que no proviene de una entidad oficial.',
  S: 'Dato generado por el proyecto para demostración. No es una cifra oficial.',
};

const PRESENTACIONES = {
  OFICIAL: { clase: 'sello--oficial', texto: (nivel) => `Oficial · nivel ${nivel}` },
  CALCULADO: { clase: 'sello--oficial', texto: () => 'Cálculo con cifras oficiales' },
  ESTIMADO: { clase: 'sello--estimado', texto: () => 'Estimado' },
  SIMULADO: { clase: 'sello--simulado', texto: () => 'Simulado' },
  SIN_DATO: { clase: 'sello--sin-dato', texto: () => 'Sin dato' },
};

export function crearSello(origen, nivel) {
  const presentacion = PRESENTACIONES[origen] ?? PRESENTACIONES.SIN_DATO;
  return crear('span', {
    clase: `sello ${presentacion.clase}`,
    title: EXPLICACIONES_POR_NIVEL[nivel] ?? 'No se localizó una cifra oficial.',
    texto: presentacion.texto(nivel),
  });
}

class Sello extends HTMLElement {
  connectedCallback() {
    this.replaceChildren(crearSello(this.getAttribute('origen'), this.getAttribute('nivel')));
  }
}

customElements.define('andes-sello', Sello);
