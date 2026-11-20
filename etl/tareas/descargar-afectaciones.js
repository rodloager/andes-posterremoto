import path from 'node:path';
import { leerAtributos } from '../extractores/arcgis.js';
import {
  VARIABLES,
  acumularPorDepartamento,
  normalizarMunicipio,
  resumirPeriodo,
  tieneReporte,
  totalizar,
} from '../transformadores/afectaciones.js';
import { carpetaDatosCrudos, carpetaSemillasOficiales, escribirJson, fechaDeHoy } from './rutas.js';

const URL_CAPA_MUNICIPIOS =
  'https://geoportal.dane.gov.co/mparcgis/rest/services/Afectaciones/Serv_AfectacionesUNGRD/MapServer/0';
const FECHA_DEL_SISMO = '2026-08-10';

function describirVariables() {
  return VARIABLES.map(({ codigo, nombre, unidad }) => ({ codigo, nombre, unidad }));
}

function contarAlertas(municipios) {
  const conteo = {};
  for (const alerta of municipios.flatMap((municipio) => municipio.alertas)) {
    conteo[alerta] = (conteo[alerta] ?? 0) + 1;
  }
  return conteo;
}

function comoMunicipioPublico({ codigo, nombre, departamento, valores, fechaReporte, alertas }) {
  return { codigo, nombre, departamento, valores, fechaReporte, alertas };
}

const hoy = fechaDeHoy();
const filas = await leerAtributos(URL_CAPA_MUNICIPIOS);
const rutaCruda = await escribirJson(
  path.join(carpetaDatosCrudos, 'dane-afectaciones', `${hoy}.json`),
  filas,
  { compacto: true },
);

const periodoValido = { desde: FECHA_DEL_SISMO, hasta: hoy };
const municipios = filas
  .map((atributos) => normalizarMunicipio(atributos, periodoValido))
  .filter(tieneReporte)
  .sort((a, b) => a.codigo.localeCompare(b.codigo));
const departamentos = acumularPorDepartamento(municipios);

const rutaPublica = await escribirJson(path.join(carpetaSemillasOficiales, 'territorio.json'), {
  meta: {
    origen: 'OFICIAL',
    nivel: 'A',
    fuente: 'dane-afectaciones',
    consultadoEn: hoy,
    periodoReportes: resumirPeriodo(municipios),
    municipiosEnLaCapa: filas.length,
    municipiosConReporte: municipios.length,
    departamentosConReporte: departamentos.length,
    alertasDeCalidad: contarAlertas(municipios),
  },
  variables: describirVariables(),
  nacional: totalizar(departamentos),
  departamentos,
  municipios: municipios.map(comoMunicipioPublico),
});

process.stdout.write(`Filas leídas: ${filas.length}\n`);
process.stdout.write(`Municipios con reporte: ${municipios.length}\n`);
process.stdout.write(`Copia cruda: ${rutaCruda}\n`);
process.stdout.write(`Archivo publicado: ${rutaPublica}\n`);
