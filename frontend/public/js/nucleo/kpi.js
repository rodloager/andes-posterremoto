import { formatearDecimal, formatearFecha, formatearPorcentaje, formatearValor } from './formato.js';
import { nombreCorto } from './indicadores.js';

export const ESTADO_KPI_DISPONIBLE = 'disponible';
export const ORIGEN_KPI_OFICIAL = 'OFICIAL';
export const ORIGEN_KPI_SIMULADO = 'SIMULADO';

const PRESENTACION_POR_UNIDAD = Object.freeze({
  porcentaje: {
    cifra: (valor) => formatearPorcentaje(valor),
    unidad: '',
    diferencia: (valor) =>
      `${formatearDecimal(valor)} ${valor === 1 ? 'punto porcentual' : 'puntos porcentuales'}`,
  },
  por_cien_mil: {
    cifra: (valor) => formatearDecimal(valor),
    unidad: 'por cada 100 mil',
    diferencia: (valor) => `${formatearDecimal(valor)} por cada 100 mil`,
  },
});

const VALORACIONES = Object.freeze({
  mejora: 'Mejora',
  empeora: 'Empeora',
  sin_cambio: 'Sin cambio',
});

const conCalificador = (calificador, texto) => (calificador ? `${calificador} ${texto}` : texto);

function presentacion(unidad) {
  const encontrada = PRESENTACION_POR_UNIDAD[unidad];
  if (!encontrada) {
    throw new Error(`Unidad de indicador clave desconocida: ${unidad}`);
  }
  return encontrada;
}

export function separarKpi(lista) {
  return {
    oficiales: lista.filter(({ origen }) => origen === ORIGEN_KPI_OFICIAL),
    simulados: lista.filter(({ origen }) => origen === ORIGEN_KPI_SIMULADO),
  };
}

export function formatearKpi({ valor, unidad, calificador }) {
  const { cifra, unidad: texto } = presentacion(unidad);
  return { cifra: conCalificador(calificador, cifra(valor)), unidad: texto };
}

export function describirVariacion({ variacion, unidad }) {
  if (!variacion) {
    return null;
  }
  const { absoluta, corteAnterior, valoracion } = variacion;
  const signo = absoluta > 0 ? '+' : absoluta < 0 ? '−' : '';
  return {
    texto: `${signo}${presentacion(unidad).diferencia(Math.abs(absoluta))} frente al corte del ${formatearFecha(corteAnterior)}`,
    valoracion: valoracion ?? null,
    etiqueta: VALORACIONES[valoracion] ?? null,
  };
}

function describirParte({ valor, unidad, calificador }) {
  const { texto, unidad: sufijo } = formatearValor(valor, unidad);
  return conCalificador(calificador, sufijo ? `${texto} ${sufijo}` : texto);
}

export function describirComponentes({ numerador, denominador }) {
  return `${describirParte(numerador)} sobre ${describirParte(denominador)}`;
}

export function fuentesDelKpi({ numerador, denominador }, buscarFuente) {
  const vistas = new Map();
  for (const parte of [numerador, denominador]) {
    if (parte.fuente && !vistas.has(parte.fuente)) {
      const fuente = buscarFuente(parte.fuente);
      vistas.set(parte.fuente, {
        id: parte.fuente,
        nombre: fuente ? nombreCorto(fuente) : parte.fuente,
        enlace: fuente?.enlace ?? null,
        entidad: fuente?.entidad ?? null,
        fechaCorte: parte.fechaCorte,
        territorial: parte.tipo === 'territorial',
      });
    }
  }
  return [...vistas.values()];
}

export function describirFechaDeFuente({ fechaCorte, territorial }) {
  if (!fechaCorte) {
    return '';
  }
  return territorial
    ? `reportes hasta el ${formatearFecha(fechaCorte)}`
    : `corte del ${formatearFecha(fechaCorte)}`;
}
