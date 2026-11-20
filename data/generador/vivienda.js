import { crearSelector } from './aleatorio.js';
import {
  ASEGURAMIENTOS,
  ESTADOS_FISICOS,
  ESTRATOS,
  FINANCIACIONES,
  OCUPACIONES,
  POSICION_ASEGURADA,
  POSICION_DESTRUCCION_TOTAL,
  POSICION_NO_ASEGURADA,
  POSICION_POLIZA_PENDIENTE,
  PROBABILIDAD_POLIZA_PENDIENTE,
  RECLAMACIONES,
} from './catalogos.js';

const VARIACION_DEL_VALOR = 0.25;
const POSICION_PROPIA = 0;
const POSICION_ARRENDADA = 1;
const DEPARTAMENTOS_EN_LISTA = 5;

const elegirEstado = crearSelector(ESTADOS_FISICOS);
const elegirOcupacion = crearSelector(OCUPACIONES);
const elegirFinanciacion = crearSelector(FINANCIACIONES);
const elegirEstrato = crearSelector(ESTRATOS);
const elegirResolucion = crearSelector(RECLAMACIONES.resoluciones);

const ceros = (cantidad) => new Array(cantidad).fill(0);
const matriz = (filas, columnas) => Array.from({ length: filas }, () => ceros(columnas));
const sumar = (cantidades) => cantidades.reduce((total, cantidad) => total + cantidad, 0);

function elegirAseguramiento(generador, financiacion) {
  if (generador.ocurre(PROBABILIDAD_POLIZA_PENDIENTE)) {
    return POSICION_POLIZA_PENDIENTE;
  }
  return generador.ocurre(FINANCIACIONES[financiacion].probabilidadSeguro)
    ? POSICION_ASEGURADA
    : POSICION_NO_ASEGURADA;
}

function generarVivienda(generador, elegirDepartamento) {
  const financiacion = elegirFinanciacion(generador);
  return {
    estado: elegirEstado(generador),
    ocupacion: elegirOcupacion(generador),
    financiacion,
    aseguramiento: elegirAseguramiento(generador, financiacion),
    valor: Math.round(generador.variar(ESTRATOS[elegirEstrato(generador)].valorBase, VARIACION_DEL_VALOR)),
    departamento: elegirDepartamento(generador),
  };
}

function crearConteo(cantidadDepartamentos) {
  return {
    estados: ceros(ESTADOS_FISICOS.length),
    ocupacionesAfectadas: ceros(OCUPACIONES.length),
    aseguramientosAfectadas: ceros(ASEGURAMIENTOS.length),
    financiaciones: ceros(FINANCIACIONES.length),
    estadoPorAseguramiento: matriz(ESTADOS_FISICOS.length, ASEGURAMIENTOS.length),
    financiacionPorAseguramiento: matriz(FINANCIACIONES.length, ASEGURAMIENTOS.length),
    sinSeguroPorDepartamento: ceros(cantidadDepartamentos),
    embudo: { presentadas: 0, aprobada: 0, rechazada: 0, enEstudio: 0, pagadas: 0 },
    valorDestruidas: 0,
    inconsistencias: 0,
  };
}

function registrarReclamacion(embudo, generador) {
  if (!generador.ocurre(RECLAMACIONES.probabilidadPresentar)) {
    return;
  }
  embudo.presentadas += 1;
  const resolucion = RECLAMACIONES.resoluciones[elegirResolucion(generador)].nombre;
  embudo[resolucion] += 1;
  if (resolucion === 'aprobada' && generador.ocurre(RECLAMACIONES.probabilidadPago)) {
    embudo.pagadas += 1;
  }
}

function registrarAfectada(conteo, vivienda, generador) {
  conteo.ocupacionesAfectadas[vivienda.ocupacion] += 1;
  conteo.aseguramientosAfectadas[vivienda.aseguramiento] += 1;
  if (vivienda.aseguramiento === POSICION_NO_ASEGURADA) {
    conteo.sinSeguroPorDepartamento[vivienda.departamento] += 1;
  }
  if (vivienda.aseguramiento === POSICION_ASEGURADA) {
    registrarReclamacion(conteo.embudo, generador);
  }
  if (vivienda.estado === POSICION_DESTRUCCION_TOTAL) {
    conteo.valorDestruidas += vivienda.valor;
  }
}

