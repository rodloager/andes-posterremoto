import { seleccionarMayores } from '../algorithms/mayores.js';
import { UNIDADES_DE_KPI, leerKpi, tipoDeIngrediente } from '../config/kpi.js';
import { noEncontrado } from '../utils/errores.js';
import { agruparCatalogo, crearCruces, crearLector, matriz, valorPublicable } from './publicables.js';

export const UMBRAL_DE_PUBLICACION = 10;
export const ESTADO_DISPONIBLE = 'disponible';
export const ESTADO_SIN_DATO = 'sin-dato';

const MAS_DE = 'más de';
const MENOS_DE = 'menos de';
const CERCA_DE = 'cerca de';

const DESCRIPCION =
  'Indicadores clave calculados por ANDES. Los oficiales combinan cifras publicadas por las entidades y los simulados, registros generados para demostración. Ninguno es una cifra publicada por una entidad.';
const MOTIVOS = Object.freeze({
  sinRegistros: 'No hay registros simulados cargados.',
  suprimido: `Alguna de las cifras necesarias reúne menos de ${UMBRAL_DE_PUBLICACION} registros y no se publica.`,
  sinReportes: 'No hay reportes municipales oficiales cargados para este evento.',
  denominadorCero: 'El denominador es cero, así que la proporción no está definida.',
});

const disponible = (datos) => ({ estado: ESTADO_DISPONIBLE, calificador: null, ...datos });
const sinDato = (motivo) => ({ estado: ESTADO_SIN_DATO, motivo });
const mayorFecha = (...fechas) => fechas.filter(Boolean).sort().at(-1) ?? null;

export function combinarCalificadores(numerador, denominador) {
  if (!numerador && !denominador) {
    return null;
  }
  if (numerador === CERCA_DE || denominador === CERCA_DE) {
    return CERCA_DE;
  }
  const esCotaInferior = numerador === MAS_DE || denominador === MENOS_DE;
  const esCotaSuperior = numerador === MENOS_DE || denominador === MAS_DE;
  if (esCotaInferior && esCotaSuperior) {
    return CERCA_DE;
  }
  return esCotaInferior ? MAS_DE : MENOS_DE;
}

export function valorar(diferencia, sentido) {
  if (sentido === 'neutral') {
    return null;
  }
  if (diferencia === 0) {
    return 'sin_cambio';
  }
  return diferencia > 0 === (sentido === 'mayor_es_mejor') ? 'mejora' : 'empeora';
}

function seriePorFecha(filas) {
  const puntos = new Map();
  for (const fila of filas) {
    const actual = puntos.get(fila.fecha_corte);
    if (!actual || fila.valor > actual.valor) {
      puntos.set(fila.fecha_corte, {
        fechaCorte: fila.fecha_corte,
        valor: fila.valor,
        calificador: fila.calificador ?? null,
        fuente: fila.fuente_id,
      });
    }
  }
  return [...puntos.values()].sort((uno, otro) => uno.fechaCorte.localeCompare(otro.fechaCorte));
}

function evaluarIndicador(codigo, { valoresPorIndicador, catalogo }) {
  const { nombre = codigo, unidad = null } = catalogo.get(codigo) ?? {};
  const serie = seriePorFecha(valoresPorIndicador.get(codigo) ?? []);
  const ultimo = serie.at(-1);
  if (!ultimo) {
    return sinDato(`No hay una cifra oficial de «${nombre}».`);
  }
  return disponible({ ...ultimo, nombre, unidad, serie });
}

function evaluarTerritorial({ variables, mayores }, { valoresMunicipales, carga }) {
  const porMunicipio = new Map();
  for (const fila of valoresMunicipales) {
    if (variables.includes(fila.variable_codigo)) {
      porMunicipio.set(fila.municipio_codigo, (porMunicipio.get(fila.municipio_codigo) ?? 0) + fila.valor);
    }
  }
  if (!carga || porMunicipio.size === 0) {
    return sinDato(MOTIVOS.sinReportes);
  }
  const municipios = [...porMunicipio].map(([codigo, valor]) => ({ codigo, valor }));
  const elegidos = mayores
    ? seleccionarMayores(
        municipios,
        mayores,
        (municipio) => municipio.valor,
        (uno, otro) => uno.codigo.localeCompare(otro.codigo),
      )
    : municipios;
  return disponible({
    valor: elegidos.reduce((suma, municipio) => suma + municipio.valor, 0),
    fechaCorte: carga.hasta,
    fuente: carga.fuente_id,
    municipios: elegidos.length,
  });
}

