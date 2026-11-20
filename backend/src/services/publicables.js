import { suprimirComplementaria, suprimirEnMatriz } from '../algorithms/supresion.js';
import { DIMENSIONES_CRUZABLES } from '../models/dimensiones.js';

export const NACIONAL = Object.freeze({ nivel: 'NACIONAL', territorio: '00' });
const DIMENSIONES_SIN_PARTICION = new Set(['vulnerabilidad']);

export const sumarConocidos = (valores) =>
  valores.some((valor) => valor === null) ? null : valores.reduce((suma, valor) => suma + valor, 0);

export function crearLector(filas) {
  const celdas = new Map();
  let actualizadoEn = null;
  for (const fila of filas) {
    celdas.set([fila.nivel, fila.territorio, fila.dimension, fila.categoria].join('|'), fila);
    if (fila.actualizado_en && (!actualizadoEn || fila.actualizado_en > actualizadoEn)) {
      actualizadoEn = fila.actualizado_en;
    }
  }
  const buscar = (dimension, categoria, { nivel, territorio } = NACIONAL) =>
    celdas.get([nivel, territorio, dimension, categoria].join('|'));
  return {
    actualizadoEn,
    cantidad: (dimension, categoria, lugar) => {
      const fila = buscar(dimension, categoria, lugar);
      return fila ? fila.cantidad : 0;
    },
    suma: (dimension, categoria, lugar) => {
      const fila = buscar(dimension, categoria, lugar);
      return fila ? fila.suma : 0;
    },
    categorias: (dimension) =>
      filas
        .filter((fila) => fila.nivel === NACIONAL.nivel && fila.dimension === dimension)
        .map((fila) => fila.categoria),
    territorios: (dimension, categoria) =>
      filas
        .filter(
          (fila) =>
            fila.nivel === 'DEPARTAMENTO' && fila.dimension === dimension && fila.categoria === categoria,
        )
        .map((fila) => ({ territorio: fila.territorio, cantidad: fila.cantidad })),
  };
}

export function agruparCatalogo(categorias) {
  const catalogo = new Map();
  for (const fila of categorias) {
    const lista = catalogo.get(fila.dimension) ?? [];
    lista.push(fila);
    catalogo.set(fila.dimension, lista);
  }
  return (dimension) => catalogo.get(dimension) ?? [];
}

export function particion(lector, catalogo, dimension, clave) {
  const categorias = catalogo(dimension);
  const crudos = categorias.map(({ categoria }) => lector.cantidad(dimension, categoria));
  const { valores } = DIMENSIONES_SIN_PARTICION.has(dimension)
    ? { valores: crudos }
    : suprimirComplementaria(crudos);
  return categorias.map(({ categoria, nombre }, posicion) => ({
    codigo: categoria,
    nombre,
    [clave]: valores[posicion],
  }));
}

export function crearCruces(filas) {
  const indice = new Map();
  for (const fila of filas) {
    indice.set(
      [
        fila.nivel,
        fila.territorio,
        fila.dimension_fila,
        fila.categoria_fila,
        fila.dimension_columna,
        fila.categoria_columna,
      ].join('|'),
      fila.cantidad,
    );
  }
  const posicion = (dimension) => DIMENSIONES_CRUZABLES.indexOf(dimension);
  return {
    valor({ nivel, territorio }, una, otra) {
      const [primera, segunda] = posicion(una[0]) < posicion(otra[0]) ? [una, otra] : [otra, una];
      const clave = [nivel, territorio, ...primera, ...segunda].join('|');
      return indice.has(clave) ? indice.get(clave) : 0;
    },
    territorios: () =>
      [
        ...new Set(filas.filter((fila) => fila.nivel === 'DEPARTAMENTO').map((fila) => fila.territorio)),
      ].sort(),
  };
}

export function matriz(cruces, catalogo, dimensionFila, dimensionColumna, lugar = NACIONAL) {
  const invertida =
    DIMENSIONES_CRUZABLES.indexOf(dimensionFila) > DIMENSIONES_CRUZABLES.indexOf(dimensionColumna);
  const [primera, segunda] = invertida
    ? [dimensionColumna, dimensionFila]
    : [dimensionFila, dimensionColumna];
  const filasCanonicas = catalogo(primera);
  const columnasCanonicas = catalogo(segunda);
  const { valores: canonicos } = suprimirEnMatriz(
    filasCanonicas.map((fila) =>
      columnasCanonicas.map((columna) =>
        cruces.valor(lugar, [primera, fila.categoria], [segunda, columna.categoria]),
      ),
    ),
  );
  const filas = invertida ? columnasCanonicas : filasCanonicas;
  const columnas = invertida ? filasCanonicas : columnasCanonicas;
  const valores = invertida ? columnasCanonicas.map((_, x) => canonicos.map((fila) => fila[x])) : canonicos;
  return {
    filas,
    columnas,
    valores,
    celda: (categoriaFila, categoriaColumna) => {
      const y = filas.findIndex(({ categoria }) => categoria === categoriaFila);
      const x = columnas.findIndex(({ categoria }) => categoria === categoriaColumna);
      return y === -1 || x === -1 ? 0 : valores[y][x];
    },
    columnaEntre: (categoriasFila, categoriaColumna) =>
      sumarConocidos(
        filas.flatMap(({ categoria }, y) =>
          categoriasFila.includes(categoria)
            ? [valores[y][columnas.findIndex((columna) => columna.categoria === categoriaColumna)]]
            : [],
        ),
      ),
  };
}

export function valorPublicable(lector, catalogo, dimension, categoria) {
  if (catalogo(dimension).length === 0) {
    return lector.cantidad(dimension, categoria);
  }
  const elemento = particion(lector, catalogo, dimension, 'cantidad').find(
    ({ codigo }) => codigo === categoria,
  );
  return elemento ? elemento.cantidad : 0;
}
