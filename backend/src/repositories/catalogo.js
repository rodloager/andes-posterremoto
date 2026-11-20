export function crearRepositorioCatalogo(grupo) {
  const filas = async (consulta, parametros = []) => (await grupo.query(consulta, parametros)).rows;
  const primera = async (consulta, parametros) => (await filas(consulta, parametros))[0] ?? null;

  return {
    comprobar: () => primera('SELECT 1 AS disponible'),

    fuentes: () =>
      filas(
        `SELECT id, entidad, sigla, nombre, origen, nivel, tipo_acceso, enlace, leido_en,
                fecha_publicacion, fecha_consulta, cobertura, variables, limitaciones, uso
         FROM analitica.fuentes
         ORDER BY orden`,
      ),

    eventos: () => filas('SELECT codigo, nombre, fecha FROM analitica.eventos ORDER BY fecha DESC'),

    evento: (codigo) => primera('SELECT * FROM analitica.eventos WHERE codigo = $1', [codigo]),

    parametrosEvento: (evento) =>
      filas(
        `SELECT orden, parametro, fuente_id, valor
         FROM analitica.parametros_evento
         WHERE evento = $1
         ORDER BY orden, posicion`,
        [evento],
      ),

    normasEvento: (evento) =>
      filas('SELECT nombre, contenido FROM analitica.normas_evento WHERE evento = $1 ORDER BY orden', [
        evento,
      ]),

    indicadores: (codigo = null) =>
      filas(
        `SELECT codigo, nombre, descripcion, unidad, es_acumulado, es_derivado, motivo_sin_dato
         FROM analitica.indicadores
         WHERE $1::text IS NULL OR codigo = $1
         ORDER BY orden`,
        [codigo],
      ),

    municipios: () =>
      filas(
        'SELECT codigo, nombre, departamento_codigo, departamento FROM analitica.municipios ORDER BY codigo',
      ),

    valoresIndicador: (evento, codigo = null) =>
      filas(
        `SELECT indicador_codigo, fecha_corte, valor, calificador, nota, fuente_id
         FROM analitica.valores_indicador
         WHERE evento = $1 AND ($2::text IS NULL OR indicador_codigo = $2)
         ORDER BY indicador_codigo, fecha_corte`,
        [evento, codigo],
      ),

    variablesTerritoriales: () =>
      filas('SELECT codigo, nombre, unidad FROM analitica.variables_territoriales ORDER BY orden'),

    cargaTerritorial: (evento) =>
      primera('SELECT * FROM analitica.carga_territorial WHERE evento = $1', [evento]),

    alertasTerritoriales: (evento) =>
      filas(
        'SELECT alerta, municipios FROM analitica.alertas_territoriales WHERE evento = $1 ORDER BY alerta',
        [evento],
      ),

    agregados: (evento) =>
      filas(
        `SELECT nivel, departamento_codigo, variable_codigo, valor
         FROM analitica.afectacion_agregada
         WHERE evento = $1`,
        [evento],
      ),

    resumenDepartamental: (evento, departamento = null) =>
      filas(
        `SELECT departamento_codigo, departamento, municipios_con_reporte, ultimo_reporte
         FROM analitica.resumen_departamental
         WHERE evento = $1 AND ($2::text IS NULL OR departamento_codigo = $2)
         ORDER BY departamento_codigo`,
        [evento, departamento],
      ),

    reportesMunicipales: (evento, departamento = null) =>
      filas(
        `SELECT municipio_codigo, municipio, departamento_codigo, fecha_reporte, alertas
         FROM analitica.reportes_municipales
         WHERE evento = $1 AND ($2::text IS NULL OR departamento_codigo = $2)
         ORDER BY municipio_codigo`,
        [evento, departamento],
      ),

    valoresMunicipales: (evento, departamento = null) =>
      filas(
        `SELECT municipio_codigo, variable_codigo, valor
         FROM analitica.valores_municipales
         WHERE evento = $1 AND ($2::text IS NULL OR departamento_codigo = $2)`,
        [evento, departamento],
      ),

    reclamacionesDepartamento: (evento) =>
      filas(
        `SELECT departamento_codigo, departamento, fecha_corte, fuente_id, siniestros, pagos, valor_estimado
         FROM analitica.reclamaciones_departamento
         WHERE evento = $1
         ORDER BY siniestros DESC`,
        [evento],
      ),

    reclamacionesRamo: (evento) =>
      filas(
        `SELECT ramo, fecha_corte, fuente_id, reclamaciones, reserva
         FROM analitica.reclamaciones_ramo
         WHERE evento = $1
         ORDER BY orden`,
        [evento],
      ),

    partidasEconomicas: (evento) =>
      filas(
        `SELECT tipo, concepto, valor, calificador, fecha_corte, fuente_id
         FROM analitica.partidas_economicas
         WHERE evento = $1
         ORDER BY tipo, orden`,
        [evento],
      ),

    medicionesContratacion: (evento) =>
      filas(
        `SELECT concepto, contratos, valor, contratacion_directa, periodo, fuente_id
         FROM analitica.mediciones_contratacion
         WHERE evento = $1
         ORDER BY orden`,
        [evento],
      ),
  };
}
