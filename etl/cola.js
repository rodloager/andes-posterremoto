import { leerDefinicion } from './nucleo/definiciones.js';
import { resolverRutaGuardada } from './nucleo/archivos.js';
import { ejecutarCarga } from './proceso.js';

const CANDADO_DEL_TRABAJADOR = [20_260_810, 0];

const RECLAMAR_SIGUIENTE = `
  UPDATE nucleo.ejecuciones_etl
  SET estado = 'EN_CURSO', iniciada_en = now()
  WHERE id = (
    SELECT id FROM nucleo.ejecuciones_etl
    WHERE estado = 'EN_COLA'
    ORDER BY id
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  )
  RETURNING *`;

const CLASE_DE_CANDADO_DE_CARGA = 20_260_810;

export async function recuperarInterrumpidas(cliente) {
  const { rows } = await cliente.query(
    "SELECT id FROM nucleo.ejecuciones_etl WHERE estado = 'EN_CURSO' ORDER BY id",
  );
  const recuperadas = [];
  for (const { id } of rows) {
    const { rows: candado } = await cliente.query('SELECT pg_try_advisory_lock($1, $2) AS tomado', [
      CLASE_DE_CANDADO_DE_CARGA,
      id,
    ]);
    if (!candado[0].tomado) {
      continue;
    }
    try {
      await cliente.query(
        "UPDATE nucleo.ejecuciones_etl SET estado = 'EN_COLA' WHERE id = $1 AND estado = 'EN_CURSO'",
        [id],
      );
      recuperadas.push(id);
    } finally {
      await cliente.query('SELECT pg_advisory_unlock($1, $2)', [CLASE_DE_CANDADO_DE_CARGA, id]);
    }
  }
  return recuperadas;
}

async function marcarFallida(cliente, ejecucionId, mensaje) {
  await cliente.query(
    `UPDATE nucleo.ejecuciones_etl SET estado = 'FALLIDA', finalizada_en = now(), mensaje = $2
     WHERE id = $1 AND estado IN ('EN_COLA', 'EN_CURSO')`,
    [ejecucionId, String(mensaje).slice(0, 1000)],
  );
}

export async function trabajar({ cliente, configuracion, registrar = () => {} }) {
  const { rows } = await cliente.query(
    'SELECT pg_try_advisory_lock($1, $2) AS tomado',
    CANDADO_DEL_TRABAJADOR,
  );
  if (!rows[0].tomado) {
    registrar({ nivel: 'info', mensaje: 'Ya hay un trabajador del ETL procesando la cola.' });
    return { procesadas: 0, fallidas: 0 };
  }
  let procesadas = 0;
  let fallidas = 0;
  try {
    const recuperadas = await recuperarInterrumpidas(cliente);
    if (recuperadas.length > 0) {
      registrar({
        nivel: 'info',
        mensaje: `Cargas interrumpidas devueltas a la cola: ${recuperadas.join(', ')}.`,
      });
    }
    for (;;) {
      const { rows: reclamadas } = await cliente.query(RECLAMAR_SIGUIENTE);
      const [ejecucion] = reclamadas;
      if (!ejecucion) {
        break;
      }
      try {
        const definicion = await leerDefinicion(ejecucion.conjunto_id);
        const resultado = await ejecutarCarga({
          cliente,
          definicion,
          ruta: resolverRutaGuardada(ejecucion.origen_archivo),
          formato: ejecucion.formato,
          configuracion,
          ejecucionId: ejecucion.id,
          usuarioId: ejecucion.usuario_id,
          nombreArchivo: ejecucion.nombre_archivo,
        });
        registrar({
          nivel: 'info',
          mensaje: `Ejecución ${ejecucion.id} terminada.`,
          resumen: resultado.resumen,
        });
        procesadas += 1;
      } catch (error) {
        await marcarFallida(cliente, ejecucion.id, error.message);
        registrar({ nivel: 'error', mensaje: `Ejecución ${ejecucion.id} fallida: ${error.message}` });
        fallidas += 1;
      }
    }
  } finally {
    await cliente.query('SELECT pg_advisory_unlock($1, $2)', CANDADO_DEL_TRABAJADOR).catch(() => null);
  }
  return { procesadas, fallidas };
}
