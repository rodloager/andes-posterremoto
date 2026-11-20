import { CODIGO_NACIONAL, DIMENSION_TOTAL, NIVELES } from '../algorithms/agregacion.js';
import { analizarAseguramiento, crearCubo, embudoDeReclamaciones } from '../algorithms/aseguramiento.js';
import { AVISO_PRIORIZACION, normalizarPesos, priorizar } from '../algorithms/priorizacion.js';
import { MARCAS, analizarTendencia } from '../algorithms/tendencias.js';
import { leerPriorizacion } from '../config/priorizacion.js';
import { GRUPOS_DE_EDAD, QUINQUENIOS, SIN_DATO } from '../models/dimensiones.js';
import { ErrorHttp, noEncontrado } from '../utils/errores.js';

const ESCALA_DE_PESOS = 100;

const AVISO_SIMULADO =
  'Datos simulados para demostrar el proceso de carga y análisis. No son cifras oficiales.';
const NOTA_DE_VULNERABILIDAD =
  'Una persona puede tener varias condiciones de vulnerabilidad, así que esas proporciones no suman 100 %.';
const NOTA_DE_ORIGENES =
  'El puntaje combina cifras oficiales con datos simulados. Sirve para demostrar el modelo, no para describir la situación real.';
const NOTAS_DE_PRIORIZACION = Object.freeze([
  'Un criterio sin dato en una zona aporta cero al puntaje de esa zona.',
  'Los valores son absolutos: la plataforma no tiene la población de cada municipio para calcular tasas por cada mil habitantes.',
]);
const MOTIVOS_DE_EXCLUSION = Object.freeze({
  sinFuente: 'La plataforma no tiene datos para este criterio.',
  sinDatos: 'Ninguna zona tiene datos para este criterio.',
  sinPeso: 'El criterio tiene peso cero en la configuración.',
});
const DIAS_POR_SEMANA = 7;
const LONGITUD_DE_DEPARTAMENTO = 2;
const ORDEN_DE_SEXOS = Object.freeze(['F', 'M', SIN_DATO]);
const ORDEN_DE_ESTRATOS = Object.freeze(['1', '2', '3', '4', '5', '6', SIN_DATO]);
const ORDEN_DE_VULNERABLE = Object.freeze(['SI', 'NO']);

function nivelDe(territorio) {
  if (territorio === CODIGO_NACIONAL) {
    return NIVELES.nacional;
  }
  return territorio.length === LONGITUD_DE_DEPARTAMENTO ? NIVELES.departamento : NIVELES.municipio;
}

function agruparPorDimension(filas) {
  const dimensiones = new Map();
  for (const fila of filas) {
    const celdas = dimensiones.get(fila.dimension) ?? [];
    celdas.push(fila);
    dimensiones.set(fila.dimension, celdas);
  }
  return dimensiones;
}

function ultimaActualizacion(filas) {
  return filas.reduce(
    (ultima, { actualizado_en: actualizadoEn }) =>
      ultima === null || actualizadoEn > ultima ? actualizadoEn : ultima,
    null,
  );
}

const porCantidad = (una, otra) =>
  otra.cantidad - una.cantidad || una.categoria.localeCompare(otra.categoria);

function ordenSegun(catalogo) {
  const posiciones = new Map(catalogo.map((codigo, posicion) => [codigo, posicion]));
  const posicionDe = (categoria) => posiciones.get(categoria) ?? catalogo.length;
  return (una, otra) =>
    posicionDe(una.categoria) - posicionDe(otra.categoria) || una.categoria.localeCompare(otra.categoria);
}

function distribucion(celdas = [], total = 0, orden = porCantidad) {
  return celdas
    .map(({ categoria, cantidad }) => ({
      categoria,
      cantidad,
      proporcion: total === 0 ? null : cantidad / total,
    }))
    .sort(orden);
}

