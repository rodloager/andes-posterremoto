import { VARIABLES } from '../../etl/transformadores/afectaciones.js';
import { insertarFilas } from './insercion.js';

export const CONJUNTO_AFECTACIONES = Object.freeze({
  id: 'dane-afectaciones',
  nombre: 'Afectación por municipio',
  descripcion: 'Reporte de afectación del sismo por municipio publicado en el servicio geográfico del DANE.',
  fuenteId: 'dane-afectaciones',
});

const posicion = (indice) => indice + 1;

export async function sembrarFuentes(cliente, fuentes) {
  await insertarFilas(
    cliente,
    'nucleo.fuentes_datos',
    [
      'id',
      'orden',
      'entidad',
      'sigla',
      'nombre',
      'origen',
      'nivel',
      'tipo_acceso',
      'enlace',
      'leido_en',
      'fecha_publicacion',
      'fecha_consulta',
      'cobertura',
      'variables',
      'limitaciones',
      'uso',
    ],
    fuentes.map((fuente, indice) => [
      fuente.id,
      posicion(indice),
      fuente.entidad,
      fuente.sigla ?? null,
      fuente.nombre,
      fuente.origen,
      fuente.nivel,
      fuente.tipoAcceso,
      fuente.enlace,
      fuente.leidoEn ?? null,
      fuente.fechaPublicacion,
      fuente.fechaConsulta,
      fuente.cobertura,
      fuente.variables,
      fuente.limitaciones,
      fuente.uso,
    ]),
  );
  return fuentes.length;
}

export async function sembrarVariablesTerritoriales(cliente) {
  await insertarFilas(
    cliente,
    'nucleo.variables_territoriales',
    ['codigo', 'orden', 'nombre', 'unidad'],
    VARIABLES.map(({ codigo, nombre, unidad }, indice) => [codigo, posicion(indice), nombre, unidad]),
  );
  return VARIABLES.length;
}

function filasDeParametros(eventoId, parametros) {
  return parametros.flatMap(({ nombre, valores }, orden) =>
    valores.map(({ fuente, valor }, lugar) => [
      eventoId,
      posicion(orden),
      posicion(lugar),
      nombre,
      fuente,
      valor,
    ]),
  );
}

export async function sembrarEvento(cliente, evento) {
  const { rows } = await cliente.query(
    `INSERT INTO nucleo.eventos_sismicos
       (codigo, nombre, fecha, municipio_epicentro, latitud, longitud, fuente_coordenadas)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [
      evento.codigo,
      evento.nombre,
      evento.fecha,
      evento.epicentro.codigoMunicipio,
      evento.coordenadas.latitud,
      evento.coordenadas.longitud,
      evento.coordenadas.fuente,
    ],
  );
  const [{ id }] = rows;
  await insertarFilas(
    cliente,
    'nucleo.parametros_evento',
    ['evento_id', 'orden', 'posicion', 'parametro', 'fuente_id', 'valor'],
    filasDeParametros(id, evento.parametros),
  );
  await insertarFilas(
    cliente,
    'nucleo.normas_evento',
    ['evento_id', 'orden', 'nombre', 'contenido'],
    evento.normas.map(({ nombre, contenido }, indice) => [id, posicion(indice), nombre, contenido]),
  );
  return id;
}

export async function sembrarIndicadores(cliente, eventoId, indicadores) {
  await insertarFilas(
    cliente,
    'nucleo.indicadores',
    ['codigo', 'orden', 'nombre', 'descripcion', 'unidad', 'es_acumulado', 'es_derivado', 'motivo_sin_dato'],
    indicadores.map((indicador, indice) => [
      indicador.codigo,
      posicion(indice),
      indicador.nombre,
      indicador.descripcion,
      indicador.unidad,
      indicador.esAcumulado,
      indicador.esDerivado === true,
      indicador.motivoSinDato ?? null,
    ]),
  );
  const valores = indicadores.flatMap(({ codigo, serie }) =>
    serie.map((punto) => [
      codigo,
      eventoId,
      punto.fechaCorte,
      punto.valor,
      punto.calificador ?? null,
      punto.nota ?? null,
      punto.fuente,
    ]),
  );
  await insertarFilas(
    cliente,
    'nucleo.valores_indicador',
    ['indicador_codigo', 'evento_id', 'fecha_corte', 'valor', 'calificador', 'nota', 'fuente_id'],
    valores,
  );
  return { indicadores: indicadores.length, valores: valores.length };
}

async function registrarEjecucion(cliente, { territorio, origenArchivo, huella }) {
  const alertas = territorio.municipios.reduce((total, { alertas: lista }) => total + lista.length, 0);
  const sinReporte = territorio.meta.municipiosEnLaCapa - territorio.municipios.length;
  const { rows } = await cliente.query(
    `INSERT INTO nucleo.ejecuciones_etl
       (conjunto_id, origen_archivo, huella_archivo, finalizada_en, estado,
        filas_leidas, filas_validas, filas_rechazadas, duplicados, alertas, mensaje)
     VALUES ($1, $2, $3, now(), 'TERMINADA', $4, $5, 0, 0, $6, $7)
     RETURNING id`,
    [
      CONJUNTO_AFECTACIONES.id,
      origenArchivo,
      huella,
      territorio.meta.municipiosEnLaCapa,
      territorio.municipios.length,
      alertas,
      `Se cargaron ${territorio.municipios.length} municipios con al menos una cifra mayor que cero. Los ${sinReporte} restantes no traen reporte.`,
    ],
  );
  return rows[0].id;
}

export async function sembrarConjuntos(cliente, definiciones) {
  for (const definicion of definiciones) {
    await cliente.query(
      `INSERT INTO nucleo.conjuntos_datos (id, nombre, descripcion, fuente_id, destino, version_esquema)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        definicion.id,
        definicion.nombre,
        definicion.descripcion,
        definicion.fuente,
        definicion.destino,
        definicion.version_esquema,
      ],
    );
  }
  return definiciones.length;
}

