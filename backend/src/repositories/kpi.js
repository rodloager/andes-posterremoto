export function crearRepositorioKpi(grupo) {
  const filas = async (consulta, parametros = []) => (await grupo.query(consulta, parametros)).rows;

  return {
    categorias: () =>
      filas(
        `SELECT destino, dimension, categoria, nombre, orden, afectada, exige_seguro
         FROM analitica.categorias_de_registros
         ORDER BY destino, dimension, orden`,
      ),

    existeEvento: async (evento) =>
      (await filas('SELECT 1 FROM analitica.eventos WHERE codigo = $1', [evento])).length > 0,

    nombresDeIndicadores: (codigos) =>
      filas('SELECT codigo, nombre, unidad FROM analitica.indicadores WHERE codigo = ANY($1::text[])', [
        codigos,
      ]),

    valoresIndicador: (evento, codigos) =>
      filas(
        `SELECT indicador_codigo, fecha_corte, valor, calificador, fuente_id
         FROM analitica.valores_indicador
         WHERE evento = $1 AND indicador_codigo = ANY($2::text[])
         ORDER BY indicador_codigo, fecha_corte, fuente_id`,
        [evento, codigos],
      ),

    valoresMunicipales: (evento, variables) =>
      filas(
        `SELECT municipio_codigo, variable_codigo, valor
         FROM analitica.valores_municipales
         WHERE evento = $1 AND variable_codigo = ANY($2::text[])
         ORDER BY municipio_codigo, variable_codigo`,
        [evento, variables],
      ),

    cargaTerritorial: async (evento) =>
      (
        await filas('SELECT fuente_id, hasta FROM analitica.carga_territorial WHERE evento = $1', [evento])
      )[0] ?? null,

    agregadosNacionales: (evento) =>
      filas(
        `SELECT origen, destino, nivel, territorio, dimension, categoria, cantidad, suma, actualizado_en
         FROM analitica.agregados_publicables
         WHERE evento = $1 AND nivel = 'NACIONAL'`,
        [evento],
      ),

    crucesNacionales: (evento) =>
      filas(
        `SELECT origen, nivel, territorio, dimension_fila, categoria_fila, dimension_columna, categoria_columna, cantidad
         FROM analitica.cruces_publicables
         WHERE evento = $1 AND nivel = 'NACIONAL'`,
        [evento],
      ),
  };
}