function registrar(conteo, vivienda, generador) {
  conteo.estados[vivienda.estado] += 1;
  conteo.financiaciones[vivienda.financiacion] += 1;
  conteo.estadoPorAseguramiento[vivienda.estado][vivienda.aseguramiento] += 1;
  conteo.financiacionPorAseguramiento[vivienda.financiacion][vivienda.aseguramiento] += 1;
  const exigeSeguro = FINANCIACIONES[vivienda.financiacion].exigeSeguro;
  if (exigeSeguro && vivienda.aseguramiento === POSICION_NO_ASEGURADA) {
    conteo.inconsistencias += 1;
  }
  if (ESTADOS_FISICOS[vivienda.estado].afectada) {
    registrarAfectada(conteo, vivienda, generador);
  }
}

const comoCategorias = (catalogo, cantidades) =>
  catalogo.map(({ nombre }, posicion) => ({ nombre, viviendas: cantidades[posicion] }));

const nombres = (catalogo) => catalogo.map(({ nombre }) => nombre);

function describirEmbudo(embudo, aseguradasAfectadas) {
  return [
    { etapa: 'Aseguradas y afectadas', viviendas: aseguradasAfectadas },
    { etapa: 'Reclamación presentada', viviendas: embudo.presentadas },
    { etapa: 'Reclamación aprobada', viviendas: embudo.aprobada },
    { etapa: 'Indemnización pagada', viviendas: embudo.pagadas },
  ];
}

function describirCoberturaDestruidas(fila) {
  const total = sumar(fila);
  return {
    destruidas: total,
    conPoliza: fila[POSICION_ASEGURADA],
    porVerificar: fila[POSICION_POLIZA_PENDIENTE],
    porcentajeMinimo: (fila[POSICION_ASEGURADA] / total) * 100,
    porcentajeMaximo: ((fila[POSICION_ASEGURADA] + fila[POSICION_POLIZA_PENDIENTE]) / total) * 100,
  };
}

function describirSinSeguro(departamentos, cantidades) {
  return departamentos
    .map(({ codigo, nombre }, posicion) => ({ codigo, nombre, viviendas: cantidades[posicion] }))
    .sort((a, b) => b.viviendas - a.viviendas)
    .slice(0, DEPARTAMENTOS_EN_LISTA);
}

function describir(conteo, departamentos, tamano) {
  const afectadas = sumar(conteo.ocupacionesAfectadas);
  const aseguradasAfectadas = conteo.aseguramientosAfectadas[POSICION_ASEGURADA];
  return {
    tamanoMuestra: tamano,
    afectadas,
    estadoFisico: comoCategorias(ESTADOS_FISICOS, conteo.estados),
    ocupacion: comoCategorias(OCUPACIONES, conteo.ocupacionesAfectadas),
    aseguramiento: comoCategorias(ASEGURAMIENTOS, conteo.aseguramientosAfectadas),
    financiacion: comoCategorias(FINANCIACIONES, conteo.financiaciones),
    estadoPorAseguramiento: {
      filas: nombres(ESTADOS_FISICOS),
      columnas: nombres(ASEGURAMIENTOS),
      valores: conteo.estadoPorAseguramiento,
    },
    financiacionPorAseguramiento: {
      filas: nombres(FINANCIACIONES),
      columnas: nombres(ASEGURAMIENTOS),
      valores: conteo.financiacionPorAseguramiento,
    },
    embudoReclamaciones: describirEmbudo(conteo.embudo, aseguradasAfectadas),
    reclamaciones: {
      enEstudio: conteo.embudo.enEstudio,
      rechazadas: conteo.embudo.rechazada,
      indemnizacionPendiente: conteo.embudo.aprobada - conteo.embudo.pagadas,
    },
    coberturaDestruidas: describirCoberturaDestruidas(
      conteo.estadoPorAseguramiento[POSICION_DESTRUCCION_TOTAL],
    ),
    propiasAfectadas: conteo.ocupacionesAfectadas[POSICION_PROPIA],
    arrendadasAfectadas: conteo.ocupacionesAfectadas[POSICION_ARRENDADA],
    valorDestruidas: conteo.valorDestruidas,
    sinSeguroPorDepartamento: describirSinSeguro(departamentos, conteo.sinSeguroPorDepartamento),
    financiadasSinSeguro: conteo.inconsistencias,
  };
}

export function simularVivienda(generador, { tamano, departamentos }) {
  const elegirDepartamento = crearSelector(departamentos);
  const conteo = crearConteo(departamentos.length);
  for (let numero = 0; numero < tamano; numero += 1) {
    registrar(conteo, generarVivienda(generador, elegirDepartamento), generador);
  }
  return describir(conteo, departamentos, tamano);
}
