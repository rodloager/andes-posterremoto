const BYTES_POR_MEGABYTE = 1024 * 1024;
const INTERVALO_MS = 200;

export function iniciarMedicion(intervaloMs = INTERVALO_MS) {
  let maximo = process.memoryUsage().rss;
  const inicio = performance.now();
  const temporizador = setInterval(() => {
    maximo = Math.max(maximo, process.memoryUsage().rss);
  }, intervaloMs);
  temporizador.unref();
  return {
    memoriaMaximaMb: () =>
      Math.round((Math.max(maximo, process.memoryUsage().rss) / BYTES_POR_MEGABYTE) * 10) / 10,
    milisegundos: () => Math.round(performance.now() - inicio),
    detener: () => clearInterval(temporizador),
  };
}
