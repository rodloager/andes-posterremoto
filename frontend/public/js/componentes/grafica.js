import * as echarts from '/vendor/echarts/echarts.esm.min.js';
import { tema } from '../graficas/tema.js';
import { crear } from '../nucleo/dom.js';
import { crearTabla } from '../nucleo/tabla.js';
import { cabeceraDeFigura, crearFigura, esSimulado } from './figura.js';
import { crearSello } from './sello.js';

const MARCA_DE_AGUA = {
  type: 'text',
  left: 'center',
  top: 'middle',
  rotation: Math.PI / 12,
  silent: true,
  z: 0,
  style: {
    text: 'SIMULADO',
    font: `800 44px ${tema.fuente}`,
    fill: tema.alerta,
    opacity: 0.1,
  },
};

function tablaAlternativa(pregunta, tabla) {
  return crear(
    'details',
    { clase: 'grafica-tabla' },
    crear('summary', { texto: 'Ver los datos en tabla' }),
    crearTabla({ titulo: pregunta, ...tabla }),
  );
}

function figuraSinDato({ pregunta, motivo }) {
  return crear(
    'figure',
    { clase: 'grafica' },
    cabeceraDeFigura({ pregunta }, crearSello('SIN_DATO')),
    crear(
      'div',
      { clase: 'sin-dato' },
      crear('p', { clase: 'sin-dato-titulo', texto: 'Información no disponible' }),
      crear('p', { clase: 'sin-dato-motivo', texto: motivo }),
    ),
  );
}

class Grafica extends HTMLElement {
  #configuracion = null;
  #instancia = null;
  #observador = null;

  mostrar(configuracion) {
    this.#configuracion = configuracion;
    if (this.isConnected) {
      this.#pintar();
    }
  }

  mostrarSinDato(configuracion) {
    this.#liberar();
    this.#configuracion = null;
    this.replaceChildren(figuraSinDato(configuracion));
  }

  connectedCallback() {
    if (this.#configuracion && !this.#instancia) {
      this.#pintar();
    }
  }

  disconnectedCallback() {
    this.#liberar();
  }

  #liberar() {
    this.#observador?.disconnect();
    this.#instancia?.dispose();
    this.#observador = null;
    this.#instancia = null;
  }

  #pintar() {
    const { pregunta, descripcion, opcion, tabla, origen, alto } = this.#configuracion;
    const lienzo = crear('div', {
      clase: alto ? 'grafica-lienzo grafica-lienzo--alto' : 'grafica-lienzo',
      role: 'img',
      'aria-label': `${pregunta} Los mismos datos están en la tabla que sigue.`,
    });
    this.#liberar();
    const figura = crearFigura({ pregunta, descripcion, origen }, lienzo);
    figura.append(tablaAlternativa(pregunta, tabla));
    this.replaceChildren(figura);
    this.#instancia = echarts.init(lienzo, null, { renderer: 'svg' });
    this.#instancia.setOption(esSimulado(origen) ? { ...opcion, graphic: MARCA_DE_AGUA } : opcion);
    this.#observador = new ResizeObserver(() => this.#instancia?.resize());
    this.#observador.observe(lienzo);
  }
}

customElements.define('andes-grafica', Grafica);

export function crearGrafica(configuracion) {
  const elemento = document.createElement('andes-grafica');
  elemento.mostrar(configuracion);
  return elemento;
}

export function crearGraficaSinDato(configuracion) {
  const elemento = document.createElement('andes-grafica');
  elemento.mostrarSinDato(configuracion);
  return elemento;
}
