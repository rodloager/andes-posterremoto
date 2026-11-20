export function calcularCortes(valores, clases) {
  const positivos = valores.filter((valor) => valor > 0).sort((a, b) => a - b);
  const cortes = [];
  for (let clase = 1; clase < clases; clase += 1) {
    const posicion = Math.floor((clase * positivos.length) / clases);
    if (posicion < positivos.length) {
      cortes.push(positivos[posicion]);
    }
  }
  return [...new Set(cortes)].filter((corte) => corte > positivos[0]);
}

export function clasificar(valor, cortes) {
  return cortes.filter((corte) => valor >= corte).length;
}

export function describirRangos(cortes, minimo, formatear) {
  const inicios = [minimo, ...cortes];
  return inicios.map((inicio, posicion) => {
    const siguiente = inicios[posicion + 1];
    if (siguiente === undefined) {
      return `${formatear(inicio)} o más`;
    }
    return siguiente - 1 === inicio
      ? formatear(inicio)
      : `${formatear(inicio)} a ${formatear(siguiente - 1)}`;
  });
}
