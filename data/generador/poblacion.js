import { crearSelector } from './aleatorio.js';
import {
  CONDICIONES_INSTITUCIONALES,
  EDAD_ADULTO_MAYOR,
  EDAD_MAYORIA,
  EMBARAZO,
  GRUPOS_EDAD,
  GRUPOS_QUINQUENALES,
  PROBABILIDAD_MUJER,
  SITUACIONES,
  TENENCIAS,
  VULNERABILIDADES_DECLARADAS,
} from './catalogos.js';

const FACTORES_DESPLAZAMIENTO = [0.62, 1, 0.93, 0.85, 0.78, 0.7, 0.63, 0.57, 0.5, 0.45, 0.4, 0.36, 0.33];
const PROPORCION_DESPLAZADA_MAXIMA = 0.18;
const PROPORCION_ALBERGUE_INICIAL = 0.38;
const PROPORCION_ALBERGUE_FINAL = 0.2;
const COBERTURA_ATENCION_MAXIMA = 0.9;
const RITMO_ATENCION = 0.28;
const POSICION_DAMNIFICADA = 0;

const elegirQuinquenio = crearSelector(GRUPOS_QUINQUENALES);
const elegirCondicion = crearSelector(CONDICIONES_INSTITUCIONALES);
const elegirTenencia = crearSelector(TENENCIAS);
const elegirSituacion = crearSelector(SITUACIONES);

const ceros = (cantidad) => new Array(cantidad).fill(0);

function posicionGrupoEdad(edad) {
  return GRUPOS_EDAD.findLastIndex((grupo) => edad >= grupo.desde);
}

function puedeEstarEmbarazada(persona) {
  return persona.esMujer && persona.edad >= EMBARAZO.edadMinima && persona.edad <= EMBARAZO.edadMaxima;
}

function generarPersona(generador, elegirDepartamento) {
  const quinquenio = elegirQuinquenio(generador);
  const { desde, hasta } = GRUPOS_QUINQUENALES[quinquenio];
  const persona = {
    quinquenio,
    edad: generador.entero(desde, hasta),
    esMujer: generador.ocurre(PROBABILIDAD_MUJER),
    condicion: elegirCondicion(generador),
    tenencia: elegirTenencia(generador),
    situacion: elegirSituacion(generador),
    departamento: elegirDepartamento(generador),
    declaradas: VULNERABILIDADES_DECLARADAS.map(({ probabilidad }) => generador.ocurre(probabilidad)),
  };
  persona.embarazo = puedeEstarEmbarazada(persona) && generador.ocurre(EMBARAZO.probabilidad);
  return persona;
}

function crearConteo(cantidadDepartamentos) {
  return {
    gruposEdad: ceros(GRUPOS_EDAD.length),
    hombres: ceros(GRUPOS_QUINQUENALES.length),
    mujeres: ceros(GRUPOS_QUINQUENALES.length),
    condiciones: ceros(CONDICIONES_INSTITUCIONALES.length),
    tenencias: ceros(TENENCIAS.length),
    situaciones: ceros(SITUACIONES.length),
    declaradas: ceros(VULNERABILIDADES_DECLARADAS.length),
    departamentos: ceros(cantidadDepartamentos),
    embarazo: 0,
    adultoMayor: 0,
    infantil: 0,
  };
}

function registrar(conteo, persona) {
  conteo.gruposEdad[posicionGrupoEdad(persona.edad)] += 1;
  (persona.esMujer ? conteo.mujeres : conteo.hombres)[persona.quinquenio] += 1;
  conteo.condiciones[persona.condicion] += 1;
  conteo.tenencias[persona.tenencia] += 1;
  conteo.situaciones[persona.situacion] += 1;
  conteo.departamentos[persona.departamento] += 1;
  persona.declaradas.forEach((presente, posicion) => {
    conteo.declaradas[posicion] += presente ? 1 : 0;
  });
  conteo.embarazo += persona.embarazo ? 1 : 0;
  conteo.adultoMayor += persona.edad >= EDAD_ADULTO_MAYOR ? 1 : 0;
  conteo.infantil += persona.edad < EDAD_MAYORIA ? 1 : 0;
}

const comoCategorias = (catalogo, cantidades) =>
  catalogo.map(({ nombre }, posicion) => ({ nombre, personas: cantidades[posicion] }));

function describirVulnerabilidad(conteo) {
  const [discapacidad, necesidades, movilidad, socioeconomica, comunidad] = comoCategorias(
    VULNERABILIDADES_DECLARADAS,
    conteo.declaradas,
  );
  return [
    discapacidad,
    necesidades,
    movilidad,
    { nombre: 'Adultos mayores', personas: conteo.adultoMayor },
    { nombre: 'Mujeres embarazadas', personas: conteo.embarazo },
    { nombre: 'Población infantil', personas: conteo.infantil },
    socioeconomica,
    comunidad,
  ];
}

function describirDepartamentos(departamentos, cantidades) {
  return departamentos
    .map(({ codigo, nombre }, posicion) => ({ codigo, nombre, personas: cantidades[posicion] }))
    .sort((a, b) => b.personas - a.personas);
}

function interpolar(inicio, fin, posicion, total) {
  return inicio + ((fin - inicio) * posicion) / (total - 1);
}

export function simularEvolucion(generador, { fechas, tamano, damnificadas }) {
  const maximoDesplazadas = tamano * PROPORCION_DESPLAZADA_MAXIMA;
  const desplazadas = fechas.map((_, semana) =>
    Math.round(generador.variar(maximoDesplazadas * FACTORES_DESPLAZAMIENTO[semana], 0.03)),
  );
  const enAlbergue = desplazadas.map((cantidad, semana) =>
    Math.round(
      cantidad * interpolar(PROPORCION_ALBERGUE_INICIAL, PROPORCION_ALBERGUE_FINAL, semana, fechas.length),
    ),
  );
  const atendidas = fechas.map((_, semana) =>
    Math.round(damnificadas * COBERTURA_ATENCION_MAXIMA * (1 - Math.exp(-RITMO_ATENCION * (semana + 1)))),
  );
  return { fechas, desplazadas, enAlbergue, atendidas };
}

export function simularPoblacion(generador, { tamano, departamentos, fechas }) {
  const elegirDepartamento = crearSelector(departamentos);
  const conteo = crearConteo(departamentos.length);
  for (let numero = 0; numero < tamano; numero += 1) {
    registrar(conteo, generarPersona(generador, elegirDepartamento));
  }
  return {
    tamanoMuestra: tamano,
    gruposEdad: comoCategorias(GRUPOS_EDAD, conteo.gruposEdad),
    piramide: {
      grupos: GRUPOS_QUINQUENALES.map(({ nombre }) => nombre),
      hombres: conteo.hombres,
      mujeres: conteo.mujeres,
    },
    condicionInstitucional: comoCategorias(CONDICIONES_INSTITUCIONALES, conteo.condiciones),
    tenencia: comoCategorias(TENENCIAS, conteo.tenencias),
    situacion: comoCategorias(SITUACIONES, conteo.situaciones),
    vulnerabilidad: describirVulnerabilidad(conteo),
    porDepartamento: describirDepartamentos(departamentos, conteo.departamentos),
    evolucion: simularEvolucion(generador, {
      fechas,
      tamano,
      damnificadas: conteo.situaciones[POSICION_DAMNIFICADA],
    }),
  };
}
