import { crearComparador } from '../../backend/src/algorithms/duplicados.js';

const DECIMALES = 10_000;

export function crearDetectorDeDuplicados(destino, configuracion) {
  if (!destino.duplicados || !configuracion) {
    return null;
  }
  const reglas = destino.duplicados;
  const comparar = crearComparador({
    campos: reglas.campos(configuracion.pesos),
    minimo: configuracion.umbral_revision,
  });
  const [columnaNueva, columnaCandidata] = reglas.columnas;
  const insertarPares = `
    INSERT INTO staging.revision_duplicados
      (ejecucion_id, destino, ${columnaNueva}, ${columnaCandidata}, similitud, motivo, detalle)
    SELECT $1, $2, x.nuevo, x.candidato, x.similitud, x.motivo, x.detalle
    FROM unnest($3::bigint[], $4::bigint[], $5::numeric[], $6::text[], $7::jsonb[])
      AS x(nuevo, candidato, similitud, motivo, detalle)
    ON CONFLICT DO NOTHING`;
  const marcarEnRevision = `
    UPDATE ${destino.tablaDeRegistros}
    SET estado = 'EN_REVISION', actualizado_en = now()
    WHERE id = ANY ($1::bigint[]) AND estado = 'VIGENTE'`;

  return async function detectar(cliente, { ejecucionId, ids }) {
    if (ids.length === 0) {
      return { enRevision: 0, pares: 0, comparaciones: 0 };
    }
    const { rows } = await cliente.query(reglas.consultaDeCandidatos, [ids]);
    const pares = [];
    for (const fila of rows) {
      const nuevo = reglas.nuevo(fila);
      const candidato = reglas.candidato(fila);
      const { valor, detalle } = comparar(nuevo, candidato);
      if (valor >= configuracion.umbral_revision) {
        pares.push({
          nuevo: nuevo.id,
          candidato: candidato.id,
          similitud: Math.round(valor * DECIMALES) / DECIMALES,
          motivo:
            reglas.claveNatural(nuevo) === reglas.claveNatural(candidato) ? 'CLAVE_NATURAL' : 'SIMILITUD',
          detalle: JSON.stringify({ ...detalle, confirmado: valor >= configuracion.umbral_duplicado }),
        });
      }
    }
    if (pares.length === 0) {
      return { enRevision: 0, pares: 0, comparaciones: rows.length };
    }
    await cliente.query(insertarPares, [
      ejecucionId,
      destino.nombre,
      pares.map(({ nuevo }) => nuevo),
      pares.map(({ candidato }) => candidato),
      pares.map(({ similitud }) => similitud),
      pares.map(({ motivo }) => motivo),
      pares.map(({ detalle }) => detalle),
    ]);
    const enRevision = [...new Set(pares.map(({ nuevo }) => nuevo))];
    const { rowCount } = await cliente.query(marcarEnRevision, [enRevision]);
    return { enRevision: rowCount, pares: pares.length, comparaciones: rows.length };
  };
}
