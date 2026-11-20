import { ColaCircular } from './estructuras/colaCircular.js';
import { limiteInferior, limiteSuperior } from './busqueda.js';

export const FECHA_DEL_SISMO = '2026-08-10';
export const TENDENCIAS = Object.freeze({
  creciente: 'CRECIENTE',
  estable: 'ESTABLE',
  decreciente: 'DECRECIENTE',
  insuficiente: 'INSUFICIENTE',
});
export const MARCAS = Object.freeze({ revision: 'REVISION_A_LA_BAJA', anomalia: 'ANOMALIA' });

const MS_POR_DIA = 86_400_000;
const FECHA_ISO = /^\d{4}-\d{2}-\d{2}$/;
const MINIMO_PARA_ANOMALIAS = 4;

function aDia(fecha) {
  const instante = Date.parse(`${fecha}T00:00:00Z`);
  if (
    !FECHA_ISO.test(fecha) ||
    Number.isNaN(instante) ||
    new Date(instante).toISOString().slice(0, 10) !== fecha
  ) {
    throw new RangeError(`Fecha no válida: ${fecha}`);
  }
  return Math.round(instante / MS_POR_DIA);
}

function validarSerie(serie) {
  const dias = serie.map(({ fecha, valor }) => {
    if (typeof valor !== 'number' || !Number.isFinite(valor)) {
      throw new RangeError(`Valor no válido en ${fecha}: ${valor}`);
    }
    return aDia(fecha);
  });
  for (let posicion = 1; posicion < dias.length; posicion += 1) {
    if (dias[posicion] <= dias[posicion - 1]) {
      throw new RangeError('La serie debe estar ordenada por fecha, sin fechas repetidas.');
    }
  }
  return dias;
}

function mediasMoviles(valores, ventana) {
  const cola = new ColaCircular(ventana);
  let suma = 0;
  return valores.map((valor) => {
    if (cola.llena) {
      suma -= cola.desencolar();
    }
    cola.encolar(valor);
    suma += valor;
    return cola.llena ? suma / ventana : null;
  });
}

export function pendienteMinimosCuadrados(equis, yes) {
  const cantidad = equis.length;
  if (cantidad < 2) {
    return null;
  }
  let sumaX = 0;
  let sumaY = 0;
  let sumaXY = 0;
  let sumaXX = 0;
  for (let posicion = 0; posicion < cantidad; posicion += 1) {
    sumaX += equis[posicion];
    sumaY += yes[posicion];
    sumaXY += equis[posicion] * yes[posicion];
    sumaXX += equis[posicion] * equis[posicion];
  }
  const denominador = cantidad * sumaXX - sumaX * sumaX;
  return denominador === 0 ? null : (cantidad * sumaXY - sumaX * sumaY) / denominador;
}

function clasificar(pendiente, valores, umbral) {
  if (pendiente === null) {
    return TENDENCIAS.insuficiente;
  }
  const media = valores.reduce((total, valor) => total + valor, 0) / valores.length;
  const relativa = media === 0 ? pendiente : pendiente / Math.abs(media);
  if (Math.abs(relativa) < umbral) {
    return TENDENCIAS.estable;
  }
  return pendiente > 0 ? TENDENCIAS.creciente : TENDENCIAS.decreciente;
}

function leer(tendencia, masEsMejor) {
  if (masEsMejor === null || tendencia === TENDENCIAS.insuficiente) {
    return null;
  }
  if (tendencia === TENDENCIAS.estable) {
    return 'ESTANCADO';
  }
  return (tendencia === TENDENCIAS.creciente) === masEsMejor ? 'MEJORA' : 'EMPEORA';
}

function marcarAnomalias(cortes, umbralAnomalia) {
  const ritmos = cortes.map(({ ritmoDiario }) => ritmoDiario).filter((ritmo) => ritmo !== null);
  if (ritmos.length < MINIMO_PARA_ANOMALIAS) {
    return;
  }
  const media = ritmos.reduce((total, ritmo) => total + ritmo, 0) / ritmos.length;
  const desviacion = Math.sqrt(
    ritmos.reduce((total, ritmo) => total + (ritmo - media) ** 2, 0) / ritmos.length,
  );
  if (desviacion === 0) {
    return;
  }
  for (const corte of cortes) {
    if (corte.ritmoDiario !== null && Math.abs(corte.ritmoDiario - media) > umbralAnomalia * desviacion) {
      corte.marcas.push(MARCAS.anomalia);
    }
  }
}

export function analizarTendencia(
  serie,
  {
    esAcumulado = false,
    ventana = 3,
    umbral = 0.005,
    fechaBase = FECHA_DEL_SISMO,
    masEsMejor = null,
    umbralAnomalia = 2,
  } = {},
) {
  if (!Number.isInteger(ventana) || ventana < 1) {
    throw new RangeError('La ventana debe ser un entero positivo.');
  }
  const dias = validarSerie(serie);
  const base = aDia(fechaBase);
  const valores = serie.map(({ valor }) => valor);
  const medias = mediasMoviles(valores, ventana);
  const cortes = serie.map(({ fecha, valor }, posicion) => {
    if (posicion === 0) {
      return {
        fecha,
        valor,
        dias: null,
        delta: null,
        ritmoDiario: null,
        variacion: null,
        mediaMovil: medias[0],
        marcas: [],
      };
    }
    const anterior = valores[posicion - 1];
    const transcurridos = dias[posicion] - dias[posicion - 1];
    const delta = valor - anterior;
    const marcas = esAcumulado && delta < 0 ? [MARCAS.revision] : [];
    return {
      fecha,
      valor,
      dias: transcurridos,
      delta,
      ritmoDiario: delta / transcurridos,
      variacion: anterior === 0 ? null : delta / anterior,
      mediaMovil: medias[posicion],
      marcas,
    };
  });
  marcarAnomalias(cortes, umbralAnomalia);
  const pendiente = pendienteMinimosCuadrados(
    dias.map((dia) => dia - base),
    valores,
  );
  const tendencia = clasificar(pendiente, valores, umbral);
  return { cortes, pendiente, tendencia, lectura: leer(tendencia, masEsMejor), ventana };
}

export function crearSumasPrefijas(serie) {
  validarSerie(serie);
  const fechas = serie.map(({ fecha }) => fecha);
  const prefijo = new Float64Array(serie.length + 1);
  serie.forEach(({ valor }, posicion) => {
    prefijo[posicion + 1] = prefijo[posicion] + valor;
  });
  return {
    totalEntre(desde, hasta) {
      const inicio = limiteInferior(fechas, desde);
      const fin = limiteSuperior(fechas, hasta);
      return fin <= inicio ? 0 : prefijo[fin] - prefijo[inicio];
    },
    totalEntrePosiciones(inicio, fin) {
      return prefijo[fin] - prefijo[inicio];
    },
  };
}
