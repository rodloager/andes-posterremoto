export const MODO_OFICIAL = 'oficial';
export const MODO_DEMOSTRACION = 'demostracion';

const CLAVE = 'andes.modo';

function almacen() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function normalizarModo(valor) {
  return valor === MODO_DEMOSTRACION ? MODO_DEMOSTRACION : MODO_OFICIAL;
}

export function leerModo() {
  return normalizarModo(almacen()?.getItem(CLAVE));
}

export function guardarModo(modo) {
  almacen()?.setItem(CLAVE, normalizarModo(modo));
}

export function esDemostracion() {
  return leerModo() === MODO_DEMOSTRACION;
}
