import { suprimirComplementaria, suprimirEnMatriz } from '../algorithms/supresion.js';
import { QUINQUENIOS } from '../models/dimensiones.js';
import { noEncontrado } from '../utils/errores.js';
import { UMBRAL_DE_PUBLICACION } from './kpi.js';
import {
  agruparCatalogo,
  crearCruces,
  crearLector,
  matriz,
  particion,
  sumarConocidos,
} from './publicables.js';

const SEXOS_DE_LA_PIRAMIDE = Object.freeze(['M', 'F', 'SIN_DATO']);
export const INDICADORES_DE_VIVIENDAS_REGISTRADAS = Object.freeze([
  'viviendas_aseguradas',
  'viviendas_no_aseguradas',
  'viviendas_propias_afectadas',
  'viviendas_arrendadas_afectadas',
  'valor_viviendas_destruidas',
  'reclamaciones_pendientes',
]);
const ADVERTENCIA = `Registros simulados por el proyecto y cargados en la base de datos para demostrar la plataforma. No son cifras oficiales ni estimaciones. Las cifras con menos de ${UMBRAL_DE_PUBLICACION} registros no se publican.`;

const porMayor = (clave) => (uno, otro) => (otro[clave] ?? -1) - (uno[clave] ?? -1);

export function etiquetaDeQuinquenio(codigo) {
  const [desde, hasta] = codigo.split('_');
  return hasta === 'MAS' ? `${Number(desde)} o más` : `${Number(desde)} a ${Number(hasta)}`;
}

const comoTabla = ({ filas, columnas, valores }) => ({
  filas: filas.map(({ nombre }) => nombre),
  columnas: columnas.map(({ nombre }) => nombre),
  valores,
});

function listaDepartamental(valores, departamentos, clave) {
  const nombres = new Map(departamentos.map(({ codigo, nombre }) => [codigo, nombre]));
  const { valores: protegidos } = suprimirComplementaria(valores.map(({ cantidad }) => cantidad));
  return valores
    .map(({ territorio }, posicion) => ({
      codigo: territorio,
      nombre: nombres.get(territorio) ?? territorio,
      [clave]: protegidos[posicion],
    }))
    .sort(porMayor(clave));
}

function piramide(lector) {
  const { valores } = suprimirEnMatriz(
    QUINQUENIOS.map((quinquenio) =>
      SEXOS_DE_LA_PIRAMIDE.map((sexo) => lector.cantidad('quinquenio_sexo', `${quinquenio}|${sexo}`)),
    ),
  );
  return {
    grupos: QUINQUENIOS.map(etiquetaDeQuinquenio),
    hombres: valores.map((fila) => fila[0]),
    mujeres: valores.map((fila) => fila[1]),
  };
}

function evolucion(lector) {
  const fechas = lector.categorias('semana').sort();
  const { valores } = suprimirComplementaria(fechas.map((fecha) => lector.cantidad('semana', fecha)));
  return { fechas, registradas: valores };
}

function meta(lector) {
  return {
    origen: 'SIMULADO',
    nivel: 'S',
    fuente: 'generador-andes',
    advertencia: ADVERTENCIA,
    umbralDePublicacion: UMBRAL_DE_PUBLICACION,
    actualizadoEn: lector.actualizadoEn,
  };
}

const muestraDe = (cantidad, unidad) =>
  `Muestra simulada de ${new Intl.NumberFormat('es-CO').format(cantidad)} ${unidad}`;

function indicadoresPublicables(valores, muestra) {
  return Object.fromEntries(
    Object.entries(valores).map(([codigo, valor]) => [codigo, valor === null ? null : { valor, muestra }]),
  );
}

