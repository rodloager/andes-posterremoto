export const NIVELES = Object.freeze({
  municipio: 'MUNICIPIO',
  departamento: 'DEPARTAMENTO',
  nacional: 'NACIONAL',
});
export const CODIGO_NACIONAL = '00';
export const DIMENSION_TOTAL = 'total';
export const CATEGORIA_TOTAL = 'TOTAL';
export const MINIMO_PARA_PUBLICAR = 10;

const SEPARADOR = '\u0000';

const claveDe = (territorio, dimension, categoria) =>
  `${territorio}${SEPARADOR}${dimension}${SEPARADOR}${categoria}`;

function acumular(celdas, territorio, dimension, categoria, cantidad, suma) {
  const clave = claveDe(territorio, dimension, categoria);
  const celda = celdas.get(clave);
  if (celda) {
    celda.cantidad += cantidad;
    celda.suma += suma;
  } else {
    celdas.set(clave, { territorio, dimension, categoria, cantidad, suma });
  }
}

const comoLista = (categorias) => {
  if (categorias === null || categorias === undefined) {
    return [];
  }
  return Array.isArray(categorias) ? categorias : [categorias];
};

export function crearAgregador({
  dimensiones,
  valor = () => 0,
  territorio = (registro) => registro.municipio,
}) {
  const celdas = new Map();
  let registros = 0;

  function agregar(registro) {
    const municipio = territorio(registro);
    if (typeof municipio !== 'string' || !/^\d{5}$/.test(municipio)) {
      throw new RangeError(`Código de municipio no válido: ${municipio}`);
    }
    const medida = valor(registro);
    acumular(celdas, municipio, DIMENSION_TOTAL, CATEGORIA_TOTAL, 1, medida);
    for (const { nombre, categorias } of dimensiones) {
      for (const categoria of comoLista(categorias(registro))) {
        acumular(celdas, municipio, nombre, categoria, 1, medida);
      }
    }
    registros += 1;
  }

  function agregarCelda({ territorio: municipio, dimension, categoria, cantidad, suma = 0 }) {
    acumular(celdas, municipio, dimension, categoria, cantidad, suma);
  }

  return {
    agregar,
    agregarCelda,
    get registros() {
      return registros;
    },
    get grupos() {
      return celdas.size;
    },
    celdasMunicipales: () => [...celdas.values()].map((celda) => ({ ...celda })),
    resultado: () => combinarNiveles(celdas.values()),
  };
}

function completar(celdas, nivel, totales) {
  return [...celdas.values()].map((celda) => {
    const total = totales.get(celda.territorio) ?? 0;
    return {
      nivel,
      territorio: celda.territorio,
      dimension: celda.dimension,
      categoria: celda.categoria,
      cantidad: celda.cantidad,
      suma: celda.suma,
      promedio: celda.cantidad === 0 ? null : celda.suma / celda.cantidad,
      porcentaje: total === 0 ? null : celda.cantidad / total,
    };
  });
}

function totalesPorTerritorio(celdas) {
  const totales = new Map();
  for (const celda of celdas.values()) {
    if (celda.dimension === DIMENSION_TOTAL) {
      totales.set(celda.territorio, celda.cantidad);
    }
  }
  return totales;
}

export function combinarNiveles(celdasMunicipales) {
  const municipales = new Map();
  const departamentales = new Map();
  const nacionales = new Map();
  for (const celda of celdasMunicipales) {
    const { territorio, dimension, categoria, cantidad, suma } = celda;
    acumular(municipales, territorio, dimension, categoria, cantidad, suma);
    acumular(departamentales, territorio.slice(0, 2), dimension, categoria, cantidad, suma);
    acumular(nacionales, CODIGO_NACIONAL, dimension, categoria, cantidad, suma);
  }
  return [
    ...completar(municipales, NIVELES.municipio, totalesPorTerritorio(municipales)),
    ...completar(departamentales, NIVELES.departamento, totalesPorTerritorio(departamentales)),
    ...completar(nacionales, NIVELES.nacional, totalesPorTerritorio(nacionales)),
  ];
}

export function suprimirCeldasPequenas(celdas, minimo = MINIMO_PARA_PUBLICAR) {
  return celdas.map((celda) => {
    if (celda.cantidad === 0 || celda.cantidad >= minimo) {
      return { ...celda, suprimida: false };
    }
    return { ...celda, cantidad: null, suma: null, promedio: null, porcentaje: null, suprimida: true };
  });
}
