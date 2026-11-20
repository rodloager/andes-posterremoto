import { crear, enlaceExterno } from '../nucleo/dom.js';
import { formatearConSigno, formatearFecha, formatearPorcentaje, formatearValor } from '../nucleo/formato.js';
import { ESTADO_SIN_DATO, ORIGEN_SIMULADO, nombreCorto } from '../nucleo/indicadores.js';
import { crearSello } from './sello.js';

function lineaDeValor(modelo) {
  const { texto, unidad } = formatearValor(modelo.valor, modelo.unidad);
  const cifra = modelo.calificador ? `${modelo.calificador} ${texto}` : texto;
  return crear(
    'p',
    { clase: 'indicador-valor' },
    crear('span', { clase: 'cifra', texto: cifra }),
    unidad ? ' ' : null,
    unidad ? crear('span', { clase: 'indicador-unidad', texto: unidad }) : null,
  );
}

function lineaDeVariacion({ variacion, unidad }) {
  if (!variacion) {
    return null;
  }
  const absoluta = formatearConSigno(variacion.absoluta, unidad);
  const signo = variacion.relativa >= 0 ? '+' : '−';
  const relativa =
    variacion.relativa === null ? '' : ` (${signo}${formatearPorcentaje(Math.abs(variacion.relativa))})`;
  const texto = `${absoluta}${relativa} frente al corte del ${formatearFecha(variacion.corteAnterior)}`;
  return crear('p', { clase: 'indicador-variacion cifra', texto });
}

function nombreDeLaFuente(fuente) {
  const nombre = nombreCorto(fuente);
  const entidad = fuente.enlace ? enlaceExterno(nombre, fuente.enlace, fuente.entidad) : nombre;
  return fuente.leidoEn ? [entidad, `, leído en ${fuente.leidoEn}`] : [entidad];
}

function pieOficial(modelo) {
  return crear(
    'p',
    { clase: 'indicador-pie' },
    'Fuente: ',
    ...nombreDeLaFuente(modelo.fuente),
    ` · Corte: ${formatearFecha(modelo.fechaCorte)}`,
  );
}

function pieSimulado(modelo) {
  return crear('p', { clase: 'indicador-pie', texto: `${modelo.muestra} · No es una cifra oficial` });
}

function tarjetaDisponible(modelo, principal) {
  const esSimulado = modelo.origen === ORIGEN_SIMULADO;
  const clases = ['indicador', principal && 'indicador--principal', esSimulado && 'indicador--simulado'];
  return crear(
    'article',
    { clase: clases.filter(Boolean).join(' ') },
    crear(
      'div',
      { clase: 'indicador-cabecera' },
      crear('h3', { clase: 'indicador-nombre', texto: modelo.nombre }),
      crearSello(modelo.origen, modelo.nivel),
    ),
    lineaDeValor(modelo),
    lineaDeVariacion(modelo),
    crear('p', { clase: 'indicador-descripcion', texto: modelo.descripcion }),
    modelo.nota ? crear('p', { clase: 'indicador-nota', texto: modelo.nota }) : null,
    esSimulado ? pieSimulado(modelo) : pieOficial(modelo),
  );
}

function tarjetaSinDato(modelo) {
  return crear(
    'article',
    { clase: 'indicador indicador--sin-dato' },
    crear(
      'div',
      { clase: 'indicador-cabecera' },
      crear('h3', { clase: 'indicador-nombre', texto: modelo.nombre }),
      crearSello('SIN_DATO'),
    ),
    crear('p', { clase: 'indicador-valor', texto: 'Información no disponible' }),
    crear('p', { clase: 'indicador-descripcion', texto: modelo.motivoSinDato }),
  );
}

class Indicador extends HTMLElement {
  mostrar(modelo, { principal = false } = {}) {
    const tarjeta =
      modelo.estado === ESTADO_SIN_DATO ? tarjetaSinDato(modelo) : tarjetaDisponible(modelo, principal);
    this.replaceChildren(tarjeta);
  }
}

customElements.define('andes-indicador', Indicador);

export function crearIndicador(modelo, opciones) {
  const elemento = document.createElement('andes-indicador');
  elemento.mostrar(modelo, opciones);
  return elemento;
}
