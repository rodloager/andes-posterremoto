import { crearAutocompletado } from '../algorithms/busqueda.js';
import { noEncontrado } from '../utils/errores.js';
import {
  comoEconomia,
  comoEvento,
  comoFuente,
  comoIndicadores,
  comoSeguros,
  comoTerritorio,
} from './documentos.js';

const DESCRIPCION_FUENTES =
  'Catálogo de fuentes de la plataforma. Cada cifra publicada apunta a una de estas fichas.';
const DESCRIPCION_INDICADORES =
  'Catálogo de indicadores nacionales con su serie de valores oficiales por fecha de corte. Una serie vacía significa que no se localizó una cifra oficial.';
const NOTA_SEGUROS =
  'Fasecolda informa reclamaciones de todos los ramos. No informa cuántas viviendas afectadas tenían seguro.';
const NOTA_ECONOMIA = 'Las cifras provienen de entidades y fechas distintas. No se suman entre sí.';
const NIVELES = Object.freeze({
  A: 'Fuente primaria leída directamente.',
  B: 'Cifra oficial leída en un tercero que cita a la entidad.',
  C: 'Cálculo o estimación que no proviene de una entidad oficial.',
  S: 'Dato simulado para demostración.',
});

const comoMunicipio = ({
  codigo,
  nombre,
  departamento_codigo: departamento,
  departamento: nombreDepartamento,
}) => ({
  codigo,
  nombre,
  departamento: { codigo: departamento, nombre: nombreDepartamento },
});

export function crearServicioCatalogo(repositorio) {
  let autocompletado = null;

  function indiceDeMunicipios() {
    if (!autocompletado) {
      autocompletado = repositorio
        .municipios()
        .then((filas) => crearAutocompletado(filas.map(comoMunicipio)));
      autocompletado.catch(() => {
        autocompletado = null;
      });
    }
    return autocompletado;
  }

  async function exigirEvento(codigo) {
    const evento = await repositorio.evento(codigo);
    if (!evento) {
      throw noEncontrado(`No existe el evento ${codigo}.`);
    }
    return evento;
  }

  async function leerTerritorio(evento, departamento = null) {
    await exigirEvento(evento);
    const [carga, alertas, variables, agregados, resumen, reportes, valores] = await Promise.all([
      repositorio.cargaTerritorial(evento),
      repositorio.alertasTerritoriales(evento),
      repositorio.variablesTerritoriales(),
      repositorio.agregados(evento),
      repositorio.resumenDepartamental(evento, departamento),
      repositorio.reportesMunicipales(evento, departamento),
      repositorio.valoresMunicipales(evento, departamento),
    ]);
    return comoTerritorio({ carga, alertas, variables, agregados, resumen, reportes, valores });
  }

  return {
    async estado() {
      const disponible = await repositorio.comprobar().then(
        () => true,
        () => false,
      );
      return { servicio: 'disponible', baseDeDatos: disponible ? 'disponible' : 'no disponible' };
    },

    async fuentes() {
      const filas = await repositorio.fuentes();
      return { meta: { descripcion: DESCRIPCION_FUENTES, niveles: NIVELES }, fuentes: filas.map(comoFuente) };
    },

    async eventos() {
      return { eventos: await repositorio.eventos() };
    },

    async evento(codigo) {
      const fila = await exigirEvento(codigo);
      const [parametros, normas] = await Promise.all([
        repositorio.parametrosEvento(codigo),
        repositorio.normasEvento(codigo),
      ]);
      return comoEvento(fila, parametros, normas);
    },

    async indicadores(evento) {
      await exigirEvento(evento);
      const [catalogo, valores] = await Promise.all([
        repositorio.indicadores(),
        repositorio.valoresIndicador(evento),
      ]);
      return {
        meta: { descripcion: DESCRIPCION_INDICADORES },
        indicadores: comoIndicadores(catalogo, valores),
      };
    },

    async indicador(evento, codigo) {
      await exigirEvento(evento);
      const [catalogo, valores] = await Promise.all([
        repositorio.indicadores(codigo),
        repositorio.valoresIndicador(evento, codigo),
      ]);
      if (catalogo.length === 0) {
        throw noEncontrado(`No existe el indicador ${codigo}.`);
      }
      return comoIndicadores(catalogo, valores)[0];
    },

    async municipios({ prefijo, limite }) {
      const indice = await indiceDeMunicipios();
      return { prefijo, municipios: indice.sugerir(prefijo, limite) };
    },

    territorio: (evento) => leerTerritorio(evento),

    async departamento(evento, codigo) {
      const territorio = await leerTerritorio(evento, codigo);
      const [departamento] = territorio.departamentos;
      if (!departamento) {
        throw noEncontrado(`No hay reportes del departamento ${codigo} para este evento.`);
      }
      return {
        meta: territorio.meta,
        variables: territorio.variables,
        departamento,
        municipios: territorio.municipios,
      };
    },

    async seguros(evento) {
      await exigirEvento(evento);
      const [porDepartamento, porRamo] = await Promise.all([
        repositorio.reclamacionesDepartamento(evento),
        repositorio.reclamacionesRamo(evento),
      ]);
      return comoSeguros(porDepartamento, porRamo, NOTA_SEGUROS);
    },

    async economia(evento) {
      await exigirEvento(evento);
      const [partidas, mediciones] = await Promise.all([
        repositorio.partidasEconomicas(evento),
        repositorio.medicionesContratacion(evento),
      ]);
      return comoEconomia(partidas, mediciones, NOTA_ECONOMIA);
    },
  };
}
