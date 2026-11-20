import { crearSelector } from '../aleatorio.js';
import {
  CONDICIONES_INSTITUCIONALES,
  EMBARAZO,
  GRUPOS_QUINQUENALES,
  PROBABILIDAD_MUJER,
  SITUACIONES,
  TENENCIAS,
  VULNERABILIDADES_DECLARADAS,
} from '../catalogos.js';
import { APELLIDOS, NOMBRES_DE_HOMBRE, NOMBRES_DE_MUJER } from './nombres.js';

export const COLUMNAS_PERSONAS = Object.freeze([
  'documento',
  'nombre_completo',
  'sexo',
  'edad',
  'municipio',
  'condicion_institucional',
  'tenencia',
  'situacion',
  'condicion_salud',
  'vulnerabilidades',
  'fecha_registro',
]);

const CODIGOS_CONDICION = ['CIVIL', 'MILITAR', 'RECLUSION', 'OTRA_MODALIDAD'];
const CODIGOS_TENENCIA = ['PROPIETARIO', 'ARRENDATARIO', 'OCUPANTE_CON_PERMISO', 'OTRA', null];
const CODIGOS_SITUACION = ['DAMNIFICADA', 'AFECTADA'];
const CODIGOS_VULNERABILIDAD = [
  'DISCAPACIDAD',
  'NECESIDADES_ESPECIALES',
  'MOVILIDAD_REDUCIDA',
  'VULNERABILIDAD_SOCIOECONOMICA',
  'COMUNIDAD_ATENCION_PRIORITARIA',
];
const CONDICIONES_DE_SALUD = [
  { codigo: 'ILESA', peso: 0.9765 },
  { codigo: 'HERIDA', peso: 0.022 },
  { codigo: 'FALLECIDA', peso: 0.0011 },
  { codigo: 'DESAPARECIDA', peso: 0.0004 },
];
const PROBABILIDAD_SEGUNDO_NOMBRE = 0.4;
const DIAS_PROMEDIO_DE_REGISTRO = 14;
const DIAS_DE_REGISTRO = 90;
const MILISEGUNDOS_POR_DIA = 86_400_000;
const MULTIPLICADOR = 7_919_993;
const DESPLAZAMIENTO = 123_457;
const ESPACIO_DE_DOCUMENTOS = 9_000_000_000;
const PRIMER_DOCUMENTO = 1_000_000_000;

const elegirQuinquenio = crearSelector(GRUPOS_QUINQUENALES);
const elegirCondicion = crearSelector(CONDICIONES_INSTITUCIONALES);
const elegirTenencia = crearSelector(TENENCIAS);
const elegirSituacion = crearSelector(SITUACIONES);
const elegirSalud = crearSelector(CONDICIONES_DE_SALUD);

export function documentoDe(indice) {
  return String(PRIMER_DOCUMENTO + ((indice * MULTIPLICADOR + DESPLAZAMIENTO) % ESPACIO_DE_DOCUMENTOS));
}

export function fechaDeRegistro(generador, fechaDelSismo) {
  const dias = Math.min(
    DIAS_DE_REGISTRO,
    Math.floor(-Math.log(1 - generador.siguiente()) * DIAS_PROMEDIO_DE_REGISTRO),
  );
  return new Date(Date.parse(`${fechaDelSismo}T00:00:00Z`) + dias * MILISEGUNDOS_POR_DIA)
    .toISOString()
    .slice(0, 10);
}

const elegirDe = (lista, generador) => lista[generador.entero(0, lista.length - 1)];

function generarNombre(generador, esMujer) {
  const nombres = esMujer ? NOMBRES_DE_MUJER : NOMBRES_DE_HOMBRE;
  const partes = [elegirDe(nombres, generador)];
  if (generador.ocurre(PROBABILIDAD_SEGUNDO_NOMBRE)) {
    const segundo = elegirDe(nombres, generador);
    if (segundo !== partes[0]) {
      partes.push(segundo);
    }
  }
  partes.push(elegirDe(APELLIDOS, generador), elegirDe(APELLIDOS, generador));
  return partes.join(' ');
}

export function crearGeneradorDePersonas(generador, contexto) {
  return function generarPersona(indice) {
    const esMujer = generador.ocurre(PROBABILIDAD_MUJER);
    const { desde, hasta } = GRUPOS_QUINQUENALES[elegirQuinquenio(generador)];
    const edad = generador.entero(desde, hasta);
    const nombre = generarNombre(generador, esMujer);
    const municipio = contexto.municipios[contexto.elegirMunicipio(generador)].codigo;
    const vulnerabilidades = CODIGOS_VULNERABILIDAD.filter((_, posicion) =>
      generador.ocurre(VULNERABILIDADES_DECLARADAS[posicion].probabilidad),
    );
    const puedeEstarEmbarazada = esMujer && edad >= EMBARAZO.edadMinima && edad <= EMBARAZO.edadMaxima;
    if (puedeEstarEmbarazada && generador.ocurre(EMBARAZO.probabilidad)) {
      vulnerabilidades.push('EMBARAZO');
    }
    return {
      documento: documentoDe(indice),
      nombre_completo: nombre,
      sexo: esMujer ? 'F' : 'M',
      edad,
      municipio,
      condicion_institucional: CODIGOS_CONDICION[elegirCondicion(generador)],
      tenencia: CODIGOS_TENENCIA[elegirTenencia(generador)],
      situacion: CODIGOS_SITUACION[elegirSituacion(generador)],
      condicion_salud: CONDICIONES_DE_SALUD[elegirSalud(generador)].codigo,
      vulnerabilidades,
      fecha_registro: fechaDeRegistro(generador, contexto.fechaDelSismo),
    };
  };
}
