const FINANCIACIONES_QUE_EXIGEN_SEGURO = new Set(['HIPOTECA', 'LEASING']);
const RECLAMACIONES_APROBADAS = new Set(['APROBADA', 'PAGADA']);
const FACTOR_DE_COSTO_IMPROBABLE = 1.5;

export const REGLAS = Object.freeze({
  EMBARAZO_SEXO_MASCULINO: {
    descripcion: 'La persona tiene embarazo declarado y sexo masculino.',
    incumple: (valores) => valores.vulnerabilidades?.includes('EMBARAZO') && valores.sexo === 'M',
  },
  EMBARAZO_EDAD_IMPROBABLE: {
    descripcion: 'La persona tiene embarazo declarado con menos de 10 o más de 55 años.',
    incumple: (valores) =>
      valores.vulnerabilidades?.includes('EMBARAZO') && (valores.edad < 10 || valores.edad > 55),
  },
  HIPOTECA_SIN_SEGURO: {
    descripcion: 'La vivienda hipotecada o en leasing figura como no asegurada.',
    incumple: (valores) =>
      FINANCIACIONES_QUE_EXIGEN_SEGURO.has(valores.financiacion) && valores.aseguramiento === 'NO_ASEGURADA',
  },
  RECLAMACION_SIN_POLIZA: {
    descripcion: 'La vivienda tiene una reclamación, pero no figura como asegurada.',
    incumple: (valores) =>
      valores.reclamacion !== null &&
      valores.reclamacion !== undefined &&
      valores.aseguramiento !== 'ASEGURADA',
  },
  VALOR_APROBADO_INCOHERENTE: {
    descripcion: 'El valor aprobado no corresponde al estado de la reclamación.',
    incumple: (valores) =>
      RECLAMACIONES_APROBADAS.has(valores.reclamacion) !== (valores.valor_aprobado !== null),
  },
  COSTO_SUPERIOR_AL_AVALUO: {
    descripcion: 'El costo estimado supera en más de 50 % el avalúo de la vivienda.',
    incumple: (valores) =>
      valores.costo_estimado !== null &&
      valores.avaluo !== null &&
      valores.costo_estimado > FACTOR_DE_COSTO_IMPROBABLE * valores.avaluo,
  },
  EVALUACION_SIN_FECHA: {
    descripcion: 'La vivienda tiene un estado físico evaluado, pero no la fecha de la evaluación.',
    incumple: (valores) =>
      valores.estado_fisico !== 'PENDIENTE_EVALUACION' && valores.fecha_evaluacion === null,
  },
  PERSONAS_MENOR_QUE_FAMILIAS: {
    descripcion: 'El municipio informa menos personas que familias.',
    incumple: (valores) =>
      valores.familias > 0 &&
      valores.personas !== null &&
      valores.personas !== undefined &&
      valores.personas < valores.familias,
  },
  FECHA_REPORTE_INVALIDA: {
    descripcion: 'La bitácora trae una fecha anterior al sismo o posterior a la consulta.',
    incumple: (valores) => valores.fecha_reporte_valida === false,
  },
});

export function crearEvaluadorDeReglas(reglas) {
  const desconocidas = reglas.filter(({ codigo }) => !REGLAS[codigo]).map(({ codigo }) => codigo);
  if (desconocidas.length > 0) {
    throw new RangeError(`Reglas desconocidas: ${desconocidas.join(', ')}`);
  }
  return function evaluar(valores) {
    const alertas = [];
    const errores = [];
    for (const { codigo, efecto } of reglas) {
      if (REGLAS[codigo].incumple(valores)) {
        if (efecto === 'rechazo') {
          errores.push({ campo: null, codigo, mensaje: REGLAS[codigo].descripcion });
        } else {
          alertas.push(codigo);
        }
      }
    }
    return { alertas, errores };
  };
}
