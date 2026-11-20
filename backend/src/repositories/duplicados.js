import { crearAgregador } from '../algorithms/agregacion.js';
import { DESTINOS_AGREGABLES } from '../models/dimensiones.js';
import { bloquearAgregados, sumarAgregados } from './agregados.js';

export const DESTINOS_DE_REVISION = Object.freeze({
  personas: Object.freeze({
    tabla: 'nucleo.personas_afectadas',
    columnaNueva: 'persona_id',
    columnaCandidata: 'persona_candidata_id',
    entidad: 'persona',
  }),
  viviendas: Object.freeze({
    tabla: 'nucleo.viviendas',
    columnaNueva: 'vivienda_id',
    columnaCandidata: 'vivienda_candidata_id',
    entidad: 'vivienda',
  }),
});

const DETALLE_DE_PERSONA = (alias) => `
  ${alias}.id, ${alias}.nombre_normalizado AS nombre, ${alias}.edad_al_evento AS edad, ${alias}.sexo,
  ${alias}.municipio_codigo AS municipio, m_${alias}.nombre AS nombre_municipio, ${alias}.capturado_en,
  ${alias}.estado, ${alias}.ejecucion_id, ${alias}.numero_fila`;

const DETALLE_DE_VIVIENDA = (alias) => `
  ${alias}.id, ${alias}.direccion_normalizada AS direccion, ${alias}.zona, ${alias}.estrato,
  ${alias}.municipio_codigo AS municipio, m_${alias}.nombre AS nombre_municipio, ${alias}.capturado_en,
  ${alias}.estado, ${alias}.ejecucion_id, ${alias}.numero_fila`;

function consultaDePares(destino) {
  const { tabla, columnaNueva, columnaCandidata } = DESTINOS_DE_REVISION[destino];
  const detalle = destino === 'personas' ? DETALLE_DE_PERSONA : DETALLE_DE_VIVIENDA;
  return `
    SELECT r.id, r.ejecucion_id, r.similitud, r.motivo, r.detalle, r.estado, r.creado_en, r.decidido_en,
           to_jsonb(nuevo) AS nuevo, to_jsonb(candidato) AS candidato
    FROM staging.revision_duplicados r
    CROSS JOIN LATERAL (
      SELECT ${detalle('n')} FROM ${tabla} n JOIN nucleo.municipios m_n ON m_n.codigo = n.municipio_codigo
      WHERE n.id = r.${columnaNueva}
    ) nuevo
    CROSS JOIN LATERAL (
      SELECT ${detalle('c')} FROM ${tabla} c JOIN nucleo.municipios m_c ON m_c.codigo = c.municipio_codigo
      WHERE c.id = r.${columnaCandidata}
    ) candidato
    WHERE r.destino = $1 AND r.estado = $2 AND ($3::bigint IS NULL OR r.id > $3)
    ORDER BY r.id
    LIMIT $4`;
}

export class ConflictoDeDecision extends Error {
  constructor(codigo, mensaje) {
    super(mensaje);
    this.codigo = codigo;
  }
}

const SALTOS_MAXIMOS = 20;

async function representanteFinal(cliente, tabla, id) {
  let actual = id;
  for (let salto = 0; salto < SALTOS_MAXIMOS; salto += 1) {
    const {
      rows: [registro],
    } = await cliente.query(`SELECT estado, fusionado_con FROM ${tabla} WHERE id = $1`, [actual]);
    if (registro.estado !== 'FUSIONADO') {
      return actual;
    }
    actual = registro.fusionado_con;
  }
  throw new ConflictoDeDecision('CICLO', 'La cadena de fusiones es demasiado larga.');
}

async function sumarRegistro(cliente, { destino, id }) {
  const agregable = DESTINOS_AGREGABLES[destino];
  const { rows } = await cliente.query(
    `${agregable.consulta} WHERE ${agregable.tabla}.id = $1 AND ${agregable.tabla}.estado = 'VIGENTE'`,
    [id],
  );
  if (rows.length === 0) {
    return 0;
  }
  const { dimensiones, valor } = agregable.crearDimensiones();
  const agregador = crearAgregador({ dimensiones, valor });
  agregador.agregar(agregable.comoRegistro(rows[0]));
  const {
    rows: [registro],
  } = await cliente.query(
    `SELECT evento_id, origen_dato FROM ${DESTINOS_DE_REVISION[destino].tabla} WHERE id = $1`,
    [id],
  );
  await bloquearAgregados(cliente, destino);
  return sumarAgregados(cliente, {
    eventoId: registro.evento_id,
    origen: registro.origen_dato,
    destino,
    celdas: agregador.resultado(),
  });
}

