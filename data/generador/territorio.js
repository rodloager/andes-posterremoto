const RADIO_TERRESTRE_KM = 6371;
const DISTANCIA_DE_REFERENCIA_KM = 150;

const aRadianes = (grados) => (grados * Math.PI) / 180;

export function distanciaKm(origen, destino) {
  const deltaLatitud = aRadianes(destino.latitud - origen.latitud);
  const deltaLongitud = aRadianes(destino.longitud - origen.longitud);
  const semiverseno =
    Math.sin(deltaLatitud / 2) ** 2 +
    Math.cos(aRadianes(origen.latitud)) *
      Math.cos(aRadianes(destino.latitud)) *
      Math.sin(deltaLongitud / 2) ** 2;
  return 2 * RADIO_TERRESTRE_KM * Math.asin(Math.sqrt(semiverseno));
}

function anilloPrincipal(geometria) {
  const poligonos = geometria.type === 'Polygon' ? [geometria.coordinates] : geometria.coordinates;
  return poligonos
    .map((poligono) => poligono[0])
    .reduce((mayor, anillo) => (anillo.length > mayor.length ? anillo : mayor));
}

export function centroAproximado(geometria) {
  const anillo = anilloPrincipal(geometria);
  const suma = anillo.reduce(
    (acumulado, [longitud, latitud]) => ({
      latitud: acumulado.latitud + latitud,
      longitud: acumulado.longitud + longitud,
    }),
    { latitud: 0, longitud: 0 },
  );
  return { latitud: suma.latitud / anillo.length, longitud: suma.longitud / anillo.length };
}

export function pesarPorCercania(entidades, epicentro) {
  return entidades.map((entidad) => {
    const distancia = distanciaKm(epicentro, centroAproximado(entidad.geometry));
    return {
      codigo: entidad.properties.codigo,
      nombre: entidad.properties.nombre,
      peso: 1 / (1 + (distancia / DISTANCIA_DE_REFERENCIA_KM) ** 2),
    };
  });
}
