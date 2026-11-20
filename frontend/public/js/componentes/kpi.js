import { crear, enlaceExterno } from '../nucleo/dom.js';
import {
  ESTADO_KPI_DISPONIBLE,
  ORIGEN_KPI_SIMULADO,
  describirComponentes,
  describirFechaDeFuente,
  describirVariacion,
  formatearKpi,
  fuentesDelKpi,
} from '../nucleo/kpi.js';
import { crearSello } from './sello.js';

function sello({ origen, estado }) {
  if (origen === ORIGEN_KPI_SIMULADO) {
    return crearSello('SIMULADO', 'S');
  }
  return estado === ESTADO_KPI_DISPONIBLE ? crearSello('CALCULADO', 'C') : crearSello('SIN_DATO');
}

function cabecera(modelo) {
  return crear(
    'div',
    { clase: 'indicador-cabecera' },
    crear('h3', { clase: 'indicador-nombre', texto: modelo.nombre }),
    sello(modelo),
  );
}

function lineaDeValor(modelo) {
  const { cifra, unidad } = formatearKpi(modelo);
  return crear(
    'p',
    { clase: 'indicador-valor' },
    crear('span', { clase: 'cifra', texto: cifra }),
    unidad ? ' ' : null,
    unidad ? crear('span', { clase: 'indicador-unidad', texto: unidad }) : null,
  );
}

function lineaDeVariacion(modelo) {
  const variacion = describirVariacion(modelo);
  if (!variacion) {
    return null;
  }
  return crear(
    'p',
    { clase: 'indicador-variacion cifra' },
    variacion.texto,
    variacion.etiqueta
      ? crear('span', {
          clase: `kpi-valoracion kpi-valoracion--${variacion.valoracion}`,
          texto: variacion.etiqueta,
        })
      : null,
  );
}

function pieOficial(modelo, buscarFuente) {
  const fuentes = fuentesDelKpi(modelo, buscarFuente).flatMap((fuente, posicion, todas) => {
    const nombre = fuente.enlace
      ? enlaceExterno(fuente.nombre, fuente.enlace, fuente.entidad)
      : fuente.nombre;
    const fecha = describirFechaDeFuente(fuente);
    const separador = posicion === 0 ? '' : posicion === todas.length - 1 ? ' y ' : ', ';
    return [separador, nombre, fecha ? `, ${fecha}` : ''];
  });
  return crear('p', { clase: 'indicador-pie' }, 'Calculado por ANDES con cifras de ', ...fuentes, '.');
}

function pieSimulado() {
  return crear('p', {
    clase: 'indicador-pie',
    texto: 'Calculado con los registros simulados de la base · No es una cifra oficial',
  });
}

function tarjetaDisponible(modelo, buscarFuente) {
  const esSimulado = modelo.origen === ORIGEN_KPI_SIMULADO;
  return crear(
    'article',
    { clase: esSimulado ? 'indicador kpi indicador--simulado' : 'indicador kpi' },
    cabecera(modelo),
    lineaDeValor(modelo),
    crear('p', { clase: 'kpi-componentes cifra', texto: describirComponentes(modelo) }),
    lineaDeVariacion(modelo),
    crear('p', { clase: 'indicador-descripcion', texto: modelo.descripcion }),
    esSimulado ? pieSimulado() : pieOficial(modelo, buscarFuente),
  );
}

function tarjetaSinDato(modelo) {
  return crear(
    'article',
    { clase: 'indicador kpi indicador--sin-dato' },
    cabecera(modelo),
    crear('p', { clase: 'indicador-valor', texto: 'Información no disponible' }),
    crear('p', { clase: 'indicador-descripcion', texto: modelo.motivoSinDato }),
    crear('p', { clase: 'indicador-descripcion', texto: modelo.descripcion }),
  );
}

class IndicadorClave extends HTMLElement {
  mostrar(modelo, { buscarFuente = () => null } = {}) {
    this.replaceChildren(
      modelo.estado === ESTADO_KPI_DISPONIBLE
        ? tarjetaDisponible(modelo, buscarFuente)
        : tarjetaSinDato(modelo),
    );
  }
}

customElements.define('andes-kpi', IndicadorClave);

export function crearIndicadorClave(modelo, opciones) {
  const elemento = document.createElement('andes-kpi');
  elemento.mostrar(modelo, opciones);
  return elemento;
}

export function rejillaDeKpi(lista, opciones) {
  return crear(
    'div',
    { clase: 'rejilla-indicadores rejilla-kpi' },
    lista.map((modelo) => crearIndicadorClave(modelo, opciones)),
  );
}
