const COLUMNAS_EDITABLES_DE_FUENTE = Object.freeze({
  fechaConsulta: 'fecha_consulta',
  cobertura: 'cobertura',
  variables: 'variables',
  limitaciones: 'limitaciones',
});

const COLUMNAS_DE_FUENTE =
  'id, entidad, sigla, fecha_consulta, cobertura, variables, limitaciones, actualizado_en';

export function crearRepositorioAdministracion(grupo) {
  const filas = async (consulta, parametros = []) => (await grupo.query(consulta, parametros)).rows;

  return {
    conjuntos: () =>
      filas(
        `SELECT c.id, c.nombre, c.descripcion, c.destino, c.fuente_id, f.sigla, f.entidad, f.origen, f.nivel,
                e.id AS ejecucion_id, e.estado, e.finalizada_en, e.filas_leidas, e.filas_validas,
                CASE c.destino
                  WHEN 'reportes' THEN
                    (SELECT count(*) FROM nucleo.reportes_municipales r
                     JOIN analitica.ejecuciones_vigentes v ON v.ejecucion_id = r.ejecucion_id
                     WHERE v.conjunto_id = c.id)
                  WHEN 'personas' THEN
                    (SELECT count(*) FROM nucleo.personas_afectadas p
                     JOIN nucleo.ejecuciones_etl x ON x.id = p.ejecucion_id
                     WHERE x.conjunto_id = c.id AND p.estado = 'VIGENTE')
                  WHEN 'viviendas' THEN
                    (SELECT count(*) FROM nucleo.viviendas w
                     JOIN nucleo.ejecuciones_etl x ON x.id = w.ejecucion_id
                     WHERE x.conjunto_id = c.id AND w.estado = 'VIGENTE')
                END AS registros
         FROM nucleo.conjuntos_datos c
         JOIN nucleo.fuentes_datos f ON f.id = c.fuente_id
         LEFT JOIN LATERAL (
           SELECT * FROM nucleo.ejecuciones_etl WHERE conjunto_id = c.id ORDER BY id DESC LIMIT 1
         ) e ON true
         ORDER BY c.id`,
      ),

    ejecuciones: ({ despues = null, limite }) =>
      filas(
        `SELECT id, conjunto_id, origen_archivo, nombre_archivo, huella_archivo, formato, tamano_bytes,
                encolada_en, iniciada_en, finalizada_en, estado, filas_leidas, filas_validas, filas_rechazadas,
                duplicados, en_revision, alertas, filas_confirmadas, duracion_ms, memoria_maxima_mb, mensaje
         FROM nucleo.ejecuciones_etl
         WHERE $1::bigint IS NULL OR id < $1
         ORDER BY id DESC
         LIMIT $2`,
        [despues, limite],
      ),

    reportes: ({ despues = null, limite, departamento = null, alerta = null }) =>
      filas(
        `SELECT r.municipio_codigo, m.nombre AS municipio, m.departamento_codigo, d.nombre AS departamento,
                r.fecha_reporte, r.alertas, r.ejecucion_id,
                (SELECT coalesce(jsonb_object_agg(v.variable_codigo, v.valor), '{}'::jsonb)
                 FROM nucleo.valores_reporte_municipal v WHERE v.reporte_id = r.id) AS valores
         FROM nucleo.reportes_municipales r
         JOIN analitica.ejecuciones_vigentes vigente ON vigente.ejecucion_id = r.ejecucion_id
         JOIN nucleo.municipios m ON m.codigo = r.municipio_codigo
         JOIN nucleo.departamentos d ON d.codigo = m.departamento_codigo
         WHERE ($1::text IS NULL OR r.municipio_codigo > $1)
           AND ($2::text IS NULL OR m.departamento_codigo = $2)
           AND ($3::text IS NULL OR $3 = ANY (r.alertas))
         ORDER BY r.municipio_codigo
         LIMIT $4`,
        [despues, departamento, alerta, limite],
      ),

    resumenDeCalidad: async () =>
      (
        await filas(
          `SELECT count(*) AS municipios,
                  count(*) FILTER (WHERE r.fecha_reporte IS NULL) AS sin_fecha,
                  count(*) FILTER (WHERE 'PERSONAS_MENOR_QUE_FAMILIAS' = ANY (r.alertas)) AS personas_menor_que_familias,
                  count(*) FILTER (WHERE 'FECHA_REPORTE_INVALIDA' = ANY (r.alertas)) AS fecha_invalida,
                  max(e.id) AS ejecucion_id,
                  max(e.filas_leidas) AS filas_leidas,
                  max(e.finalizada_en) AS finalizada_en
           FROM nucleo.reportes_municipales r
           JOIN analitica.ejecuciones_vigentes vigente ON vigente.ejecucion_id = r.ejecucion_id
           JOIN nucleo.ejecuciones_etl e ON e.id = r.ejecucion_id`,
        )
      )[0],

    valoresPresentes: () =>
      filas(
        `SELECT vt.codigo, vt.nombre, count(v.reporte_id) AS con_valor
         FROM nucleo.variables_territoriales vt
         LEFT JOIN (
           nucleo.valores_reporte_municipal v
           JOIN nucleo.reportes_municipales r ON r.id = v.reporte_id
           JOIN analitica.ejecuciones_vigentes vigente ON vigente.ejecucion_id = r.ejecucion_id
         ) ON v.variable_codigo = vt.codigo
         GROUP BY vt.codigo, vt.nombre, vt.orden
         ORDER BY vt.orden`,
      ),

    async actualizarFuente(id, cambios, usuarioId) {
      const cliente = await grupo.connect();
      try {
        await cliente.query('BEGIN');
        const actual = await cliente.query(
          `SELECT ${COLUMNAS_DE_FUENTE} FROM nucleo.fuentes_datos WHERE id = $1 FOR UPDATE`,
          [id],
        );
        if (actual.rowCount === 0) {
          await cliente.query('ROLLBACK');
          return null;
        }
        const campos = Object.keys(cambios);
        const asignaciones = campos.map(
          (campo, indice) => `${COLUMNAS_EDITABLES_DE_FUENTE[campo]} = $${indice + 2}`,
        );
        const actualizada = await cliente.query(
          `UPDATE nucleo.fuentes_datos SET ${asignaciones.join(', ')}, actualizado_en = now()
           WHERE id = $1 RETURNING ${COLUMNAS_DE_FUENTE}`,
          [id, ...campos.map((campo) => cambios[campo])],
        );
        const antes = Object.fromEntries(
          campos.map((campo) => [campo, actual.rows[0][COLUMNAS_EDITABLES_DE_FUENTE[campo]]]),
        );
        await cliente.query('SELECT seguridad.registrar_auditoria($1, $2, $3, $4, $5, $6)', [
          usuarioId,
          'ACTUALIZAR',
          'fuente',
          id,
          JSON.stringify(antes),
          JSON.stringify(cambios),
        ]);
        await cliente.query('COMMIT');
        return actualizada.rows[0];
      } catch (error) {
        await cliente.query('ROLLBACK');
        throw error;
      } finally {
        cliente.release();
      }
    },

    auditoria: ({ despues = null, limite, entidades = null }) =>
      filas(
        `SELECT a.id, a.accion, a.entidad, a.entidad_id, a.antes, a.despues, a.ocurrido_en,
                u.nombre AS usuario, u.correo
         FROM seguridad.auditoria a
         LEFT JOIN seguridad.usuarios u ON u.id = a.usuario_id
         WHERE ($1::bigint IS NULL OR a.id < $1)
           AND ($3::text[] IS NULL OR a.entidad = ANY ($3))
         ORDER BY a.id DESC
         LIMIT $2`,
        [despues, limite, entidades],
      ),
  };
}
