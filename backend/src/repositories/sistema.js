const TABLAS_CONTADAS = Object.freeze([
  'nucleo.departamentos',
  'nucleo.municipios',
  'nucleo.fuentes_datos',
  'nucleo.valores_indicador',
  'nucleo.reportes_municipales',
  'nucleo.valores_reporte_municipal',
  'nucleo.ejecuciones_etl',
  'nucleo.personas_afectadas',
  'nucleo.viviendas',
  'staging.filas_rechazadas',
  'staging.revision_duplicados',
  'analitica.agregados',
  'seguridad.usuarios',
  'seguridad.sesiones',
  'seguridad.registro_accesos',
  'seguridad.auditoria',
]);

const CONSULTA_DE_CONTEOS = TABLAS_CONTADAS.map(
  (tabla) => `SELECT '${tabla}' AS tabla, count(*) AS filas FROM ${tabla}`,
).join(' UNION ALL ');

export function crearRepositorioSistema(grupo) {
  const filas = async (consulta, parametros = []) => (await grupo.query(consulta, parametros)).rows;

  return {
    async comprobar() {
      const inicio = performance.now();
      const [fila] = await filas(
        `SELECT current_setting('server_version') AS version,
                pg_database_size(current_database()) AS tamano`,
      );
      return { ...fila, latenciaMs: performance.now() - inicio };
    },

    conteos: () => filas(CONSULTA_DE_CONTEOS),

    fuentes: () =>
      filas(
        `SELECT id, coalesce(sigla, entidad) AS nombre, origen, fecha_consulta, actualizado_en,
                current_date - fecha_consulta AS dias_desde_consulta
         FROM nucleo.fuentes_datos
         WHERE uso = 'indicadores'
         ORDER BY fecha_consulta NULLS LAST, orden`,
      ),

    accesos: ({ despues = null, limite }) =>
      filas(
        `SELECT a.id, a.correo_intentado, host(a.ip) AS ip, a.exitoso, a.motivo, a.ocurrido_en,
                u.nombre AS usuario
         FROM seguridad.registro_accesos a
         LEFT JOIN seguridad.usuarios u ON u.id = a.usuario_id
         WHERE $1::bigint IS NULL OR a.id < $1
         ORDER BY a.id DESC
         LIMIT $2`,
        [despues, limite],
      ),

    verificarAuditoria: async () => (await filas('SELECT * FROM seguridad.verificar_auditoria()'))[0],
  };
}
