export const EVENTO_PRINCIPAL = 'sismo-2026-08-10';

const API = '/api/v1';
const RAIZ_DE_ARCHIVOS = '/datos';
const RUTAS_DE_LA_API = Object.freeze({
  'oficial/fuentes': `${API}/fuentes`,
  'oficial/evento': `${API}/eventos/${EVENTO_PRINCIPAL}`,
  'oficial/indicadores': `${API}/eventos/${EVENTO_PRINCIPAL}/indicadores`,
  'oficial/territorio': `${API}/eventos/${EVENTO_PRINCIPAL}/territorio`,
  'oficial/seguros': `${API}/eventos/${EVENTO_PRINCIPAL}/seguros`,
  'oficial/economia': `${API}/eventos/${EVENTO_PRINCIPAL}/economia`,
  'oficial/kpi': `${API}/eventos/${EVENTO_PRINCIPAL}/kpi`,
  'simulado/poblacion': `${API}/eventos/${EVENTO_PRINCIPAL}/registros/poblacion`,
  'simulado/vivienda': `${API}/eventos/${EVENTO_PRINCIPAL}/registros/viviendas`,
});
const solicitudes = new Map();

export function direccionDe(recurso) {
  return RUTAS_DE_LA_API[recurso] ?? `${RAIZ_DE_ARCHIVOS}/${recurso}.json`;
}

async function solicitar(recurso) {
  const respuesta = await fetch(direccionDe(recurso), { headers: { Accept: 'application/json' } });
  if (!respuesta.ok) {
    throw new Error(`No se pudo cargar ${recurso}: respuesta ${respuesta.status}`);
  }
  return respuesta.json();
}

export function cargar(recurso) {
  if (!solicitudes.has(recurso)) {
    solicitudes.set(recurso, solicitar(recurso));
  }
  return solicitudes.get(recurso);
}
