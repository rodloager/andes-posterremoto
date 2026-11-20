import { normalizarDireccion } from '../../backend/src/algorithms/texto.js';
import { copiarFilas } from '../cargadores/copia.js';

const COLUMNAS_STAGING = [
  'ejecucion_id',
  'lote',
  'numero_fila',
  'predio_hmac',
  'direccion_normalizada',
  'municipio_codigo',
  'zona',
  'estrato',
  'ocupacion',
  'avaluo',
  'estado_fisico',
  'fecha_evaluacion',
  'costo_estimado',
  'financiacion',
  'saldo',
  'aseguramiento',
  'valor_asegurado',
  'reclamacion',
  'valor_reclamado',
  'valor_aprobado',
  'alertas',
  'clave_bloque',
  'capturado_en',
];

const PALABRAS_DEL_BLOQUE = 2;
const NUMERO_DE_DIRECCION = /^\d+[A-Z]?$/;

export function separarDireccion(direccion) {
  const palabras = direccion.split(' ');
  return {
    numeros: palabras.filter((palabra) => NUMERO_DE_DIRECCION.test(palabra)).join(' '),
    texto: palabras.filter((palabra) => !NUMERO_DE_DIRECCION.test(palabra)).join(' '),
  };
}

const INSERTAR_LOTE = `
  INSERT INTO nucleo.viviendas (
    evento_id, predio_hmac, direccion_normalizada, municipio_codigo, zona, estrato, condicion_ocupacion_id,
    avaluo_cop, alertas, clave_bloque, origen_dato, ejecucion_id, numero_fila, capturado_en)
  SELECT $3, s.predio_hmac, s.direccion_normalizada, s.municipio_codigo, s.zona, s.estrato, co.id,
         s.avaluo, s.alertas, s.clave_bloque, $4, s.ejecucion_id, s.numero_fila, s.capturado_en
  FROM staging.viviendas s
  LEFT JOIN nucleo.condiciones_ocupacion co ON co.codigo = s.ocupacion
  WHERE s.ejecucion_id = $1 AND s.lote = $2
  ORDER BY s.numero_fila
  ON CONFLICT (evento_id, predio_hmac) DO NOTHING
  RETURNING id, numero_fila`;

const INSERTAR_ASEGURAMIENTOS = `
  INSERT INTO nucleo.aseguramiento (vivienda_id, condicion_aseguramiento_id, valor_asegurado_cop, verificado_en)
  SELECT * FROM unnest($1::bigint[], $2::smallint[], $3::numeric[], $4::date[])
  RETURNING id, vivienda_id`;

const INSERTAR_RECLAMACIONES = `
  INSERT INTO nucleo.reclamaciones (aseguramiento_id, estado, valor_reclamado_cop, valor_aprobado_cop)
  SELECT * FROM unnest($1::bigint[], $2::text[], $3::numeric[], $4::numeric[])
  RETURNING id, aseguramiento_id`;

const RECLAMACIONES_PRESENTADAS = new Set(['EN_ESTUDIO', 'APROBADA', 'RECHAZADA', 'PAGADA']);
const RECLAMACIONES_APROBADAS = new Set(['APROBADA', 'PAGADA']);

const porCodigo = (filas) => new Map(filas.map(({ id, codigo }) => [codigo, id]));

async function insertarDependientes(cliente, { insertadas, filas, catalogos }) {
  const registroPorFila = new Map(filas.map(({ numero, registro }) => [numero, registro]));
  const viviendas = insertadas.map(({ id, numero_fila: numero }) => ({
    id,
    registro: registroPorFila.get(numero),
  }));
  await copiarFilas(
    cliente,
    'nucleo.afectaciones_vivienda',
    ['vivienda_id', 'estado_fisico_id', 'fecha_evaluacion', 'costo_estimado_cop'],
    viviendas.map(({ id, registro }) => [
      id,
      catalogos.estados.get(registro.estado_fisico),
      registro.fecha_evaluacion,
      registro.costo_estimado,
    ]),
  );
  await copiarFilas(
    cliente,
    'nucleo.financiacion_vivienda',
    ['vivienda_id', 'tipo_financiacion_id', 'saldo_cop', 'verificado_en'],
    viviendas.map(({ id, registro }) => [
      id,
      catalogos.financiaciones.get(registro.financiacion),
      registro.saldo,
      registro.capturado_en,
    ]),
  );
  const { rows: aseguramientos } = await cliente.query(INSERTAR_ASEGURAMIENTOS, [
    viviendas.map(({ id }) => id),
    viviendas.map(({ registro }) => catalogos.aseguramientos.get(registro.aseguramiento)),
    viviendas.map(({ registro }) => registro.valor_asegurado),
    viviendas.map(({ registro }) => registro.capturado_en),
  ]);
  const registroPorVivienda = new Map(viviendas.map(({ id, registro }) => [id, registro]));
  const reclamadas = aseguramientos
    .map(({ id, vivienda_id: vivienda }) => ({ id, registro: registroPorVivienda.get(vivienda) }))
    .filter(({ registro }) => RECLAMACIONES_PRESENTADAS.has(registro.reclamacion));
  if (reclamadas.length === 0) {
    return;
  }
  const { rows: reclamaciones } = await cliente.query(INSERTAR_RECLAMACIONES, [
    reclamadas.map(({ id }) => id),
    reclamadas.map(({ registro }) => (registro.reclamacion === 'PAGADA' ? 'APROBADA' : registro.reclamacion)),
    reclamadas.map(({ registro }) => registro.valor_reclamado),
    reclamadas.map(({ registro }) => registro.valor_aprobado),
  ]);
  const registroPorAseguramiento = new Map(reclamadas.map(({ id, registro }) => [id, registro]));
  await copiarFilas(
    cliente,
    'nucleo.indemnizaciones',
    ['reclamacion_id', 'valor_cop', 'estado'],
    reclamaciones
      .map(({ id, aseguramiento_id: aseguramiento }) => ({
        id,
        registro: registroPorAseguramiento.get(aseguramiento),
      }))
      .filter(({ registro }) => RECLAMACIONES_APROBADAS.has(registro.reclamacion))
      .map(({ id, registro }) => [
        id,
        registro.valor_aprobado,
        registro.reclamacion === 'PAGADA' ? 'PAGADA' : 'PENDIENTE',
      ]),
  );
}

