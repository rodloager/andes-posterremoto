import { agruparPares } from '../algorithms/duplicados.js';
import { ErrorHttp, noEncontrado } from '../utils/errores.js';
import { ConflictoDeDecision } from '../repositories/duplicados.js';
import { paginar } from './paginacion.js';

function comoRegistro(registro) {
  const {
    capturado_en: capturadoEn,
    nombre_municipio: nombreMunicipio,
    ejecucion_id: carga,
    numero_fila: fila,
    ...resto
  } = registro;
  return { ...resto, nombreMunicipio, capturadoEn, carga, fila };
}

export function crearServicioDuplicados(repositorio) {
  async function gruposPendientes(destino) {
    const pares = await repositorio.paresPendientes(destino);
    const grupos = agruparPares(pares.map(({ nuevo, candidato }) => [nuevo, candidato]));
    const grupoPorRegistro = new Map();
    grupos.forEach((miembros) => {
      const descripcion = { id: Math.min(...miembros), registros: miembros.length };
      for (const miembro of miembros) {
        grupoPorRegistro.set(miembro, descripcion);
      }
    });
    return grupoPorRegistro;
  }

  return {
    async pares({ destino, estado, despues, limite }) {
      const [filas, grupos] = await Promise.all([
        repositorio.pares({ destino, estado, despues, limite }),
        estado === 'PENDIENTE' ? gruposPendientes(destino) : new Map(),
      ]);
      return paginar(
        filas.map((fila) => ({
          id: fila.id,
          carga: fila.ejecucion_id,
          similitud: Number(fila.similitud),
          motivo: fila.motivo,
          detalle: fila.detalle,
          estado: fila.estado,
          creadoEn: fila.creado_en,
          decididoEn: fila.decidido_en,
          grupo: grupos.get(fila.nuevo.id) ?? null,
          nuevo: comoRegistro(fila.nuevo),
          candidato: comoRegistro(fila.candidato),
        })),
        limite,
        (par) => par.id,
      );
    },

    async decidir({ id, decision, usuario }) {
      try {
        const resultado = await repositorio.decidir({ id, decision, usuarioId: usuario.id });
        if (!resultado) {
          throw noEncontrado(`No existe el par ${id} en la cola de revisión.`);
        }
        return { decision: resultado };
      } catch (error) {
        if (error instanceof ConflictoDeDecision) {
          throw new ErrorHttp(409, error.codigo, error.message);
        }
        throw error;
      }
    },
  };
}