function piramide(celdas = []) {
  const posiciones = new Map(QUINQUENIOS.map((quinquenio, posicion) => [quinquenio, posicion]));
  return celdas
    .map(({ categoria, cantidad }) => {
      const [quinquenio, sexo] = categoria.split('|');
      return { quinquenio, sexo, cantidad };
    })
    .sort(
      (una, otra) =>
        posiciones.get(una.quinquenio) - posiciones.get(otra.quinquenio) || una.sexo.localeCompare(otra.sexo),
    );
}

function serieSemanal(celdas = []) {
  const serie = celdas
    .map(({ categoria, cantidad }) => ({ fecha: categoria, valor: cantidad }))
    .sort((una, otra) => una.fecha.localeCompare(otra.fecha));
  const { tendencia, pendiente, cortes } = analizarTendencia(serie);
  return {
    serie,
    tendencia,
    cambioPorSemana: pendiente === null ? null : pendiente * DIAS_POR_SEMANA,
    anomalias: cortes.filter(({ marcas }) => marcas.includes(MARCAS.anomalia)).map(({ fecha }) => fecha),
  };
}

function motivoDeExclusion(criterio, zonasConDato) {
  if (!criterio.fuente) {
    return MOTIVOS_DE_EXCLUSION.sinFuente;
  }
  if (zonasConDato === 0) {
    return MOTIVOS_DE_EXCLUSION.sinDatos;
  }
  return criterio.peso === 0 ? MOTIVOS_DE_EXCLUSION.sinPeso : null;
}

