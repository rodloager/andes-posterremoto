const ORIGEN = 'SIMULADO';

export function crearRepositorioRegistros(grupo) {
  const filas = async (consulta, parametros = []) => (await grupo.query(consulta, parametros)).rows;

  return {
    existeEvento: async (evento) =>
      (await filas('SELECT 1 FROM analitica.eventos WHERE codigo = $1', [evento])).length > 0,

    agregados: (evento, destino) =>
      filas(
        `SELECT nivel, territorio, dimension, categoria, cantidad, suma, actualizado_en
         FROM analitica.agregados_publicables
         WHERE evento = $1 AND destino = $2 AND origen = $3 AND dimension NOT IN ('cubo', 'estado_ocupacion')`,
        [evento, destino, ORIGEN],
      ),

    cruces: (evento) =>
      filas(
        `SELECT nivel, territorio, dimension_fila, categoria_fila, dimension_columna, categoria_columna, cantidad
         FROM analitica.cruces_publicables
         WHERE evento = $1 AND origen = $2`,
        [evento, ORIGEN],
      ),

    categorias: (destino) =>
      filas(
        `SELECT dimension, categoria, nombre, orden, afectada, exige_seguro
         FROM analitica.categorias_de_registros
         WHERE destino = $1
         ORDER BY dimension, orden`,
        [destino],
      ),

    departamentos: () =>
      filas(
        `SELECT DISTINCT departamento_codigo AS codigo, departamento AS nombre
         FROM analitica.municipios
         ORDER BY departamento_codigo`,
      ),
  };
}
