const NANOSEGUNDOS_POR_MS = 1e6;

export function seguirEnrutamiento(solicitud) {
  let base = solicitud.baseUrl;
  let montajeMasProfundo = base;
  let ruta;
  let patron = null;
  Object.defineProperties(solicitud, {
    baseUrl: {
      configurable: true,
      enumerable: true,
      get: () => base,
      set: (valor) => {
        base = valor;
        if (valor.length > montajeMasProfundo.length) {
          montajeMasProfundo = valor;
        }
      },
    },
    route: {
      configurable: true,
      enumerable: true,
      get: () => ruta,
      set: (valor) => {
        ruta = valor;
        patron = valor.path === '/' ? base : `${base}${valor.path}`;
      },
    },
  });
  return () => patron ?? `${montajeMasProfundo}/*`;
}

export function medirSolicitudes(metricas) {
  return (solicitud, respuesta, siguiente) => {
    const inicio = process.hrtime.bigint();
    const patron = seguirEnrutamiento(solicitud);
    respuesta.on('finish', () => {
      metricas.registrarSolicitud({
        ruta: `${solicitud.method} ${patron()}`,
        estado: respuesta.statusCode,
        duracionMs: Number(process.hrtime.bigint() - inicio) / NANOSEGUNDOS_POR_MS,
      });
    });
    siguiente();
  };
}
