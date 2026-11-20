const IDENTIFICADOR = /^[a-z_]+(\.[a-z_]+)?$/;
const FILAS_POR_LOTE = 500;

function comprobarIdentificador(nombre) {
  if (!IDENTIFICADOR.test(nombre)) {
    throw new Error(`Identificador SQL no permitido: ${nombre}`);
  }
  return nombre;
}

function marcadores(cantidadFilas, cantidadColumnas) {
  return Array.from({ length: cantidadFilas }, (_, fila) => {
    const posiciones = Array.from(
      { length: cantidadColumnas },
      (__, columna) => `$${fila * cantidadColumnas + columna + 1}`,
    );
    return `(${posiciones.join(', ')})`;
  }).join(', ');
}

export async function insertarFilas(cliente, tabla, columnas, filas, { retornar = [] } = {}) {
  comprobarIdentificador(tabla);
  [...columnas, ...retornar].forEach(comprobarIdentificador);
  const retorno = retornar.length > 0 ? ` RETURNING ${retornar.join(', ')}` : '';
  const devueltas = [];
  for (let inicio = 0; inicio < filas.length; inicio += FILAS_POR_LOTE) {
    const lote = filas.slice(inicio, inicio + FILAS_POR_LOTE);
    const consulta = `INSERT INTO ${tabla} (${columnas.join(', ')}) VALUES ${marcadores(lote.length, columnas.length)}${retorno}`;
    const { rows } = await cliente.query(consulta, lote.flat());
    devueltas.push(...rows);
  }
  return devueltas;
}
