const API = '/api/v1';
const PAGINA_DE_ACCESO = '/privado/';

export class ErrorDeApi extends Error {
  constructor(estado, problema) {
    super(problema?.detail ?? `La solicitud falló con el estado ${estado}.`);
    this.name = 'ErrorDeApi';
    this.estado = estado;
    this.codigo = problema?.codigo ?? null;
    this.errores = problema?.errores ?? [];
  }
}

export function describirError(error, porDefecto) {
  if (!(error instanceof ErrorDeApi)) {
    return porDefecto;
  }
  return error.errores.length > 0 ? error.errores.map(({ mensaje }) => mensaje).join(' ') : error.message;
}

export function irAlAcceso() {
  const siguiente = encodeURIComponent(window.location.pathname);
  window.location.assign(`${PAGINA_DE_ACCESO}?siguiente=${siguiente}`);
}

function cabeceras(cuerpo) {
  return cuerpo === undefined
    ? { Accept: 'application/json' }
    : { Accept: 'application/json', 'Content-Type': 'application/json' };
}

async function interpretar(respuesta) {
  if (respuesta.status === 204) {
    return null;
  }
  const datos = await respuesta.json().catch(() => null);
  if (!respuesta.ok) {
    throw new ErrorDeApi(respuesta.status, datos);
  }
  return datos;
}

export async function pedir(ruta, { metodo = 'GET', cuerpo } = {}) {
  const respuesta = await fetch(`${API}${ruta}`, {
    method: metodo,
    credentials: 'same-origin',
    headers: cabeceras(cuerpo),
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  return interpretar(respuesta);
}

export async function enviarArchivo(ruta, datos) {
  const respuesta = await fetch(`${API}${ruta}`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
    body: datos,
  });
  return interpretar(respuesta);
}

export function conParametros(ruta, parametros) {
  const presentes = Object.entries(parametros).filter(
    ([, valor]) => valor !== undefined && valor !== null && valor !== '',
  );
  return presentes.length === 0 ? ruta : `${ruta}?${new URLSearchParams(presentes)}`;
}