function sumarPublicables(valores, actualizadoEn) {
  if (valores.some((valor) => valor === null)) {
    return sinDato(MOTIVOS.suprimido);
  }
  const valor = valores.reduce((suma, parte) => suma + parte, 0);
  if (valor < UMBRAL_DE_PUBLICACION) {
    return sinDato(MOTIVOS.suprimido);
  }
  return disponible({ valor, fechaCorte: null, fuente: null, actualizadoEn });
}

function evaluarAgregado({ destino, dimension, categorias }, origen, { publicables }) {
  const fuente = publicables(origen, destino);
  if (!fuente.hayRegistros) {
    return sinDato(MOTIVOS.sinRegistros);
  }
  return sumarPublicables(
    categorias.map((categoria) => valorPublicable(fuente.lector, fuente.catalogo, dimension, categoria)),
    fuente.actualizadoEn,
  );
}

function evaluarCruce(cruce, origen, { publicables }) {
  const fuente = publicables(origen, 'viviendas');
  if (!fuente.hayRegistros) {
    return sinDato(MOTIVOS.sinRegistros);
  }
  const [una, otra] = Object.keys(cruce);
  const tabla = matriz(fuente.cruces, fuente.catalogo, una, otra);
  return sumarPublicables(
    cruce[una].flatMap((categoria) => cruce[otra].map((cruzada) => tabla.celda(categoria, cruzada))),
    fuente.actualizadoEn,
  );
}

function crearPublicables({ agregados, cruces, categorias }) {
  const fuentes = new Map();
  return (origen, destino) => {
    const clave = `${origen}|${destino}`;
    if (!fuentes.has(clave)) {
      const filas = agregados.filter((fila) => fila.origen === origen && fila.destino === destino);
      const lector = crearLector(filas);
      fuentes.set(clave, {
        hayRegistros: filas.some((fila) => fila.dimension === 'total'),
        lector,
        actualizadoEn: lector.actualizadoEn?.toISOString?.() ?? null,
        catalogo: agruparCatalogo(categorias.filter((fila) => fila.destino === destino)),
        cruces: crearCruces(cruces.filter((fila) => fila.origen === origen)),
      });
    }
    return fuentes.get(clave);
  };
}

function evaluar(ingrediente, origen, datos) {
  const tipo = tipoDeIngrediente(ingrediente);
  const parametros = ingrediente[tipo];
  switch (tipo) {
    case 'indicador':
      return evaluarIndicador(parametros, datos);
    case 'territorial':
      return evaluarTerritorial(parametros, datos);
    case 'agregado':
      return evaluarAgregado(parametros, origen, datos);
    default:
      return evaluarCruce(parametros, origen, datos);
  }
}

function serieCompartida(numerador, denominador, escala) {
  if (!numerador.serie || !denominador.serie) {
    return [];
  }
  const denominadores = new Map(denominador.serie.map((punto) => [punto.fechaCorte, punto]));
  return numerador.serie.flatMap((punto) => {
    const base = denominadores.get(punto.fechaCorte);
    return base && base.valor !== 0
      ? [
          {
            fechaCorte: punto.fechaCorte,
            valor: (punto.valor / base.valor) * escala,
            calificador: combinarCalificadores(punto.calificador, base.calificador),
          },
        ]
      : [];
  });
}

function calcularVariacion(serie, numerador, denominador, sentido) {
  const [anterior, actual] = serie.slice(-2);
  const comparable =
    serie.length >= 2 &&
    numerador.fechaCorte === actual.fechaCorte &&
    denominador.fechaCorte === actual.fechaCorte;
  if (!comparable) {
    return null;
  }
  const absoluta = actual.valor - anterior.valor;
  return { absoluta, corteAnterior: anterior.fechaCorte, valoracion: valorar(absoluta, sentido) };
}