export function crearRepositorioDuplicados(grupo) {
  return {
    async pares({ destino, estado, despues = null, limite }) {
      const { rows } = await grupo.query(consultaDePares(destino), [destino, estado, despues, limite]);
      return rows;
    },

    async paresPendientes(destino) {
      const { columnaNueva, columnaCandidata } = DESTINOS_DE_REVISION[destino];
      const { rows } = await grupo.query(
        `SELECT ${columnaNueva} AS nuevo, ${columnaCandidata} AS candidato
         FROM staging.revision_duplicados WHERE destino = $1 AND estado = 'PENDIENTE'`,
        [destino],
      );
      return rows;
    },

    async decidir({ id, decision, usuarioId }) {
      const cliente = await grupo.connect();
      try {
        await cliente.query('BEGIN');
        const {
          rows: [par],
        } = await cliente.query(
          `SELECT r.*, e.estado AS estado_de_la_carga
           FROM staging.revision_duplicados r
           JOIN nucleo.ejecuciones_etl e ON e.id = r.ejecucion_id
           WHERE r.id = $1
           FOR UPDATE OF r`,
          [id],
        );
        if (!par) {
          await cliente.query('ROLLBACK');
          return null;
        }
        if (par.estado !== 'PENDIENTE') {
          throw new ConflictoDeDecision('YA_DECIDIDO', 'Este par ya tiene una decisión.');
        }
        if (par.estado_de_la_carga !== 'TERMINADA') {
          throw new ConflictoDeDecision('CARGA_EN_CURSO', 'La carga de este registro todavía no termina.');
        }
        const destino = DESTINOS_DE_REVISION[par.destino];
        const nuevoId = par[destino.columnaNueva];
        const candidatoId = par[destino.columnaCandidata];
        const {
          rows: [registro],
        } = await cliente.query(`SELECT id, estado FROM ${destino.tabla} WHERE id = $1 FOR UPDATE`, [
          nuevoId,
        ]);
        if (registro.estado !== 'EN_REVISION') {
          throw new ConflictoDeDecision('YA_DECIDIDO', 'El registro ya no está en revisión.');
        }
        let estadoFinal = 'EN_REVISION';
        let pendientes = 0;
        let representante = candidatoId;
        if (decision === 'MISMO') {
          estadoFinal = 'FUSIONADO';
          representante = await representanteFinal(cliente, destino.tabla, candidatoId);
          if (representante === nuevoId) {
            throw new ConflictoDeDecision('CICLO', 'El candidato ya está fusionado con este registro.');
          }
          await cliente.query(
            `UPDATE ${destino.tabla} SET estado = 'FUSIONADO', fusionado_con = $2, actualizado_en = now() WHERE id = $1`,
            [nuevoId, representante],
          );
          await cliente.query(
            `UPDATE staging.revision_duplicados SET estado = 'RESUELTO', decidido_por = $3, decidido_en = now()
             WHERE ${destino.columnaNueva} = $1 AND estado = 'PENDIENTE' AND id <> $2`,
            [nuevoId, id, usuarioId],
          );
        } else {
          const { rows } = await cliente.query(
            `SELECT count(*) AS pendientes FROM staging.revision_duplicados
             WHERE ${destino.columnaNueva} = $1 AND estado = 'PENDIENTE' AND id <> $2`,
            [nuevoId, id],
          );
          pendientes = rows[0].pendientes;
          if (pendientes === 0) {
            estadoFinal = 'VIGENTE';
            await cliente.query(
              `UPDATE ${destino.tabla} SET estado = 'VIGENTE', actualizado_en = now() WHERE id = $1`,
              [nuevoId],
            );
            await sumarRegistro(cliente, { destino: par.destino, id: nuevoId });
          }
        }
        await cliente.query(
          'UPDATE staging.revision_duplicados SET estado = $2, decidido_por = $3, decidido_en = now() WHERE id = $1',
          [id, decision === 'MISMO' ? 'FUSIONADO' : 'DISTINTO', usuarioId],
        );
        await cliente.query('SELECT seguridad.registrar_auditoria($1, $2, $3, $4, $5, $6)', [
          usuarioId,
          'ACTUALIZAR',
          destino.entidad,
          String(nuevoId),
          JSON.stringify({ estado: 'EN_REVISION' }),
          JSON.stringify({
            estado: estadoFinal,
            decision,
            par: id,
            ...(decision === 'MISMO' ? { fusionadoCon: representante } : {}),
          }),
        ]);
        await cliente.query('COMMIT');
        return {
          id,
          destino: par.destino,
          decision,
          registro: {
            id: nuevoId,
            estado: estadoFinal,
            ...(decision === 'MISMO' ? { fusionadoCon: representante } : {}),
          },
          pendientes,
        };
      } catch (error) {
        await cliente.query('ROLLBACK');
        throw error;
      } finally {
        cliente.release();
      }
    },
  };
}
