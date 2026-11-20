const esOculto = (valor) => valor === null;

function menor(celdas, valorDe) {
  return celdas.reduce((elegida, celda) => (valorDe(celda) < valorDe(elegida) ? celda : elegida));
}

export function suprimirComplementaria(valores) {
  const resultado = [...valores];
  const visibles = resultado.flatMap((valor, posicion) => (!esOculto(valor) && valor > 0 ? [posicion] : []));
  if (resultado.filter(esOculto).length !== 1 || visibles.length === 0) {
    return { valores: resultado, complementarias: 0 };
  }
  resultado[menor(visibles, (posicion) => resultado[posicion])] = null;
  return { valores: resultado, complementarias: 1 };
}

export function suprimirEnMatriz(matriz) {
  const resultado = matriz.map((fila) => [...fila]);
  const alto = resultado.length;
  const ancho = resultado[0]?.length ?? 0;
  const valorDe = ([y, x]) => resultado[y][x];
  const ocultasEnFila = (y) => resultado[y].filter(esOculto).length;
  const ocultasEnColumna = (x) => resultado.filter((fila) => esOculto(fila[x])).length;
  const lineas = [
    ...Array.from({ length: alto }, (_, y) => ({
      celdas: Array.from({ length: ancho }, (__, x) => [y, x]),
      cruzadas: ([, x]) => ocultasEnColumna(x),
    })),
    ...Array.from({ length: ancho }, (_, x) => ({
      celdas: Array.from({ length: alto }, (__, y) => [y, x]),
      cruzadas: ([y]) => ocultasEnFila(y),
    })),
  ];
  let complementarias = 0;
  let cambio = true;
  while (cambio) {
    cambio = false;
    for (const { celdas, cruzadas } of lineas) {
      const candidatas = celdas.filter((celda) => !esOculto(valorDe(celda)) && valorDe(celda) > 0);
      if (celdas.filter((celda) => esOculto(valorDe(celda))).length === 1 && candidatas.length > 0) {
        const preferidas = candidatas.filter((celda) => cruzadas(celda) === 1);
        const [y, x] = menor(preferidas.length > 0 ? preferidas : candidatas, valorDe);
        resultado[y][x] = null;
        complementarias += 1;
        cambio = true;
      }
    }
  }
  return { valores: resultado, complementarias };
}
