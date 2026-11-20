import { crearAgregador } from '../../backend/src/algorithms/agregacion.js';
import { DESTINOS_AGREGABLES } from '../../backend/src/models/dimensiones.js';
import {
  bloquearAgregados,
  claveDeCandado,
  sumarAgregados,
} from '../../backend/src/repositories/agregados.js';

const FILAS_POR_CONSULTA = 10_000;

function crearAgregadorDe(destino) {
  const { dimensiones, valor } = DESTINOS_AGREGABLES[destino].crearDimensiones();
  return crearAgregador({ dimensiones, valor });
}

async function recorrerVigentes(cliente, { destino, condicion, parametros }, alLeer) {
  const agregable = DESTINOS_AGREGABLES[destino];
  const alias = agregable.tabla;
  const consulta = `${agregable.consulta}
    WHERE ${condicion(alias)} AND ${alias}.estado = 'VIGENTE' AND ${alias}.id > $${parametros.length + 1}
    ORDER BY ${alias}.id
    LIMIT $${parametros.length + 2}`;
  let ultimo = 0;
  for (;;) {
    const { rows } = await cliente.query(consulta, [...parametros, ultimo, FILAS_POR_CONSULTA]);
    if (rows.length === 0) {
      return;
    }
    for (const fila of rows) {
      alLeer(agregable.comoRegistro(fila));
    }
    ultimo = rows.at(-1).id;
  }
}

export async function agregarEjecucion(cliente, { destino, ejecucionId }) {
  const agregador = crearAgregadorDe(destino);
  await recorrerVigentes(
    cliente,
    { destino, condicion: (alias) => `${alias}.ejecucion_id = $1`, parametros: [ejecucionId] },
    agregador.agregar,
  );
  return agregador;
}

export async function aplicarAgregados(cliente, { destino, ejecucionId, eventoId, origen }) {
  if (!DESTINOS_AGREGABLES[destino]) {
    return { registros: 0, celdas: 0 };
  }
  const agregador = await agregarEjecucion(cliente, { destino, ejecucionId });
  const celdas = agregador.resultado();
  await cliente.query('BEGIN');
  try {
    await bloquearAgregados(cliente, destino);
    await sumarAgregados(cliente, { eventoId, origen, destino, celdas });
    await cliente.query('UPDATE nucleo.ejecuciones_etl SET agregados_aplicados = true WHERE id = $1', [
      ejecucionId,
    ]);
    await cliente.query('COMMIT');
  } catch (error) {
    await cliente.query('ROLLBACK');
    throw error;
  }
  return { registros: agregador.registros, celdas: celdas.length };
}

const DE_CARGAS_AGREGADAS = (alias) =>
  `${alias}.evento_id = $1 AND ${alias}.origen_dato = $2
   AND ${alias}.ejecucion_id IN (SELECT id FROM nucleo.ejecuciones_etl WHERE agregados_aplicados)`;

export async function recalcularAgregados(cliente, { destino }) {
  const agregable = DESTINOS_AGREGABLES[destino];
  if (!agregable) {
    throw new RangeError(`No hay agregados para el destino ${destino}.`);
  }
  await cliente.query('SELECT pg_advisory_lock($1, $2)', claveDeCandado(destino));
  try {
    await cliente.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
    try {
      const { rows: grupos } = await cliente.query(
        `SELECT DISTINCT evento_id, origen_dato FROM ${agregable.relacion} WHERE estado = 'VIGENTE' ORDER BY 1, 2`,
      );
      await cliente.query('DELETE FROM analitica.agregados WHERE destino = $1', [destino]);
      const resumen = [];
      for (const { evento_id: eventoId, origen_dato: origen } of grupos) {
        const agregador = crearAgregadorDe(destino);
        await recorrerVigentes(
          cliente,
          { destino, condicion: DE_CARGAS_AGREGADAS, parametros: [eventoId, origen] },
          agregador.agregar,
        );
        const celdas = agregador.resultado();
        await sumarAgregados(cliente, { eventoId, origen, destino, celdas });
        resumen.push({ eventoId, origen, registros: agregador.registros, celdas: celdas.length });
      }
      await cliente.query('COMMIT');
      return resumen;
    } catch (error) {
      await cliente.query('ROLLBACK');
      throw error;
    }
  } finally {
    await cliente.query('SELECT pg_advisory_unlock($1, $2)', claveDeCandado(destino));
  }
}
