import { codigosDeMascara, crearClasificador } from '../algorithms/clasificacion.js';

export const SIN_DATO = 'SIN_DATO';
export const GRUPOS_DE_EDAD = Object.freeze(['DE_0_A_9', 'DE_10_A_17', 'DE_18_A_59', 'DE_60_O_MAS']);
export const QUINQUENIOS = Object.freeze([
  '00_04',
  '05_09',
  '10_14',
  '15_19',
  '20_24',
  '25_29',
  '30_34',
  '35_39',
  '40_44',
  '45_49',
  '50_54',
  '55_59',
  '60_64',
  '65_69',
  '70_74',
  '75_79',
  '80_MAS',
]);

export const CONDICIONES_INSTITUCIONALES = Object.freeze([
  Object.freeze({ codigo: 'CIVIL' }),
  Object.freeze({ codigo: 'MILITAR' }),
  Object.freeze({ codigo: 'RECLUSION', padre: 'PRIVADA_LIBERTAD' }),
  Object.freeze({ codigo: 'OTRA_MODALIDAD', padre: 'PRIVADA_LIBERTAD' }),
]);
export const TENENCIAS = Object.freeze(
  ['PROPIETARIO', 'ARRENDATARIO', 'OCUPANTE_CON_PERMISO', 'OTRA'].map((codigo) => Object.freeze({ codigo })),
);

const MILISEGUNDOS_POR_DIA = 86_400_000;

export function inicioDeSemana(fecha) {
  const instante = Date.parse(`${fecha}T00:00:00Z`);
  const diaDeLaSemana = (new Date(instante).getUTCDay() + 6) % 7;
  return new Date(instante - diaDeLaSemana * MILISEGUNDOS_POR_DIA).toISOString().slice(0, 10);
}

export function crearDimensionesDePersonas() {
  const clasificar = crearClasificador({ condiciones: CONDICIONES_INSTITUCIONALES, tenencias: TENENCIAS });
  const clasificados = new WeakMap();
  const clasificacion = (registro) => {
    let resultado = clasificados.get(registro);
    if (!resultado) {
      resultado = clasificar(registro);
      if (!resultado.clasificable) {
        throw new RangeError(`Registro no clasificable: ${resultado.problemas.join(', ')}`);
      }
      clasificados.set(registro, resultado);
    }
    return resultado;
  };
  return {
    valor: (registro) => registro.edad,
    dimensiones: [
      { nombre: 'grupo_edad', categorias: (registro) => GRUPOS_DE_EDAD[clasificacion(registro).grupoEdad] },
      {
        nombre: 'quinquenio_sexo',
        categorias: (registro) =>
          `${QUINQUENIOS[clasificacion(registro).quinquenio]}|${registro.sexo ?? SIN_DATO}`,
      },
      { nombre: 'sexo', categorias: (registro) => registro.sexo ?? SIN_DATO },
      { nombre: 'condicion', categorias: (registro) => clasificacion(registro).condicion },
      { nombre: 'grupo_condicion', categorias: (registro) => clasificacion(registro).grupoCondicion },
      { nombre: 'tenencia', categorias: (registro) => clasificacion(registro).tenencia ?? SIN_DATO },
      { nombre: 'situacion', categorias: (registro) => registro.situacion },
      { nombre: 'condicion_salud', categorias: (registro) => registro.condicionSalud },
      {
        nombre: 'vulnerabilidad',
        categorias: (registro) => codigosDeMascara(clasificacion(registro).mascara),
      },
      {
        nombre: 'vulnerable',
        categorias: (registro) => (clasificacion(registro).mascara === 0 ? 'NO' : 'SI'),
      },
      { nombre: 'semana', categorias: (registro) => inicioDeSemana(registro.capturadoEn) },
    ],
  };
}

export const DIMENSIONES_DEL_CUBO = Object.freeze([
  'estado_fisico',
  'aseguramiento',
  'financiacion',
  'reclamacion',
]);
export const DIMENSIONES_CRUZABLES = Object.freeze([...DIMENSIONES_DEL_CUBO, 'ocupacion']);

export function categoriaDeCubo({ estadoFisico, aseguramiento, financiacion, reclamacion }) {
  return `${estadoFisico}|${aseguramiento}|${financiacion}|${reclamacion}`;
}

