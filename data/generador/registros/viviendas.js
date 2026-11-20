import { crearSelector } from '../aleatorio.js';
import {
  ESTADOS_FISICOS,
  ESTRATOS,
  FINANCIACIONES,
  OCUPACIONES,
  PROBABILIDAD_POLIZA_PENDIENTE,
  RECLAMACIONES,
} from '../catalogos.js';
import { VEREDAS, VIAS_URBANAS } from './nombres.js';
import { fechaDeRegistro } from './personas.js';

export const COLUMNAS_VIVIENDAS = Object.freeze([
  'predio',
  'direccion',
  'municipio',
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
  'fecha_registro',
]);

const CODIGOS_ESTADO = [
  'SIN_AFECTACION',
  'AFECTACION_LEVE',
  'AFECTACION_MODERADA',
  'AFECTACION_GRAVE',
  'DESTRUCCION_TOTAL',
  'PENDIENTE_EVALUACION',
];
const CODIGOS_OCUPACION = ['PROPIA', 'ARRENDADA', 'TERCEROS', 'DESOCUPADA', 'OTRA'];
const CODIGOS_FINANCIACION = ['HIPOTECA', 'LEASING', 'SIN_FINANCIACION', 'PENDIENTE_VERIFICACION'];
const PROPORCION_DE_COSTO = [0, 0.05, 0.2, 0.5, 1, null];
const PROBABILIDAD_URBANA = 0.75;
const PROBABILIDAD_SUFIJO = 0.12;
const VARIACION_DEL_AVALUO = 0.25;
const MILISEGUNDOS_POR_DIA = 86_400_000;
const MULTIPLICADOR = 6_364_133;
const DESPLAZAMIENTO = 98_765;
const ESPACIO_DE_PREDIOS = 9_000_000_000;

const elegirEstado = crearSelector(ESTADOS_FISICOS);
const elegirOcupacion = crearSelector(OCUPACIONES);
const elegirFinanciacion = crearSelector(FINANCIACIONES);
const elegirEstrato = crearSelector(ESTRATOS);
const elegirResolucion = crearSelector(RECLAMACIONES.resoluciones);

export function predioDe(indice) {
  return `PR${1_000_000_000 + ((indice * MULTIPLICADOR + DESPLAZAMIENTO) % ESPACIO_DE_PREDIOS)}`;
}

const elegirDe = (lista, generador) => lista[generador.entero(0, lista.length - 1)];

export function generarDireccion(generador, zona) {
  if (zona === 'RURAL') {
    return {
      zona,
      partes: {
        vereda: elegirDe(VEREDAS, generador),
        kilometro: generador.entero(1, 40),
        casa: generador.entero(1, 150),
      },
    };
  }
  return {
    zona,
    partes: {
      via: generador.entero(0, VIAS_URBANAS.length - 1),
      numero: generador.entero(1, 120),
      sufijo: generador.ocurre(PROBABILIDAD_SUFIJO) ? elegirDe(['A', 'B', 'C'], generador) : '',
      cruce: generador.entero(1, 120),
      placa: generador.entero(1, 99),
    },
  };
}

export function escribirDireccion({ zona, partes }, estilo = 'completa') {
  if (zona === 'RURAL') {
    return estilo === 'completa'
      ? `Vereda ${partes.vereda}, kilómetro ${partes.kilometro}, casa ${partes.casa}`
      : `VDA ${partes.vereda} KM ${partes.kilometro} CS ${partes.casa}`;
  }
  const via = VIAS_URBANAS[partes.via];
  if (estilo === 'abreviada') {
    return `${via.abreviada} ${partes.numero}${partes.sufijo} ${partes.cruce} ${partes.placa}`;
  }
  if (estilo === 'alterna') {
    return `${via.alterna} ${partes.numero}${partes.sufijo} No. ${partes.cruce}-${partes.placa}`;
  }
  return `${via.completa} ${partes.numero}${partes.sufijo} # ${partes.cruce}-${partes.placa}`;
}

function sumarDias(fecha, dias) {
  return new Date(Date.parse(`${fecha}T00:00:00Z`) + dias * MILISEGUNDOS_POR_DIA).toISOString().slice(0, 10);
}