function describirParte(definicion, resultado) {
  const tipo = tipoDeIngrediente(definicion);
  return {
    tipo,
    definicion: definicion[tipo],
    nombre: resultado.nombre ?? null,
    unidad: resultado.unidad ?? null,
    valor: resultado.valor,
    calificador: resultado.calificador,
    fechaCorte: resultado.fechaCorte,
    fuente: resultado.fuente,
  };
}

export function calcularIndicadorClave(definicion, datos) {
  const { codigo, nombre, descripcion, modulo, unidad, sentido, origen } = definicion;
  const base = { codigo, nombre, descripcion, modulo, unidad, sentido, origen };
  const numerador = evaluar(definicion.numerador, origen, datos);
  const denominador = evaluar(definicion.denominador, origen, datos);
  const faltante = [numerador, denominador].find((parte) => parte.estado !== ESTADO_DISPONIBLE);
  if (faltante) {
    return { ...base, estado: ESTADO_SIN_DATO, motivoSinDato: faltante.motivo };
  }
  if (denominador.valor === 0) {
    return { ...base, estado: ESTADO_SIN_DATO, motivoSinDato: MOTIVOS.denominadorCero };
  }
  const escala = UNIDADES_DE_KPI[unidad];
  const serie = serieCompartida(numerador, denominador, escala);
  return {
    ...base,
    estado: ESTADO_DISPONIBLE,
    valor: (numerador.valor / denominador.valor) * escala,
    calificador: combinarCalificadores(numerador.calificador, denominador.calificador),
    fechaCorte: mayorFecha(numerador.fechaCorte, denominador.fechaCorte),
    actualizadoEn: mayorFecha(numerador.actualizadoEn, denominador.actualizadoEn),
    numerador: describirParte(definicion.numerador, numerador),
    denominador: describirParte(definicion.denominador, denominador),
    serie,
    variacion: calcularVariacion(serie, numerador, denominador, sentido),
  };
}

function ingredientes(catalogo, tipo) {
  return catalogo.kpi
    .flatMap(({ numerador, denominador }) => [numerador, denominador])
    .filter((ingrediente) => tipoDeIngrediente(ingrediente) === tipo)
    .map((ingrediente) => ingrediente[tipo]);
}

function agrupar(filas, clave) {
  const grupos = new Map();
  for (const fila of filas) {
    const grupo = grupos.get(fila[clave]) ?? [];
    grupo.push(fila);
    grupos.set(fila[clave], grupo);
  }
  return grupos;
}

export function crearServicioKpi(repositorio, { leerConfiguracion = leerKpi } = {}) {
  let configuracion = null;

  function catalogo() {
    if (!configuracion) {
      configuracion = leerConfiguracion();
      configuracion.catch(() => {
        configuracion = null;
      });
    }
    return configuracion;
  }

  return {
    async calcular(evento) {
      const [definiciones, existe] = await Promise.all([catalogo(), repositorio.existeEvento(evento)]);
      if (!existe) {
        throw noEncontrado(`No existe el evento ${evento}.`);
      }
      const codigos = [...new Set(ingredientes(definiciones, 'indicador'))];
      const variables = [
        ...new Set(ingredientes(definiciones, 'territorial').flatMap(({ variables: lista }) => lista)),
      ];
      const [nombres, valores, valoresMunicipales, carga, agregados, cruces, categorias] = await Promise.all([
        repositorio.nombresDeIndicadores(codigos),
        repositorio.valoresIndicador(evento, codigos),
        repositorio.valoresMunicipales(evento, variables),
        repositorio.cargaTerritorial(evento),
        repositorio.agregadosNacionales(evento),
        repositorio.crucesNacionales(evento),
        repositorio.categorias(),
      ]);
      const datos = {
        catalogo: new Map(nombres.map((fila) => [fila.codigo, fila])),
        valoresPorIndicador: agrupar(valores, 'indicador_codigo'),
        valoresMunicipales,
        carga,
        publicables: crearPublicables({ agregados, cruces, categorias }),
      };
      return {
        meta: { descripcion: DESCRIPCION, umbralDePublicacion: UMBRAL_DE_PUBLICACION },
        kpi: definiciones.kpi.map((definicion) => calcularIndicadorClave(definicion, datos)),
      };
    },
  };
}
