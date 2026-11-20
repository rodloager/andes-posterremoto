import * as L from '/vendor/leaflet/leaflet-src.esm.js';
import { tema } from '../graficas/tema.js';
import { calcularCortes, clasificar, describirRangos } from '../nucleo/clasificacion.js';
import { crear } from '../nucleo/dom.js';
import { formatearCantidad, formatearNumero } from '../nucleo/formato.js';

export const ENCUADRE_COMPLETO = 'completo';
export const ENCUADRE_CON_REPORTE = 'con-reporte';

const CLASES = 5;
const CENTRO_DE_COLOMBIA = [4.6, -74.1];
const ACERCAMIENTO_INICIAL = 5;
const MARGEN_DE_ENCUADRE = [12, 12];
const ATRIBUCION = 'Límites: DANE, Marco Geoestadístico Nacional 2025';
const ESTILO_BASE = { weight: 0.8, color: '#ffffff', fillOpacity: 1 };
const ESTILO_RESALTADO = { weight: 2.5, color: tema.oscuro };

function filaDeLeyenda(color, texto) {
  return crear(
    'div',
    { clase: 'mapa-leyenda-fila' },
    crear('span', { clase: 'mapa-leyenda-color', style: `background:${color}` }),
    crear('span', { texto }),
  );
}

function crearLeyenda({ titulo, rangos, colores }) {
  const control = L.control({ position: 'bottomleft' });
  control.onAdd = () =>
    crear(
      'div',
      { clase: 'mapa-leyenda' },
      crear('p', { clase: 'mapa-leyenda-titulo', texto: titulo }),
      rangos.map((rango, posicion) => filaDeLeyenda(colores[posicion], rango)),
      filaDeLeyenda(tema.escalaSinDato, 'Cero o sin dato'),
    );
  return control;
}

function anilloPrincipal(capa) {
  const coordenadas = capa.getLatLngs();
  const tieneVariasPartes = Array.isArray(coordenadas[0][0]);
  const partes = tieneVariasPartes ? coordenadas : [coordenadas];
  return partes
    .map((parte) => parte[0])
    .reduce((mayor, anillo) => (anillo.length > mayor.length ? anillo : mayor));
}

function limitesDe(poligonos, valores, encuadre) {
  const capas = poligonos.getLayers();
  const conReporte = capas.filter((capa) => valores.get(capa.feature.properties.codigo) > 0);
  const usarReporte = encuadre === ENCUADRE_CON_REPORTE && conReporte.length > 0;
  return L.latLngBounds((usarReporte ? conReporte : capas).flatMap(anilloPrincipal));
}

function crearEpicentro({ latitud, longitud, etiqueta }) {
  return L.circleMarker([latitud, longitud], {
    radius: 6,
    weight: 2,
    color: tema.fondo,
    fillColor: tema.alerta,
    fillOpacity: 1,
  }).bindTooltip(etiqueta);
}

class Mapa extends HTMLElement {
  #mapa = null;
  #capas = [];
  #configuracion = null;

  connectedCallback() {
    if (this.#mapa) {
      return;
    }
    const lienzo = crear('div', { clase: 'mapa-lienzo' });
    this.replaceChildren(lienzo);
    this.#mapa = L.map(lienzo, { zoomSnap: 0.25, scrollWheelZoom: false });
    this.#mapa.setView(CENTRO_DE_COLOMBIA, ACERCAMIENTO_INICIAL);
    this.#mapa.attributionControl.setPrefix(false);
    this.#mapa.attributionControl.addAttribution(ATRIBUCION);
    if (this.#configuracion) {
      this.#dibujar();
    }
  }

  disconnectedCallback() {
    this.#mapa?.remove();
    this.#mapa = null;
    this.#capas = [];
  }

  pintar(configuracion) {
    this.#configuracion = configuracion;
    if (this.#mapa) {
      this.#dibujar();
    }
  }

  #dibujar() {
    const { entidades, valores, titulo, seleccionado, encuadrar, epicentro, alSeleccionar } =
      this.#configuracion;
    const conDato = [...valores.values()].filter((valor) => valor > 0);
    const cortes = calcularCortes(conDato, CLASES);
    const colores = tema.escala.slice(tema.escala.length - cortes.length - 1);
    const colorDe = (codigo) => {
      const valor = valores.get(codigo);
      return valor > 0 ? colores[clasificar(valor, cortes)] : tema.escalaSinDato;
    };

    this.#capas.forEach((capa) => capa.remove());
    const poligonos = L.geoJSON(entidades, {
      style: ({ properties }) => ({
        ...ESTILO_BASE,
        fillColor: colorDe(properties.codigo),
        ...(properties.codigo === seleccionado ? ESTILO_RESALTADO : {}),
      }),
      onEachFeature: ({ properties }, capa) => {
        const texto = formatearCantidad(valores.get(properties.codigo));
        capa.bindTooltip(`${properties.nombre}: ${texto}`, { sticky: true });
        capa.on('click', () => alSeleccionar?.(properties.codigo));
        capa.on('mouseover', () => capa.setStyle(ESTILO_RESALTADO));
        capa.on('mouseout', () => poligonos.resetStyle(capa));
      },
    }).addTo(this.#mapa);
    this.#capas = [poligonos];

    if (conDato.length > 0) {
      const rangos = describirRangos(cortes, Math.min(...conDato), formatearNumero);
      this.#capas.push(crearLeyenda({ titulo, rangos, colores }).addTo(this.#mapa));
    }
    if (epicentro) {
      this.#capas.push(crearEpicentro(epicentro).addTo(this.#mapa));
    }
    if (encuadrar) {
      this.#mapa.fitBounds(limitesDe(poligonos, valores, encuadrar), { padding: MARGEN_DE_ENCUADRE });
    }
  }
}

customElements.define('andes-mapa', Mapa);

export function crearMapa(configuracion) {
  const elemento = document.createElement('andes-mapa');
  elemento.pintar(configuracion);
  return elemento;
}
