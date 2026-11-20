export const COLUMNAS_DE_EJECUCION = `id, conjunto_id, usuario_id, origen_archivo, nombre_archivo, huella_archivo, formato,
  tamano_bytes, tamano_lote, encolada_en, iniciada_en, finalizada_en, estado, filas_leidas, filas_validas,
  filas_rechazadas, duplicados, en_revision, alertas, filas_confirmadas, duracion_ms, memoria_maxima_mb, mensaje`;

export function crearRepositorioCargas(grupo) {
  const filas = async (consulta, parametros = []) => (await grupo.query(consulta, parametros)).rows;

  return {
    existeConjunto: async (conjunto) =>
      (await filas('SELECT 1 FROM nucleo.conjuntos_datos WHERE id = $1', [conjunto])).length > 0,

    previasDelArchivo: (conjunto, huella) =>
      filas(
        `SELECT id, estado FROM nucleo.ejecuciones_etl
         WHERE conjunto_id = $1 AND huella_archivo = $2 AND estado IN ('EN_COLA', 'EN_CURSO', 'TERMINADA')
         ORDER BY id DESC`,
        [conjunto, huella],
      ),

    async encolar({ conjunto, usuarioId, rutaGuardada, nombreArchivo, huella, formato, tamano }) {
      const cliente = await grupo.connect();
      try {
        await cliente.query('BEGIN');
        const { rows } = await cliente.query(
          `INSERT INTO nucleo.ejecuciones_etl
             (conjunto_id, usuario_id, origen_archivo, nombre_archivo, huella_archivo, estado, formato, tamano_bytes)
           VALUES ($1, $2, $3, $4, $5, 'EN_COLA', $6, $7)
           RETURNING ${COLUMNAS_DE_EJECUCION}`,
          [conjunto, usuarioId, rutaGuardada, nombreArchivo, huella, formato, tamano],
        );
        await cliente.query('SELECT seguridad.registrar_auditoria($1, $2, $3, $4, $5, $6)', [
          usuarioId,
          'CREAR',
          'carga',
          String(rows[0].id),
          null,
          JSON.stringify({ conjunto, archivo: nombreArchivo, formato, tamanoBytes: tamano, huella }),
        ]);
        await cliente.query('COMMIT');
        return rows[0];
      } catch (error) {
        await cliente.query('ROLLBACK');
        throw error;
      } finally {
        cliente.release();
      }
    },

    ejecucion: async (id) =>
      (await filas(`SELECT ${COLUMNAS_DE_EJECUCION} FROM nucleo.ejecuciones_etl WHERE id = $1`, [id]))[0] ??
      null,

    rechazos: ({ ejecucionId, despues = null, limite }) =>
      filas(
        `SELECT numero_fila, errores, fila_cruda
         FROM staging.filas_rechazadas
         WHERE ejecucion_id = $1 AND ($2::integer IS NULL OR numero_fila > $2)
         ORDER BY numero_fila
         LIMIT $3`,
        [ejecucionId, despues, limite],
      ),

    rechazosPorMotivo: () =>
      filas(
        `SELECT e.conjunto_id, error->>'codigo' AS codigo, error->>'campo' AS campo, count(*) AS filas
         FROM staging.filas_rechazadas f
         JOIN nucleo.ejecuciones_etl e ON e.id = f.ejecucion_id
         CROSS JOIN LATERAL jsonb_array_elements(f.errores) AS error
         GROUP BY e.conjunto_id, error->>'codigo', error->>'campo'
         ORDER BY e.conjunto_id, count(*) DESC`,
      ),

    duplicadosPendientes: () =>
      filas(
        `SELECT destino, count(*) AS pares,
                count(DISTINCT coalesce(persona_id, vivienda_id)) AS registros
         FROM staging.revision_duplicados
         WHERE estado = 'PENDIENTE'
         GROUP BY destino`,
      ),
  };
}
