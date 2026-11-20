export const ESTADO_DISPONIBLE = 'disponible';
export const ESTADO_SIN_DATO = 'sin-dato';
export const ORIGEN_SIMULADO = 'SIMULADO';
export const MOTIVO_SIN_DATO = 'No se localizó una cifra oficial pública para este indicador.';

export function ordenarSerie(serie) {
  return [...serie].sort((a, b) => a.fechaCorte.localeCompare(b.fechaCorte));
}

export function calcularVariacion(serie) {
  if (serie.length < 2) {
    return null;
  }
  const [anterior, actual] = ordenarSerie(serie).slice(-2);
  const absoluta = actual.valor - anterior.valor;
  return {
    absoluta,
    relativa: anterior.valor === 0 ? null : (absoluta / anterior.valor) * 100,
    corteAnterior: anterior.fechaCorte,
  };
}

function describir({ nombre, descripcion, unidad, codigo }) {
  return { codigo, nombre, descripcion, unidad };
}

function resolverDesdeSerie(definicion, fuentes) {
  const punto = ordenarSerie(definicion.serie).at(-1);
  const fuente = fuentes.get(punto.fuente);
  if (!fuente) {
    throw new Error(`El indicador ${definicion.codigo} apunta a una fuente desconocida: ${punto.fuente}`);
  }
  return {
    ...describir(definicion),
    estado: ESTADO_DISPONIBLE,
    valor: punto.valor,
    calificador: punto.calificador ?? null,
    fechaCorte: punto.fechaCorte,
    nota: punto.nota ?? null,
    variacion: calcularVariacion(definicion.serie),
    esDerivado: definicion.esDerivado === true,
    origen: fuente.origen,
    nivel: fuente.nivel,
    fuente,
    muestra: null,
  };
}

function resolverSimulado(definicion, simulado, fuenteSimulada) {
  return {
    ...describir(definicion),
    estado: ESTADO_DISPONIBLE,
    valor: simulado.valor,
    calificador: null,
    fechaCorte: null,
    nota: null,
    variacion: null,
    esDerivado: false,
    origen: ORIGEN_SIMULADO,
    nivel: 'S',
    fuente: fuenteSimulada ?? null,
    muestra: simulado.muestra,
  };
}

function resolverSinDato(definicion) {
  return {
    ...describir(definicion),
    estado: ESTADO_SIN_DATO,
    motivoSinDato: definicion.motivoSinDato ?? MOTIVO_SIN_DATO,
  };
}

export function resolverIndicador(definicion, { fuentes, simulados = {} }) {
  if (definicion.serie.length > 0) {
    return resolverDesdeSerie(definicion, fuentes);
  }
  const simulado = simulados[definicion.codigo];
  return simulado
    ? resolverSimulado(definicion, simulado, fuentes.get('generador-andes'))
    : resolverSinDato(definicion);
}

export function nombreCorto(fuente) {
  return fuente.sigla ?? fuente.entidad;
}

export function describirProcedencia(fuente) {
  return fuente.leidoEn ? `${nombreCorto(fuente)}, leído en ${fuente.leidoEn}` : nombreCorto(fuente);
}
