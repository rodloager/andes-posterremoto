const TAMANO_LOTE = 400;
const CONDICION_TODOS = 'OBJECTID>0';
const AGENTE = 'andes-posterremoto/0.2 (proyecto academico)';

async function consultar(urlCapa, parametros) {
  const consulta = new URLSearchParams(parametros);
  const respuesta = await fetch(`${urlCapa}/query?${consulta}`, {
    headers: { 'User-Agent': AGENTE },
  });
  if (!respuesta.ok) {
    throw new Error(`El servicio respondió ${respuesta.status} al consultar ${urlCapa}`);
  }
  const cuerpo = await respuesta.json();
  if (cuerpo.error) {
    throw new Error(`El servicio devolvió un error: ${cuerpo.error.message}`);
  }
  return cuerpo;
}

function enLotes(elementos, tamano) {
  const lotes = [];
  for (let inicio = 0; inicio < elementos.length; inicio += tamano) {
    lotes.push(elementos.slice(inicio, inicio + tamano));
  }
  return lotes;
}

export async function listarIdentificadores(urlCapa, condicion = CONDICION_TODOS) {
  const cuerpo = await consultar(urlCapa, { where: condicion, returnIdsOnly: 'true', f: 'json' });
  return cuerpo.objectIds ?? [];
}

export async function leerAtributos(urlCapa, { condicion = CONDICION_TODOS, campos = '*' } = {}) {
  const identificadores = await listarIdentificadores(urlCapa, condicion);
  const filas = [];
  for (const lote of enLotes(identificadores, TAMANO_LOTE)) {
    const cuerpo = await consultar(urlCapa, {
      objectIds: lote.join(','),
      outFields: campos,
      returnGeometry: 'false',
      f: 'json',
    });
    filas.push(...cuerpo.features.map((entidad) => entidad.attributes));
  }
  return filas;
}

export async function leerGeoJson(urlCapa, { identificadores, campos = '*', tolerancia, decimales = 4 }) {
  const entidades = [];
  for (const lote of enLotes(identificadores, TAMANO_LOTE)) {
    const cuerpo = await consultar(urlCapa, {
      objectIds: lote.join(','),
      outFields: campos,
      returnGeometry: 'true',
      outSR: '4326',
      maxAllowableOffset: String(tolerancia),
      geometryPrecision: String(decimales),
      f: 'geojson',
    });
    entidades.push(...cuerpo.features);
  }
  return { type: 'FeatureCollection', features: entidades };
}
