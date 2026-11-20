import { seleccionarMayores } from './mayores.js';

export const AVISO_PRIORIZACION =
  'Modelo analítico de carácter académico; no constituye una decisión oficial de asignación de ayudas.';

export function normalizarPesos(criterios) {
  if (criterios.length === 0) {
    throw new RangeError('Se necesita al menos un criterio.');
  }
  if (new Set(criterios.map(({ codigo }) => codigo)).size !== criterios.length) {
    throw new RangeError('Cada criterio debe tener un código distinto.');
  }
  if (criterios.some(({ peso }) => !Number.isFinite(peso) || peso < 0)) {
    throw new RangeError('Los pesos deben ser números no negativos.');
  }
  const total = criterios.reduce((suma, { peso }) => suma + peso, 0);
  if (total === 0) {
    throw new RangeError('La suma de los pesos debe ser mayor que cero.');
  }
  return criterios.map(({ peso }) => peso / total);
}

const esNumero = (valor) => typeof valor === 'number' && Number.isFinite(valor);

function calcularExtremos(zonas, criterios) {
  return criterios.map(({ codigo }) => {
    let minimo = Infinity;
    let maximo = -Infinity;
    for (const zona of zonas) {
      const valor = zona.valores?.[codigo];
      if (esNumero(valor)) {
        minimo = Math.min(minimo, valor);
        maximo = Math.max(maximo, valor);
      }
    }
    return { minimo, maximo };
  });
}

function escalar(valor, { minimo, maximo }, masEsMejor) {
  if (maximo === minimo) {
    return 0;
  }
  const posicion = (valor - minimo) / (maximo - minimo);
  return masEsMejor ? 1 - posicion : posicion;
}

export function puntuarZonas(zonas, criterios) {
  const pesos = normalizarPesos(criterios);
  const extremos = calcularExtremos(zonas, criterios);
  return zonas.map((zona) => {
    let puntaje = 0;
    const aportes = criterios.map(({ codigo, masEsMejor = false }, posicion) => {
      const valor = zona.valores?.[codigo];
      if (!esNumero(valor)) {
        return {
          criterio: codigo,
          valor: null,
          normalizado: null,
          peso: pesos[posicion],
          aporte: 0,
          sinDato: true,
        };
      }
      const normalizado = escalar(valor, extremos[posicion], masEsMejor);
      const aporte = pesos[posicion] * normalizado;
      puntaje += aporte;
      return { criterio: codigo, valor, normalizado, peso: pesos[posicion], aporte, sinDato: false };
    });
    return { codigo: zona.codigo, nombre: zona.nombre, puntaje, aportes };
  });
}

const porCodigo = (una, otra) => una.codigo.localeCompare(otra.codigo);

export function priorizar(zonas, { criterios, k = 10 }) {
  if (!Number.isInteger(k) || k < 0) {
    throw new RangeError('k debe ser un entero no negativo.');
  }
  const puntuadas = puntuarZonas(zonas, criterios);
  return seleccionarMayores(puntuadas, k, (zona) => zona.puntaje, porCodigo).map((zona, posicion) => ({
    posicion: posicion + 1,
    ...zona,
  }));
}