function elegirAseguramiento(generador, financiacion) {
  if (generador.ocurre(PROBABILIDAD_POLIZA_PENDIENTE)) {
    return 'PENDIENTE_VERIFICACION';
  }
  return generador.ocurre(FINANCIACIONES[financiacion].probabilidadSeguro) ? 'ASEGURADA' : 'NO_ASEGURADA';
}

function elegirReclamacion(generador, aseguramiento, afectada) {
  if (aseguramiento !== 'ASEGURADA') {
    return null;
  }
  if (!afectada || !generador.ocurre(RECLAMACIONES.probabilidadPresentar)) {
    return 'NINGUNA';
  }
  const resolucion = RECLAMACIONES.resoluciones[elegirResolucion(generador)].nombre;
  if (resolucion === 'rechazada') {
    return 'RECHAZADA';
  }
  if (resolucion === 'enEstudio') {
    return 'EN_ESTUDIO';
  }
  return generador.ocurre(RECLAMACIONES.probabilidadPago) ? 'PAGADA' : 'APROBADA';
}

const redondear = (valor) => Math.round(valor / 1000) * 1000;

export function crearGeneradorDeViviendas(generador, contexto) {
  return function generarVivienda(indice) {
    const zona = generador.ocurre(PROBABILIDAD_URBANA) ? 'URBANA' : 'RURAL';
    const direccion = generarDireccion(generador, zona);
    const municipio = contexto.municipios[contexto.elegirMunicipio(generador)].codigo;
    const estrato = elegirEstrato(generador);
    const avaluo = redondear(generador.variar(ESTRATOS[estrato].valorBase, VARIACION_DEL_AVALUO));
    const posicionEstado = elegirEstado(generador);
    const estado = CODIGOS_ESTADO[posicionEstado];
    const fechaRegistro = fechaDeRegistro(generador, contexto.fechaDelSismo);
    const diasHastaRegistro =
      (Date.parse(fechaRegistro) - Date.parse(contexto.fechaDelSismo)) / MILISEGUNDOS_POR_DIA;
    const proporcion = PROPORCION_DE_COSTO[posicionEstado];
    const costo = proporcion === null ? null : redondear(avaluo * proporcion * generador.variar(1, 0.1));
    const financiacion = elegirFinanciacion(generador);
    const codigoFinanciacion = CODIGOS_FINANCIACION[financiacion];
    const conSaldo = codigoFinanciacion === 'HIPOTECA' || codigoFinanciacion === 'LEASING';
    const aseguramiento = elegirAseguramiento(generador, financiacion);
    const afectada = ESTADOS_FISICOS[posicionEstado].afectada;
    const reclamacion = elegirReclamacion(generador, aseguramiento, afectada);
    const reclamada = reclamacion !== null && reclamacion !== 'NINGUNA';
    const valorReclamado = reclamada ? redondear((costo ?? 0) * generador.variar(1, 0.1)) : null;
    const aprobada = reclamacion === 'APROBADA' || reclamacion === 'PAGADA';
    return {
      predio: predioDe(indice),
      direccion: escribirDireccion(direccion),
      partesDireccion: direccion,
      municipio,
      zona,
      estrato: estrato + 1,
      ocupacion: CODIGOS_OCUPACION[elegirOcupacion(generador)],
      avaluo,
      estado_fisico: estado,
      fecha_evaluacion:
        estado === 'PENDIENTE_EVALUACION'
          ? null
          : sumarDias(contexto.fechaDelSismo, Math.min(diasHastaRegistro, 1 + generador.entero(0, 20))),
      costo_estimado: costo,
      financiacion: codigoFinanciacion,
      saldo: conSaldo ? redondear(avaluo * (0.2 + generador.siguiente() * 0.6)) : null,
      aseguramiento,
      valor_asegurado:
        aseguramiento === 'ASEGURADA' ? redondear(avaluo * (0.7 + generador.siguiente() * 0.3)) : null,
      reclamacion,
      valor_reclamado: valorReclamado,
      valor_aprobado: aprobada ? redondear(valorReclamado * (0.6 + generador.siguiente() * 0.4)) : null,
      fecha_registro: fechaRegistro,
    };
  };
}