export function crearDimensionesDeViviendas() {
  return {
    valor: (registro) => registro.avaluo ?? 0,
    dimensiones: [
      { nombre: 'cubo', categorias: categoriaDeCubo },
      { nombre: 'estado_fisico', categorias: (registro) => registro.estadoFisico },
      { nombre: 'aseguramiento', categorias: (registro) => registro.aseguramiento },
      { nombre: 'financiacion', categorias: (registro) => registro.financiacion },
      { nombre: 'reclamacion', categorias: (registro) => registro.reclamacion },
      { nombre: 'zona', categorias: (registro) => registro.zona },
      {
        nombre: 'estrato',
        categorias: (registro) => (registro.estrato === null ? SIN_DATO : String(registro.estrato)),
      },
      { nombre: 'ocupacion', categorias: (registro) => registro.ocupacion ?? SIN_DATO },
      {
        nombre: 'estado_ocupacion',
        categorias: (registro) => `${registro.estadoFisico}|${registro.ocupacion ?? SIN_DATO}`,
      },
      { nombre: 'semana', categorias: (registro) => inicioDeSemana(registro.capturadoEn) },
    ],
  };
}

export const CONSULTA_PERSONAS_AGREGABLES = `
  SELECT p.id, p.edad_al_evento AS edad, p.sexo, p.municipio_codigo AS municipio, ci.codigo AS condicion,
         tt.codigo AS tenencia, p.situacion, p.condicion_salud, p.capturado_en,
         coalesce((SELECT array_agg(t.codigo ORDER BY t.bit)
                   FROM nucleo.personas_vulnerabilidades pv
                   JOIN nucleo.tipos_vulnerabilidad t ON t.id = pv.tipo_vulnerabilidad_id
                   WHERE pv.persona_id = p.id), '{}') AS vulnerabilidades
  FROM nucleo.personas_afectadas p
  JOIN nucleo.condiciones_institucionales ci ON ci.id = p.condicion_institucional_id
  LEFT JOIN nucleo.tipos_tenencia tt ON tt.id = p.tenencia_id`;

export const CONSULTA_VIVIENDAS_AGREGABLES = `
  SELECT v.id, v.municipio_codigo AS municipio, v.zona, v.estrato, co.codigo AS ocupacion, v.avaluo_cop AS avaluo,
         v.capturado_en, ef.codigo AS estado_fisico, ca.codigo AS aseguramiento, tf.codigo AS financiacion,
         CASE
           WHEN ca.codigo <> 'ASEGURADA' THEN 'NO_APLICA'
           WHEN r.id IS NULL THEN 'NINGUNA'
           WHEN i.estado = 'PAGADA' THEN 'PAGADA'
           ELSE r.estado
         END AS reclamacion
  FROM nucleo.viviendas v
  LEFT JOIN nucleo.condiciones_ocupacion co ON co.id = v.condicion_ocupacion_id
  JOIN nucleo.afectaciones_vivienda a ON a.vivienda_id = v.id AND a.es_vigente
  JOIN nucleo.estados_fisicos ef ON ef.id = a.estado_fisico_id
  JOIN nucleo.aseguramiento s ON s.vivienda_id = v.id
  JOIN nucleo.condiciones_aseguramiento ca ON ca.id = s.condicion_aseguramiento_id
  JOIN nucleo.financiacion_vivienda f ON f.vivienda_id = v.id
  JOIN nucleo.tipos_financiacion tf ON tf.id = f.tipo_financiacion_id
  LEFT JOIN nucleo.reclamaciones r ON r.aseguramiento_id = s.id
  LEFT JOIN nucleo.indemnizaciones i ON i.reclamacion_id = r.id`;

export function comoPersonaAgregable(fila) {
  return {
    municipio: fila.municipio,
    edad: fila.edad,
    sexo: fila.sexo,
    condicion: fila.condicion,
    tenencia: fila.tenencia,
    situacion: fila.situacion,
    condicionSalud: fila.condicion_salud,
    vulnerabilidades: fila.vulnerabilidades,
    capturadoEn: fila.capturado_en,
  };
}

export function comoViviendaAgregable(fila) {
  return {
    municipio: fila.municipio,
    zona: fila.zona,
    estrato: fila.estrato,
    ocupacion: fila.ocupacion,
    avaluo: fila.avaluo,
    estadoFisico: fila.estado_fisico,
    aseguramiento: fila.aseguramiento,
    financiacion: fila.financiacion,
    reclamacion: fila.reclamacion,
    capturadoEn: fila.capturado_en,
  };
}

export const DESTINOS_AGREGABLES = Object.freeze({
  personas: Object.freeze({
    consulta: CONSULTA_PERSONAS_AGREGABLES,
    relacion: 'nucleo.personas_afectadas',
    tabla: 'p',
    crearDimensiones: crearDimensionesDePersonas,
    comoRegistro: comoPersonaAgregable,
  }),
  viviendas: Object.freeze({
    consulta: CONSULTA_VIVIENDAS_AGREGABLES,
    relacion: 'nucleo.viviendas',
    tabla: 'v',
    crearDimensiones: crearDimensionesDeViviendas,
    comoRegistro: comoViviendaAgregable,
  }),
});