const CANDIDATOS = `
  SELECT n.id AS nuevo_id, n.direccion_normalizada AS nueva_direccion, n.zona AS nueva_zona,
         c.id AS candidato_id, c.direccion_normalizada AS candidata_direccion, c.zona AS candidata_zona
  FROM nucleo.viviendas n
  JOIN nucleo.viviendas c
    ON c.evento_id = n.evento_id AND c.clave_bloque = n.clave_bloque AND c.id < n.id AND c.estado <> 'FUSIONADO'
  WHERE n.id = ANY ($1::bigint[])
  ORDER BY n.id, c.id`;

export const destinoViviendas = Object.freeze({
  nombre: 'viviendas',
  tablaDeRegistros: 'nucleo.viviendas',

  crearPreparador() {
    return function preparar(valores, { seudonimo }) {
      const direccion = normalizarDireccion(valores.direccion);
      if (!direccion) {
        return {
          errores: [
            {
              campo: 'direccion',
              codigo: 'OBLIGATORIO',
              mensaje: 'La dirección no tiene letras ni números.',
            },
          ],
        };
      }
      const bloque = direccion.split(' ').slice(0, PALABRAS_DEL_BLOQUE).join(' ');
      return {
        registro: {
          predio_hmac: seudonimo(valores.predio),
          direccion_normalizada: direccion,
          municipio_codigo: valores.municipio,
          zona: valores.zona,
          estrato: valores.estrato,
          ocupacion: valores.ocupacion,
          avaluo: valores.avaluo,
          estado_fisico: valores.estado_fisico,
          fecha_evaluacion: valores.fecha_evaluacion,
          costo_estimado: valores.costo_estimado,
          financiacion: valores.financiacion,
          saldo: valores.saldo,
          aseguramiento: valores.aseguramiento,
          valor_asegurado: valores.valor_asegurado,
          reclamacion: valores.reclamacion,
          valor_reclamado: valores.valor_reclamado,
          valor_aprobado: valores.valor_aprobado,
          clave_bloque: `${valores.municipio}|${bloque}`,
          capturado_en: valores.fecha_registro,
        },
      };
    };
  },

  async cargarCatalogos(cliente) {
    const estados = await cliente.query('SELECT id, codigo FROM nucleo.estados_fisicos');
    const financiaciones = await cliente.query('SELECT id, codigo FROM nucleo.tipos_financiacion');
    const aseguramientos = await cliente.query('SELECT id, codigo FROM nucleo.condiciones_aseguramiento');
    return {
      estados: porCodigo(estados.rows),
      financiaciones: porCodigo(financiaciones.rows),
      aseguramientos: porCodigo(aseguramientos.rows),
    };
  },

  async cargarLote(cliente, { ejecucionId, lote, eventoId, origen, filas, catalogos }) {
    await copiarFilas(
      cliente,
      'staging.viviendas',
      COLUMNAS_STAGING,
      filas.map(({ numero, registro, alertas }) => [
        ejecucionId,
        lote,
        numero,
        registro.predio_hmac,
        registro.direccion_normalizada,
        registro.municipio_codigo,
        registro.zona,
        registro.estrato,
        registro.ocupacion,
        registro.avaluo,
        registro.estado_fisico,
        registro.fecha_evaluacion,
        registro.costo_estimado,
        registro.financiacion,
        registro.saldo,
        registro.aseguramiento,
        registro.valor_asegurado,
        registro.reclamacion,
        registro.valor_reclamado,
        registro.valor_aprobado,
        alertas,
        registro.clave_bloque,
        registro.capturado_en,
      ]),
    );
    const { rows } = await cliente.query(INSERTAR_LOTE, [ejecucionId, lote, eventoId, origen]);
    await cliente.query('DELETE FROM staging.viviendas WHERE ejecucion_id = $1 AND lote = $2', [
      ejecucionId,
      lote,
    ]);
    if (rows.length > 0) {
      await insertarDependientes(cliente, { insertadas: rows, filas, catalogos });
    }
    return rows;
  },

  duplicados: Object.freeze({
    consultaDeCandidatos: CANDIDATOS,
    campos: (pesos) => [
      { nombre: 'numeros', peso: pesos.numeros ?? 0.5, tipo: 'exacto' },
      { nombre: 'texto', peso: pesos.texto ?? 0.4, tipo: 'texto' },
      { nombre: 'zona', peso: pesos.zona ?? 0.1, tipo: 'exacto' },
    ],
    nuevo: (fila) => ({
      id: fila.nuevo_id,
      direccion: fila.nueva_direccion,
      ...separarDireccion(fila.nueva_direccion),
      zona: fila.nueva_zona,
    }),
    candidato: (fila) => ({
      id: fila.candidato_id,
      direccion: fila.candidata_direccion,
      ...separarDireccion(fila.candidata_direccion),
      zona: fila.candidata_zona,
    }),
    claveNatural: (registro) => registro.direccion,
    columnas: ['vivienda_id', 'vivienda_candidata_id'],
  }),
});