export async function sembrarAfectacion(cliente, eventoId, territorio, { origenArchivo, huella }) {
  const ejecucionId = await registrarEjecucion(cliente, { territorio, origenArchivo, huella });
  const reportes = await insertarFilas(
    cliente,
    'nucleo.reportes_municipales',
    ['ejecucion_id', 'evento_id', 'municipio_codigo', 'fecha_reporte', 'alertas'],
    territorio.municipios.map(({ codigo, fechaReporte, alertas }) => [
      ejecucionId,
      eventoId,
      codigo,
      fechaReporte,
      alertas,
    ]),
    { retornar: ['id', 'municipio_codigo'] },
  );
  const reportePorMunicipio = new Map(reportes.map((fila) => [fila.municipio_codigo, fila.id]));
  const valores = territorio.municipios.flatMap(({ codigo, valores: cifras }) =>
    Object.entries(cifras).map(([variable, valor]) => [reportePorMunicipio.get(codigo), variable, valor]),
  );
  await insertarFilas(
    cliente,
    'nucleo.valores_reporte_municipal',
    ['reporte_id', 'variable_codigo', 'valor'],
    valores,
  );
  return { ejecucionId, municipios: reportes.length, valores: valores.length };
}

export async function sembrarSeguros(cliente, eventoId, { meta, porDepartamento, porRamo }) {
  await insertarFilas(
    cliente,
    'nucleo.reclamaciones_departamento',
    ['evento_id', 'departamento_codigo', 'fecha_corte', 'fuente_id', 'siniestros', 'pagos', 'valor_estimado'],
    porDepartamento.map(({ codigo, siniestros, pagos, valorEstimado }) => [
      eventoId,
      codigo,
      meta.fechaCorte,
      meta.fuente,
      siniestros,
      pagos,
      valorEstimado,
    ]),
  );
  await insertarFilas(
    cliente,
    'nucleo.reclamaciones_ramo',
    ['evento_id', 'orden', 'ramo', 'fecha_corte', 'fuente_id', 'reclamaciones', 'reserva'],
    porRamo.map(({ nombre, reclamaciones, reserva }, indice) => [
      eventoId,
      posicion(indice),
      nombre,
      meta.fechaCorte,
      meta.fuente,
      reclamaciones,
      reserva,
    ]),
  );
  return porDepartamento.length + porRamo.length;
}

function filasDePartidas(eventoId, tipo, partidas, comunes = {}) {
  return partidas.map((partida, indice) => [
    eventoId,
    tipo,
    posicion(indice),
    partida.concepto,
    partida.valor,
    partida.calificador ?? null,
    partida.fechaCorte ?? comunes.fechaCorte,
    partida.fuente ?? comunes.fuente,
  ]);
}

export async function sembrarEconomia(cliente, eventoId, { costos, recursos, destinoFondo, contratacion }) {
  const partidas = [
    ...filasDePartidas(eventoId, 'COSTO', costos),
    ...filasDePartidas(eventoId, 'RECURSO', recursos),
    ...filasDePartidas(eventoId, 'DESTINO_FONDO', destinoFondo.rubros, destinoFondo),
  ];
  await insertarFilas(
    cliente,
    'nucleo.partidas_economicas',
    ['evento_id', 'tipo', 'orden', 'concepto', 'valor', 'calificador', 'fecha_corte', 'fuente_id'],
    partidas,
  );
  await insertarFilas(
    cliente,
    'nucleo.mediciones_contratacion',
    ['evento_id', 'orden', 'concepto', 'contratos', 'valor', 'contratacion_directa', 'periodo', 'fuente_id'],
    contratacion.map((medicion, indice) => [
      eventoId,
      posicion(indice),
      medicion.concepto,
      medicion.contratos,
      medicion.valor,
      medicion.contratacionDirecta,
      medicion.periodo,
      medicion.fuente,
    ]),
  );
  return partidas.length + contratacion.length;
}
