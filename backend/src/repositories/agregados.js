const FILAS_POR_SENTENCIA = 5000;
const CLASE_DE_CANDADO = 41_007;
const CANDADO_POR_DESTINO = Object.freeze({ personas: 1, viviendas: 2 });

export const claveDeCandado = (destino) => [CLASE_DE_CANDADO, CANDADO_POR_DESTINO[destino]];

export async function bloquearAgregados(cliente, destino) {
  await cliente.query('SELECT pg_advisory_xact_lock($1, $2)', claveDeCandado(destino));
}

const SUMAR = `
  INSERT INTO analitica.agregados (evento_id, origen, destino, nivel, territorio, dimension, categoria, cantidad, suma)
  SELECT $1, $2, $3, x.nivel, x.territorio, x.dimension, x.categoria, x.cantidad, x.suma
  FROM unnest($4::text[], $5::text[], $6::text[], $7::text[], $8::bigint[], $9::numeric[])
    AS x(nivel, territorio, dimension, categoria, cantidad, suma)
  ON CONFLICT (evento_id, origen, destino, nivel, territorio, dimension, categoria)
  DO UPDATE SET cantidad = analitica.agregados.cantidad + EXCLUDED.cantidad,
                suma = analitica.agregados.suma + EXCLUDED.suma,
                actualizado_en = now()`;

export async function sumarAgregados(cliente, { eventoId, origen, destino, celdas }) {
  for (let inicio = 0; inicio < celdas.length; inicio += FILAS_POR_SENTENCIA) {
    const tramo = celdas.slice(inicio, inicio + FILAS_POR_SENTENCIA);
    await cliente.query(SUMAR, [
      eventoId,
      origen,
      destino,
      tramo.map(({ nivel }) => nivel),
      tramo.map(({ territorio }) => territorio),
      tramo.map(({ dimension }) => dimension),
      tramo.map(({ categoria }) => categoria),
      tramo.map(({ cantidad }) => cantidad),
      tramo.map(({ suma }) => suma),
    ]);
  }
  return celdas.length;
}