export function crearServicioEstadisticas(repositorio, { leerConfiguracion = leerPriorizacion } = {}) {
  let configuracion = null;

  function configuracionDePriorizacion() {
    if (!configuracion) {
      configuracion = leerConfiguracion();
      configuracion.catch(() => {
        configuracion = null;
      });
    }
    return configuracion;
  }

  async function exigirEvento(codigo) {
    const evento = await repositorio.evento(codigo);
    if (!evento) {
      throw noEncontrado(`No existe el evento ${codigo}.`);
    }
    return evento;
  }

  async function describirTerritorio(codigo) {
    const nivel = nivelDe(codigo);
    if (nivel === NIVELES.nacional) {
      return { codigo, nivel, nombre: 'Colombia' };
    }
    if (nivel === NIVELES.departamento) {
      const departamento = await repositorio.departamento(codigo);
      if (!departamento) {
        throw noEncontrado(`No existe el departamento ${codigo}.`);
      }
      return { codigo, nivel, nombre: departamento.nombre };
    }
    const municipio = await repositorio.municipio(codigo);
    if (!municipio) {
      throw noEncontrado(`No existe el municipio ${codigo}.`);
    }
    return {
      codigo,
      nivel,
      nombre: municipio.nombre,
      departamento: { codigo: municipio.departamento_codigo, nombre: municipio.departamento },
    };
  }

  async function leerAgregados({ evento, territorio, origen }, destino) {
    const [registroDelEvento, descripcion] = await Promise.all([
      exigirEvento(evento),
      describirTerritorio(territorio),
    ]);
    const filas = await repositorio.agregados({
      eventoId: registroDelEvento.id,
      origen,
      destino,
      nivel: descripcion.nivel,
      territorio,
    });
    const dimensiones = agruparPorDimension(filas);
    const [total] = dimensiones.get(DIMENSION_TOTAL) ?? [];
    return {
      meta: {
        evento,
        origen,
        aviso: origen === 'SIMULADO' ? AVISO_SIMULADO : null,
        territorio: descripcion,
        actualizadoEn: ultimaActualizacion(filas),
      },
      total: total?.cantidad ?? 0,
      suma: total?.suma ?? 0,
      dimensiones,
    };
  }

  async function valoresDelCriterio(fuente, { evento, eventoId }) {
    const valores = new Map();
    if (fuente.tipo === 'variable_territorial') {
      for (const { municipio_codigo: municipio, valor } of await repositorio.valoresTerritoriales(
        evento,
        fuente.variables,
      )) {
        if (typeof valor === 'number') {
          valores.set(municipio, (valores.get(municipio) ?? 0) + valor);
        }
      }
      return valores;
    }
    const filas = await repositorio.agregadosMunicipales({
      eventoId,
      origen: fuente.origen,
      destino: fuente.destino,
      dimension: fuente.dimension,
      categoria: fuente.categoria,
    });
    for (const { territorio, dimension, cantidad } of filas) {
      if (dimension === fuente.dimension) {
        valores.set(territorio, cantidad);
      } else if (!valores.has(territorio)) {
        valores.set(territorio, 0);
      }
    }
    return valores;
  }

  return {
    async poblacion(filtros) {
      const { meta, total, suma, dimensiones } = await leerAgregados(filtros, 'personas');
      const de = (dimension, orden) => distribucion(dimensiones.get(dimension), total, orden);
      return {
        meta: { ...meta, notas: [NOTA_DE_VULNERABILIDAD] },
        total,
        edadPromedio: total === 0 ? null : suma / total,
        distribuciones: {
          grupoEdad: de('grupo_edad', ordenSegun(GRUPOS_DE_EDAD)),
          sexo: de('sexo', ordenSegun(ORDEN_DE_SEXOS)),
          condicion: de('condicion'),
          grupoCondicion: de('grupo_condicion'),
          tenencia: de('tenencia'),
          situacion: de('situacion'),
          condicionSalud: de('condicion_salud'),
          vulnerabilidad: de('vulnerabilidad'),
          vulnerable: de('vulnerable', ordenSegun(ORDEN_DE_VULNERABLE)),
        },
        piramide: piramide(dimensiones.get('quinquenio_sexo')),
        registrosPorSemana: serieSemanal(dimensiones.get('semana')),
      };
    },

    async aseguramiento(filtros) {
      const { meta, total, dimensiones } = await leerAgregados(filtros, 'viviendas');
      const cubo = crearCubo();
      for (const { categoria, cantidad } of dimensiones.get('cubo') ?? []) {
        const [estado, aseguramiento, financiacion] = categoria.split('|');
        cubo.agregarCelda(estado, aseguramiento, financiacion, cantidad);
      }
      const reclamaciones = Object.fromEntries(
        (dimensiones.get('reclamacion') ?? []).map(({ categoria, cantidad }) => [categoria, cantidad]),
      );
      const de = (dimension, orden) => distribucion(dimensiones.get(dimension), total, orden);
      return {
        meta,
        total,
        analisis: analizarAseguramiento(cubo),
        reclamaciones: embudoDeReclamaciones(reclamaciones),
        distribuciones: {
          zona: de('zona'),
          estrato: de('estrato', ordenSegun(ORDEN_DE_ESTRATOS)),
          ocupacion: de('ocupacion'),
        },
        celdasDescartadas: cubo.descartadas,
        registrosPorSemana: serieSemanal(dimensiones.get('semana')),
      };
    },

    async priorizacion({ evento, k, pesos }) {
      const [registroDelEvento, { criterios: configurados, k: tamanoPorDefecto }] = await Promise.all([
        exigirEvento(evento),
        configuracionDePriorizacion(),
      ]);
      const zonas = await repositorio.zonasConReporte(evento);
      const valoresPorZona = new Map(zonas.map(({ codigo }) => [codigo, {}]));
      const criterios = [];
      for (const criterio of configurados) {
        const valores = criterio.fuente
          ? await valoresDelCriterio(criterio.fuente, { evento, eventoId: registroDelEvento.id })
          : new Map();
        let zonasConDato = 0;
        for (const [codigo, deLaZona] of valoresPorZona) {
          const valor = valores.get(codigo);
          if (typeof valor === 'number') {
            deLaZona[criterio.codigo] = valor;
            zonasConDato += 1;
          }
        }
        const motivo = motivoDeExclusion(criterio, zonasConDato);
        criterios.push({
          codigo: criterio.codigo,
          nombre: criterio.nombre,
          descripcion: criterio.descripcion,
          origen: criterio.fuente?.origen ?? null,
          pesoConfigurado: criterio.peso,
          masEsMejor: criterio.mas_es_mejor,
          zonasConDato,
          incluido: motivo === null,
          motivo,
        });
      }
      const desconocidos = Object.keys(pesos ?? {}).filter(
        (codigo) => !criterios.some((criterio) => criterio.codigo === codigo),
      );
      if (desconocidos.length > 0) {
        throw new ErrorHttp(400, 'VALIDACION', `No existe el criterio ${desconocidos.join(', ')}.`);
      }
      const incluidos = criterios.filter(({ incluido }) => incluido);
      const tamano = k ?? tamanoPorDefecto;
      const notas = [...NOTAS_DE_PRIORIZACION];
      if (new Set(incluidos.map(({ origen }) => origen)).size > 1) {
        notas.unshift(NOTA_DE_ORIGENES);
      }
      const meta = {
        evento,
        zonas: zonas.length,
        k: tamano,
        notas,
        pesosPersonalizados: pesos !== undefined,
      };
      if (incluidos.length === 0) {
        return {
          aviso: AVISO_PRIORIZACION,
          meta,
          criterios: criterios.map((criterio) => ({
            ...criterio,
            pesoSolicitado: pesos?.[criterio.codigo] ?? null,
            peso: null,
          })),
          zonas: [],
          salientes: [],
        };
      }
      const modeloBase = incluidos.map(({ codigo, pesoConfigurado, masEsMejor }) => ({
        codigo,
        peso: pesoConfigurado,
        masEsMejor,
      }));
      const repartoBase = normalizarPesos(modeloBase);
      const modelo = modeloBase.map((criterio, posicion) => ({
        ...criterio,
        peso: pesos?.[criterio.codigo] ?? repartoBase[posicion] * ESCALA_DE_PESOS,
      }));
      if (modelo.every(({ peso }) => peso === 0)) {
        throw new ErrorHttp(
          400,
          'VALIDACION',
          'Al menos un criterio con datos debe tener un peso mayor que cero.',
        );
      }
      const normalizados = new Map(
        normalizarPesos(modelo).map((peso, posicion) => [modelo[posicion].codigo, peso]),
      );
      const zonaPorCodigo = new Map(zonas.map((zona) => [zona.codigo, zona]));
      const evaluables = zonas.map(({ codigo, nombre }) => ({
        codigo,
        nombre,
        valores: valoresPorZona.get(codigo),
      }));
      const ordenTotal = priorizar(evaluables, { criterios: modelo, k: zonas.length });
      const posicionesBase = pesos
        ? new Map(
            priorizar(evaluables, { criterios: modeloBase, k: zonas.length }).map(({ codigo, posicion }) => [
              codigo,
              posicion,
            ]),
          )
        : new Map(ordenTotal.map(({ codigo, posicion }) => [codigo, posicion]));
      const posiciones = new Map(ordenTotal.map(({ codigo, posicion }) => [codigo, posicion]));
      const departamentoDe = (codigo) => ({
        codigo: zonaPorCodigo.get(codigo).departamento_codigo,
        nombre: zonaPorCodigo.get(codigo).departamento,
      });
      return {
        aviso: AVISO_PRIORIZACION,
        meta,
        criterios: criterios.map((criterio) => ({
          ...criterio,
          pesoSolicitado: pesos?.[criterio.codigo] ?? null,
          peso: normalizados.get(criterio.codigo) ?? null,
        })),
        zonas: ordenTotal.slice(0, tamano).map(({ posicion, codigo, nombre, puntaje, aportes }) => ({
          posicion,
          posicionBase: posicionesBase.get(codigo),
          cambio: posicionesBase.get(codigo) - posicion,
          codigo,
          nombre,
          departamento: departamentoDe(codigo),
          puntaje,
          aportes,
        })),
        salientes: [...posicionesBase]
          .filter(([codigo, posicionBase]) => posicionBase <= tamano && posiciones.get(codigo) > tamano)
          .sort((una, otra) => una[1] - otra[1])
          .map(([codigo, posicionBase]) => ({
            codigo,
            nombre: zonaPorCodigo.get(codigo).nombre,
            departamento: departamentoDe(codigo),
            posicionBase,
            posicion: posiciones.get(codigo),
          })),
      };
    },
  };
}
