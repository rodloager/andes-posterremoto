import path from 'node:path';
import { leerAtributos, leerGeoJson } from '../extractores/arcgis.js';
import { aTitulo } from '../transformadores/texto.js';
import { carpetaDatosPublicos, escribirJson, fechaDeHoy } from './rutas.js';

const URL_SERVICIO =
  'https://geoportal.dane.gov.co/mparcgis/rest/services/Divipola/Serv_DIVIPOLA_MGN_2025/FeatureServer';
const URL_DEPARTAMENTOS = `${URL_SERVICIO}/319`;
const URL_MUNICIPIOS = `${URL_SERVICIO}/317`;
const TOLERANCIA_DEPARTAMENTOS = 0.01;
const TOLERANCIA_MUNICIPIOS = 0.004;

const carpetaGeo = path.join(carpetaDatosPublicos, 'geo');

function comoColeccion(entidades, describir, meta) {
  return {
    type: 'FeatureCollection',
    meta,
    features: entidades.map((entidad) => ({
      type: 'Feature',
      properties: describir(entidad.properties),
      geometry: entidad.geometry,
    })),
  };
}

function agruparPorDepartamento(filas) {
  const grupos = new Map();
  for (const fila of filas) {
    const identificadores = grupos.get(fila.DPTO_CCDGO) ?? [];
    identificadores.push(fila.OBJECTID);
    grupos.set(fila.DPTO_CCDGO, identificadores);
  }
  return grupos;
}

const meta = {
  fuente: 'dane-mgn',
  servicio: 'Serv_DIVIPOLA_MGN_2025',
  consultadoEn: fechaDeHoy(),
};

const filasDepartamentos = await leerAtributos(URL_DEPARTAMENTOS, { campos: 'OBJECTID' });
const departamentos = await leerGeoJson(URL_DEPARTAMENTOS, {
  identificadores: filasDepartamentos.map((fila) => fila.OBJECTID),
  campos: 'DPTO_CCDGO,DPTO_CNMBRE',
  tolerancia: TOLERANCIA_DEPARTAMENTOS,
});
const rutaDepartamentos = await escribirJson(
  path.join(carpetaGeo, 'departamentos.json'),
  comoColeccion(
    departamentos.features,
    (propiedades) => ({ codigo: propiedades.DPTO_CCDGO, nombre: aTitulo(propiedades.DPTO_CNMBRE) }),
    { ...meta, toleranciaGrados: TOLERANCIA_DEPARTAMENTOS },
  ),
  { compacto: true },
);
process.stdout.write(`${rutaDepartamentos}: ${departamentos.features.length} departamentos\n`);

const filasMunicipios = await leerAtributos(URL_MUNICIPIOS, { campos: 'OBJECTID,DPTO_CCDGO' });
for (const [codigo, identificadores] of [...agruparPorDepartamento(filasMunicipios)].sort()) {
  const municipios = await leerGeoJson(URL_MUNICIPIOS, {
    identificadores,
    campos: 'MPIO_CDPMP,MPIO_CNMBRE,DPTO_CCDGO',
    tolerancia: TOLERANCIA_MUNICIPIOS,
  });
  const ruta = await escribirJson(
    path.join(carpetaGeo, 'municipios', `${codigo}.json`),
    comoColeccion(
      municipios.features,
      (propiedades) => ({
        codigo: propiedades.MPIO_CDPMP,
        nombre: aTitulo(propiedades.MPIO_CNMBRE),
        departamento: propiedades.DPTO_CCDGO,
      }),
      { ...meta, toleranciaGrados: TOLERANCIA_MUNICIPIOS },
    ),
    { compacto: true },
  );
  process.stdout.write(`${ruta}: ${municipios.features.length} municipios\n`);
}
