import { cpus, loadavg } from 'node:os';
import { describirGrupo } from '../config/baseDeDatos.js';
import { comoCambio } from './administracion.js';
import { paginar } from './paginacion.js';

const BYTES_POR_MEGABYTE = 1024 * 1024;
const PROCESOS_RECIENTES = 10;
const porId = (fila) => fila.id;
const enMegabytes = (bytes) => Math.round((bytes / BYTES_POR_MEGABYTE) * 10) / 10;

function describirServidor({ entorno, metricas }) {
  const memoria = process.memoryUsage();
  return {
    versionNode: process.version,
    entorno,
    enEjecucionDesde: metricas.inicio.toISOString(),
    segundosEnEjecucion: Math.round(process.uptime()),
    memoria: {
      residenteMb: enMegabytes(memoria.rss),
      montonUsadoMb: enMegabytes(memoria.heapUsed),
      montonTotalMb: enMegabytes(memoria.heapTotal),
    },
    cargaPromedio: loadavg(),
    nucleos: cpus().length,
    retardoCicloEventos: metricas.retardoCicloEventos(),
  };
}

async function describirBaseDeDatos(repositorio, conexiones) {
  const grupos = {
    aplicacion: describirGrupo(conexiones.aplicacion),
    lectura: describirGrupo(conexiones.lectura),
  };
  try {
    const { version, tamano, latenciaMs } = await repositorio.comprobar();
    return { disponible: true, version, tamanoMb: enMegabytes(tamano), latenciaMs, conexiones: grupos };
  } catch (error) {
    return { disponible: false, error: error.message, conexiones: grupos };
  }
}

export function crearServicioIngenieria({
  repositorio,
  repositorioAdministracion,
  conexiones,
  metricas,
  entorno,
}) {
  return {
    async estado() {
      const [baseDeDatos, conteos, procesos, fuentes] = await Promise.all([
        describirBaseDeDatos(repositorio, conexiones),
        repositorio.conteos(),
        repositorioAdministracion.ejecuciones({ limite: PROCESOS_RECIENTES }),
        repositorio.fuentes(),
      ]);
      return {
        generadoEn: new Date().toISOString(),
        servidor: describirServidor({ entorno, metricas }),
        baseDeDatos,
        registros: conteos,
        procesosEtl: procesos.map((fila) => ({
          id: fila.id,
          conjunto: fila.conjunto_id,
          estado: fila.estado,
          iniciadaEn: fila.iniciada_en,
          finalizadaEn: fila.finalizada_en,
          filasLeidas: fila.filas_leidas,
          filasValidas: fila.filas_validas,
          filasRechazadas: fila.filas_rechazadas,
          alertas: fila.alertas,
          duracionMs: fila.duracion_ms,
          filasPorSegundo:
            fila.duracion_ms > 0 ? Math.round((fila.filas_leidas * 1000) / fila.duracion_ms) : null,
          memoriaMaximaMb: fila.memoria_maxima_mb === null ? null : Number(fila.memoria_maxima_mb),
        })),
        fuentes: fuentes.map((fila) => ({
          id: fila.id,
          nombre: fila.nombre,
          origen: fila.origen,
          fechaConsulta: fila.fecha_consulta,
          diasDesdeConsulta: fila.dias_desde_consulta,
        })),
        solicitudes: metricas.resumen(),
        erroresRecientes: metricas.erroresRecientes(),
      };
    },

    async auditoria({ despues, limite }) {
      const filas = await repositorioAdministracion.auditoria({ despues, limite });
      return paginar(filas.map(comoCambio), limite, porId);
    },

    async verificarAuditoria() {
      const { registros, primer_error: primerError } = await repositorio.verificarAuditoria();
      return { registros, integra: primerError === null, primerRegistroAlterado: primerError };
    },

    async accesos({ despues, limite }) {
      const filas = await repositorio.accesos({ despues, limite });
      const elementos = filas.map((fila) => ({
        id: fila.id,
        correo: fila.correo_intentado,
        usuario: fila.usuario,
        ip: fila.ip,
        exitoso: fila.exitoso,
        motivo: fila.motivo,
        ocurridoEn: fila.ocurrido_en,
      }));
      return paginar(elementos, limite, porId);
    },
  };
}
