export function crearRepositorioEstadisticas(grupo) {
  const filas = async (sql, parametros = []) => (await grupo.query(sql, parametros)).rows;
  const primera = async (sql, parametros) => (await filas(sql, parametros))[0] ?? null;

  return {
    evento: (codigo) =>
      primera('SELECT id, codigo, nombre FROM nucleo.eventos_sismicos WHERE codigo = $1', [codigo]),

    departamento: (codigo) =>
      primera('SELECT codigo, nombre FROM nucleo.departamentos WHERE codigo = $1', [codigo]),

    municipio: (codigo) =>
      primera(
        'SELECT codigo, nombre, departamento_codigo, departamento FROM analitica.municipios WHERE codigo = $1',
        [codigo],
      ),

    agregados: ({ eventoId, origen, destino, nivel, territorio }) =>
      filas(
        `SELECT dimension, categoria, cantidad, suma, actualizado_en
         FROM analitica.agregados
         WHERE evento_id = $1 AND origen = $2 AND destino = $3 AND nivel = $4 AND territorio = $5`,
        [eventoId, origen, destino, nivel, territorio],
      ),

    zonasConReporte: (evento) =>
      filas(
        `SELECT DISTINCT ON (municipio_codigo)
                municipio_codigo AS codigo, municipio AS nombre, departamento_codigo, departamento
         FROM analitica.reportes_municipales
         WHERE evento = $1
         ORDER BY municipio_codigo, fecha_reporte DESC NULLS LAST`,
        [evento],
      ),

    valoresTerritoriales: (evento, variables) =>
      filas(
        `SELECT municipio_codigo, variable_codigo, valor
         FROM analitica.valores_municipales
         WHERE evento = $1 AND variable_codigo = ANY ($2::text[])`,
        [evento, variables],
      ),

    agregadosMunicipales: ({ eventoId, origen, destino, dimension, categoria }) =>
      filas(
        `SELECT territorio, dimension, cantidad
         FROM analitica.agregados
         WHERE evento_id = $1 AND origen = $2 AND destino = $3 AND nivel = 'MUNICIPIO'
           AND ((dimension = $4 AND categoria = $5) OR (dimension = 'total' AND categoria = 'TOTAL'))`,
        [eventoId, origen, destino, dimension, categoria],
      ),
  };
}
