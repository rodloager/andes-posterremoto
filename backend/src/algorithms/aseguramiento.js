export const ESTADOS_FISICOS = Object.freeze([
  'SIN_AFECTACION',
  'AFECTACION_LEVE',
  'AFECTACION_MODERADA',
  'AFECTACION_GRAVE',
  'DESTRUCCION_TOTAL',
  'PENDIENTE_EVALUACION',
]);
export const CONDICIONES_ASEGURAMIENTO = Object.freeze([
  'ASEGURADA',
  'NO_ASEGURADA',
  'PENDIENTE_VERIFICACION',
]);
export const TIPOS_FINANCIACION = Object.freeze([
  'HIPOTECA',
  'LEASING',
  'SIN_FINANCIACION',
  'PENDIENTE_VERIFICACION',
]);
export const FINANCIACIONES_QUE_EXIGEN_SEGURO = Object.freeze(['HIPOTECA', 'LEASING']);
export const ETAPAS_RECLAMACION = Object.freeze(['NINGUNA', 'EN_ESTUDIO', 'RECHAZADA', 'APROBADA', 'PAGADA']);

const dividir = (numerador, denominador) => (denominador === 0 ? null : numerador / denominador);

function indexar(catalogo) {
  return new Map(catalogo.map((codigo, posicion) => [codigo, posicion]));
}

export function crearCubo({
  estados = ESTADOS_FISICOS,
  aseguramientos = CONDICIONES_ASEGURAMIENTO,
  financiaciones = TIPOS_FINANCIACION,
} = {}) {
  const posicionEstado = indexar(estados);
  const posicionAseguramiento = indexar(aseguramientos);
  const posicionFinanciacion = indexar(financiaciones);
  const celdas = new Float64Array(estados.length * aseguramientos.length * financiaciones.length);

  function posicion(estado, aseguramiento, financiacion) {
    const e = posicionEstado.get(estado);
    const a = posicionAseguramiento.get(aseguramiento);
    const f = posicionFinanciacion.get(financiacion);
    if (e === undefined || a === undefined || f === undefined) {
      return -1;
    }
    return (e * aseguramientos.length + a) * financiaciones.length + f;
  }

  let descartadas = 0;

  function agregarCelda(estado, aseguramiento, financiacion, cantidad = 1) {
    const indice = posicion(estado, aseguramiento, financiacion);
    if (indice < 0 || !Number.isFinite(cantidad) || cantidad < 0) {
      descartadas += 1;
      return false;
    }
    celdas[indice] += cantidad;
    return true;
  }

  function sumar({ estado, aseguramiento, financiacion } = {}) {
    let total = 0;
    estados.forEach((codigoEstado, e) => {
      if (estado !== undefined && codigoEstado !== estado) {
        return;
      }
      aseguramientos.forEach((codigoAseguramiento, a) => {
        if (aseguramiento !== undefined && codigoAseguramiento !== aseguramiento) {
          return;
        }
        financiaciones.forEach((codigoFinanciacion, f) => {
          if (financiacion === undefined || codigoFinanciacion === financiacion) {
            total += celdas[(e * aseguramientos.length + a) * financiaciones.length + f];
          }
        });
      });
    });
    return total;
  }

  return {
    estados,
    aseguramientos,
    financiaciones,
    agregarCelda,
    agregar: (vivienda) => agregarCelda(vivienda.estado, vivienda.aseguramiento, vivienda.financiacion, 1),
    sumar,
    get celdas() {
      return celdas.length;
    },
    get descartadas() {
      return descartadas;
    },
  };
}

function totalesPor(cubo, dimension, catalogo) {
  return Object.fromEntries(catalogo.map((codigo) => [codigo, cubo.sumar({ [dimension]: codigo })]));
}

function tasasCondicionales(cubo, dimension, catalogo) {
  return Object.fromEntries(
    catalogo.map((codigo) => {
      const total = cubo.sumar({ [dimension]: codigo });
      return [
        codigo,
        {
          total,
          ...Object.fromEntries(
            cubo.aseguramientos.map((aseguramiento) => [
              aseguramiento,
              dividir(cubo.sumar({ [dimension]: codigo, aseguramiento }), total),
            ]),
          ),
        },
      ];
    }),
  );
}

export function analizarAseguramiento(cubo) {
  const total = cubo.sumar();
  const aseguradas = cubo.sumar({ aseguramiento: 'ASEGURADA' });
  const pendientes = cubo.sumar({ aseguramiento: 'PENDIENTE_VERIFICACION' });
  const destruidas = cubo.sumar({ estado: 'DESTRUCCION_TOTAL' });
  const inconsistencias = Object.fromEntries(
    FINANCIACIONES_QUE_EXIGEN_SEGURO.map((financiacion) => [
      financiacion,
      cubo.sumar({ aseguramiento: 'NO_ASEGURADA', financiacion }),
    ]),
  );
  const tabla = cubo.estados.flatMap((estado) =>
    cubo.financiaciones.map((financiacion) => ({
      estado,
      financiacion,
      ...Object.fromEntries(
        cubo.aseguramientos.map((aseguramiento) => [
          aseguramiento,
          cubo.sumar({ estado, aseguramiento, financiacion }),
        ]),
      ),
    })),
  );
  return {
    total,
    porAseguramiento: totalesPor(cubo, 'aseguramiento', cubo.aseguramientos),
    porEstado: totalesPor(cubo, 'estado', cubo.estados),
    porFinanciacion: totalesPor(cubo, 'financiacion', cubo.financiaciones),
    cobertura: { minima: dividir(aseguradas, total), maxima: dividir(aseguradas + pendientes, total) },
    destruidasConPoliza: dividir(
      cubo.sumar({ estado: 'DESTRUCCION_TOTAL', aseguramiento: 'ASEGURADA' }),
      destruidas,
    ),
    tasasPorEstado: tasasCondicionales(cubo, 'estado', cubo.estados),
    tasasPorFinanciacion: tasasCondicionales(cubo, 'financiacion', cubo.financiaciones),
    inconsistencias: {
      ...inconsistencias,
      total: Object.values(inconsistencias).reduce((suma, cantidad) => suma + cantidad, 0),
    },
    tabla,
  };
}

export function embudoDeReclamaciones(conteos) {
  const cantidad = (etapa) => conteos[etapa] ?? 0;
  const presentadas =
    cantidad('EN_ESTUDIO') + cantidad('RECHAZADA') + cantidad('APROBADA') + cantidad('PAGADA');
  const aprobadas = cantidad('APROBADA') + cantidad('PAGADA');
  return {
    aseguradas: presentadas + cantidad('NINGUNA'),
    presentadas,
    enEstudio: cantidad('EN_ESTUDIO'),
    rechazadas: cantidad('RECHAZADA'),
    aprobadas,
    pagadas: cantidad('PAGADA'),
    tasaDePresentacion: dividir(presentadas, presentadas + cantidad('NINGUNA')),
    tasaDeAprobacion: dividir(aprobadas, aprobadas + cantidad('RECHAZADA')),
    tasaDePago: dividir(cantidad('PAGADA'), aprobadas),
  };
}
