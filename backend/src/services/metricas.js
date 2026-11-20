import { monitorEventLoopDelay } from 'node:perf_hooks';
import { seleccionarMayores } from '../algorithms/mayores.js';
import { Anillo } from '../utils/anillo.js';

const CAPACIDAD_DURACIONES = 500;
const CAPACIDAD_ERRORES = 20;
const RUTAS_FRECUENTES = 10;
const RESOLUCION_RETARDO_MS = 20;
const NANOSEGUNDOS_POR_MS = 1e6;

export function percentil(valores, proporcion) {
  if (valores.length === 0) {
    return null;
  }
  const ordenados = [...valores].sort((a, b) => a - b);
  const posicion = Math.max(0, Math.ceil(proporcion * ordenados.length) - 1);
  return ordenados[posicion];
}

const promedio = (total, cantidad) => (cantidad === 0 ? null : total / cantidad);
const retrasoSobreElMuestreo = (nanosegundos) =>
  Math.max(0, nanosegundos / NANOSEGUNDOS_POR_MS - RESOLUCION_RETARDO_MS);

function resumirRuta({ ruta, solicitudes, errores, totalMs, duraciones }) {
  return {
    ruta,
    solicitudes,
    errores,
    promedioMs: promedio(totalMs, solicitudes),
    p95Ms: percentil(duraciones.valores(), 0.95),
  };
}

export function crearMetricas({ capacidadDuraciones = CAPACIDAD_DURACIONES } = {}) {
  const rutas = new Map();
  const errores = new Anillo(CAPACIDAD_ERRORES);
  const retardo = monitorEventLoopDelay({ resolution: RESOLUCION_RETARDO_MS });
  const inicio = new Date();
  retardo.enable();

  function registrarSolicitud({ ruta, estado, duracionMs }) {
    const acumulado = rutas.get(ruta) ?? {
      ruta,
      solicitudes: 0,
      errores: 0,
      totalMs: 0,
      duraciones: new Anillo(capacidadDuraciones),
    };
    acumulado.solicitudes += 1;
    acumulado.errores += estado >= 500 ? 1 : 0;
    acumulado.totalMs += duracionMs;
    acumulado.duraciones.agregar(duracionMs);
    rutas.set(ruta, acumulado);
  }

  function resumen() {
    const todas = [...rutas.values()];
    const solicitudes = todas.reduce((total, ruta) => total + ruta.solicitudes, 0);
    const totalMs = todas.reduce((total, ruta) => total + ruta.totalMs, 0);
    const mayores = seleccionarMayores(
      todas,
      RUTAS_FRECUENTES,
      (ruta) => ruta.solicitudes,
      (una, otra) => una.ruta.localeCompare(otra.ruta),
    );
    return {
      solicitudes,
      errores: todas.reduce((total, ruta) => total + ruta.errores, 0),
      promedioMs: promedio(totalMs, solicitudes),
      p95Ms: percentil(
        todas.flatMap((ruta) => ruta.duraciones.valores()),
        0.95,
      ),
      masFrecuentes: mayores.map(resumirRuta),
    };
  }

  return {
    inicio,
    registrarSolicitud,
    registrarError: (error) => errores.agregar({ fecha: new Date().toISOString(), ...error }),
    resumen,
    erroresRecientes: () => errores.valores().reverse(),
    retardoCicloEventos: () =>
      retardo.count === 0
        ? { promedioMs: null, p99Ms: null }
        : {
            promedioMs: retrasoSobreElMuestreo(retardo.mean),
            p99Ms: retrasoSobreElMuestreo(retardo.percentile(99)),
          },
    detener: () => retardo.disable(),
  };
}