export function crearServicioRegistros(repositorio) {
  async function exigirEvento(evento) {
    if (!(await repositorio.existeEvento(evento))) {
      throw noEncontrado(`No existe el evento ${evento}.`);
    }
  }

  return {
    async poblacion(evento) {
      await exigirEvento(evento);
      const [filas, categorias, departamentos] = await Promise.all([
        repositorio.agregados(evento, 'personas'),
        repositorio.categorias('personas'),
        repositorio.departamentos(),
      ]);
      const lector = crearLector(filas);
      const catalogo = agruparCatalogo(categorias);
      const parte = (dimension) => particion(lector, catalogo, dimension, 'personas');
      return {
        meta: meta(lector),
        tamanoMuestra: lector.cantidad('total', 'TOTAL'),
        gruposEdad: parte('grupo_edad'),
        piramide: piramide(lector),
        condicionInstitucional: parte('condicion'),
        tenencia: parte('tenencia'),
        situacion: parte('situacion'),
        condicionSalud: parte('condicion_salud'),
        vulnerabilidad: catalogo('vulnerabilidad').map(({ categoria, nombre }) => ({
          codigo: categoria,
          nombre,
          personas: lector.cantidad('vulnerabilidad', categoria),
        })),
        porDepartamento: listaDepartamental(lector.territorios('total', 'TOTAL'), departamentos, 'personas'),
        evolucion: evolucion(lector),
        indicadores: {},
      };
    },

    async viviendas(evento) {
      await exigirEvento(evento);
      const [filas, filasDeCruces, categorias, departamentos] = await Promise.all([
        repositorio.agregados(evento, 'viviendas'),
        repositorio.cruces(evento),
        repositorio.categorias('viviendas'),
        repositorio.departamentos(),
      ]);
      const lector = crearLector(filas);
      const catalogo = agruparCatalogo(categorias);
      const cruces = crearCruces(filasDeCruces);
      const total = lector.cantidad('total', 'TOTAL');
      const afectados = catalogo('estado_fisico')
        .filter(({ afectada }) => afectada)
        .map(({ categoria }) => categoria);
      const exigenSeguro = catalogo('financiacion')
        .filter(({ exige_seguro: exige }) => exige)
        .map(({ categoria }) => categoria);

      const estadoFisico = particion(lector, catalogo, 'estado_fisico', 'viviendas');
      const reclamacion = particion(lector, catalogo, 'reclamacion', 'viviendas');
      const aseguramientoTotal = particion(lector, catalogo, 'aseguramiento', 'viviendas');
      const estadoPorAseguramiento = matriz(cruces, catalogo, 'estado_fisico', 'aseguramiento');
      const estadoPorOcupacion = matriz(cruces, catalogo, 'estado_fisico', 'ocupacion');
      const financiacionPorAseguramiento = matriz(cruces, catalogo, 'financiacion', 'aseguramiento');

      const deLista = (lista, codigo) => {
        const elemento = lista.find((candidato) => candidato.codigo === codigo);
        return elemento ? elemento.viviendas : 0;
      };
      const entreAfectadas = (tabla, dimension) =>
        catalogo(dimension).map(({ categoria, nombre }) => ({
          codigo: categoria,
          nombre,
          viviendas: tabla.columnaEntre(afectados, categoria),
        }));
      const ocupacion = entreAfectadas(estadoPorOcupacion, 'ocupacion');
      const aseguramiento = entreAfectadas(estadoPorAseguramiento, 'aseguramiento');
      const destruidas = deLista(estadoFisico, 'DESTRUCCION_TOTAL');
      const conPoliza = estadoPorAseguramiento.celda('DESTRUCCION_TOTAL', 'ASEGURADA');
      const porVerificar = estadoPorAseguramiento.celda('DESTRUCCION_TOTAL', 'PENDIENTE_VERIFICACION');
      const porcentaje = (parte) =>
        parte === null || destruidas === null || destruidas === 0 ? null : (parte / destruidas) * 100;
      const sinSeguro = cruces.territorios().map((territorio) => ({
        territorio,
        cantidad: matriz(cruces, catalogo, 'estado_fisico', 'aseguramiento', {
          nivel: 'DEPARTAMENTO',
          territorio,
        }).columnaEntre(afectados, 'NO_ASEGURADA'),
      }));
      const valores = {
        aseguradas: deLista(aseguramiento, 'ASEGURADA'),
        noAseguradas: deLista(aseguramiento, 'NO_ASEGURADA'),
        propias: deLista(ocupacion, 'PROPIA'),
        arrendadas: deLista(ocupacion, 'ARRENDADA'),
        valorDestruidas: destruidas === null ? null : lector.suma('estado_fisico', 'DESTRUCCION_TOTAL'),
        enEstudio: deLista(reclamacion, 'EN_ESTUDIO'),
      };

      return {
        meta: meta(lector),
        tamanoMuestra: total,
        afectadas: sumarConocidos(
          estadoFisico.filter(({ codigo }) => afectados.includes(codigo)).map(({ viviendas }) => viviendas),
        ),
        estadoFisico,
        ocupacion,
        aseguramiento,
        financiacion: particion(lector, catalogo, 'financiacion', 'viviendas'),
        estadoPorAseguramiento: comoTabla(estadoPorAseguramiento),
        financiacionPorAseguramiento: comoTabla(financiacionPorAseguramiento),
        embudoReclamaciones: [
          { etapa: 'Viviendas aseguradas', viviendas: deLista(aseguramientoTotal, 'ASEGURADA') },
          {
            etapa: 'Reclamación presentada',
            viviendas: sumarConocidos(
              ['EN_ESTUDIO', 'RECHAZADA', 'APROBADA', 'PAGADA'].map((codigo) => deLista(reclamacion, codigo)),
            ),
          },
          {
            etapa: 'Reclamación aprobada',
            viviendas: sumarConocidos(['APROBADA', 'PAGADA'].map((codigo) => deLista(reclamacion, codigo))),
          },
          { etapa: 'Indemnización pagada', viviendas: deLista(reclamacion, 'PAGADA') },
        ],
        reclamaciones: {
          enEstudio: valores.enEstudio,
          rechazadas: deLista(reclamacion, 'RECHAZADA'),
          indemnizacionPendiente: deLista(reclamacion, 'APROBADA'),
        },
        coberturaDestruidas: {
          destruidas,
          conPoliza,
          porVerificar,
          porcentajeMinimo: porcentaje(conPoliza),
          porcentajeMaximo: porcentaje(
            porVerificar === null ? null : sumarConocidos([conPoliza, porVerificar]),
          ),
        },
        propiasAfectadas: valores.propias,
        arrendadasAfectadas: valores.arrendadas,
        valorDestruidas: valores.valorDestruidas,
        sinSeguroPorDepartamento: listaDepartamental(sinSeguro, departamentos, 'viviendas')
          .filter(({ viviendas }) => viviendas !== null)
          .slice(0, 5),
        financiadasSinSeguro: sumarConocidos(
          exigenSeguro.map((codigo) => financiacionPorAseguramiento.celda(codigo, 'NO_ASEGURADA')),
        ),
        indicadores: indicadoresPublicables(
          {
            viviendas_aseguradas: valores.aseguradas,
            viviendas_no_aseguradas: valores.noAseguradas,
            viviendas_propias_afectadas: valores.propias,
            viviendas_arrendadas_afectadas: valores.arrendadas,
            valor_viviendas_destruidas: valores.valorDestruidas,
            reclamaciones_pendientes: valores.enEstudio,
          },
          muestraDe(total ?? 0, 'viviendas'),
        ),
      };
    },
  };
}
