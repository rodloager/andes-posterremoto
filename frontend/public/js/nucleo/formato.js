export const SIN_DATO = 'Sin dato';

const LOCAL = 'es-CO';
const BILLON = 1e12;
const MILLON = 1e6;

const esVacio = (valor) => valor === null || valor === undefined;

const enteros = new Intl.NumberFormat(LOCAL, { maximumFractionDigits: 0 });
const unDecimal = new Intl.NumberFormat(LOCAL, { maximumFractionDigits: 1 });
const dosDecimales = new Intl.NumberFormat(LOCAL, { maximumFractionDigits: 2 });
const fechaLarga = new Intl.DateTimeFormat(LOCAL, { dateStyle: 'long', timeZone: 'UTC' });
const momento = new Intl.DateTimeFormat(LOCAL, {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: 'America/Bogota',
});
const SEGUNDOS_POR_MINUTO = 60;
const SEGUNDOS_POR_HORA = 3600;
const SEGUNDOS_POR_DIA = 86_400;

export function formatearNumero(valor) {
  return enteros.format(valor);
}

export function formatearCantidad(valor) {
  return esVacio(valor) ? SIN_DATO : formatearNumero(valor);
}

export function formatearDecimal(valor) {
  return unDecimal.format(valor);
}

export function formatearPorcentaje(valor) {
  return `${unDecimal.format(valor)} %`;
}

function enGrandesUnidades(valor) {
  const magnitud = Math.abs(valor);
  if (magnitud >= BILLON) {
    const cantidad = dosDecimales.format(valor / BILLON);
    return `${cantidad} ${cantidad === '1' ? 'billón' : 'billones'}`;
  }
  if (magnitud >= MILLON) {
    return `${enteros.format(valor / MILLON)} millones`;
  }
  return enteros.format(valor);
}

export function formatearPesos(valor) {
  return `$${enGrandesUnidades(valor)}`;
}

export function formatearDolares(valor) {
  return `USD ${enGrandesUnidades(valor)}`;
}

export function formatearFecha(fechaIso) {
  const [anio, mes, dia] = fechaIso.split('-');
  return `${dia}/${mes}/${anio}`;
}

export function formatearFechaLarga(fechaIso) {
  return fechaLarga.format(new Date(`${fechaIso}T00:00:00Z`));
}

export function formatearMomento(instante) {
  return esVacio(instante) ? SIN_DATO : momento.format(new Date(instante));
}

export function formatearMilisegundos(valor) {
  return esVacio(valor) ? SIN_DATO : `${unDecimal.format(valor)} ms`;
}

export function formatearDuracion(segundos) {
  if (esVacio(segundos)) {
    return SIN_DATO;
  }
  if (Math.round(segundos * 10) < SEGUNDOS_POR_MINUTO * 10) {
    return `${unDecimal.format(segundos)} s`;
  }
  const total = Math.round(segundos);
  const dias = Math.floor(total / SEGUNDOS_POR_DIA);
  const horas = Math.floor((total % SEGUNDOS_POR_DIA) / SEGUNDOS_POR_HORA);
  const minutos = Math.floor((total % SEGUNDOS_POR_HORA) / SEGUNDOS_POR_MINUTO);
  if (dias > 0) {
    return `${dias} d ${horas} h`;
  }
  return horas > 0 ? `${horas} h ${minutos} min` : `${minutos} min`;
}

const FORMATOS_POR_UNIDAD = {
  COP: (valor) => ({ texto: formatearPesos(valor), unidad: '' }),
  USD: (valor) => ({ texto: formatearDolares(valor), unidad: '' }),
  '%': (valor) => ({ texto: formatearPorcentaje(valor), unidad: '' }),
};

export function formatearValor(valor, unidad) {
  if (esVacio(valor)) {
    return { texto: SIN_DATO, unidad: '' };
  }
  const formato = FORMATOS_POR_UNIDAD[unidad];
  return formato ? formato(valor) : { texto: formatearNumero(valor), unidad };
}

export function formatearConSigno(valor, unidad) {
  const signo = valor > 0 ? '+' : valor < 0 ? '−' : '';
  return `${signo}${formatearValor(Math.abs(valor), unidad).texto}`;
}
