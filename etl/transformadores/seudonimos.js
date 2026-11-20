import { createHmac } from 'node:crypto';

const LONGITUD_MINIMA_DEL_SECRETO = 32;
const VISIBLES_AL_FINAL = 3;
const MASCARA = '•••';
const SECUENCIA_LARGA_DE_DIGITOS = /\d{5,}/g;

const esObjeto = (valor) => valor !== null && typeof valor === 'object' && !Array.isArray(valor);
const comoTexto = (valor) => (typeof valor === 'object' ? JSON.stringify(valor) : String(valor));

export function crearSeudonimizador(secreto) {
  if (typeof secreto !== 'string' || secreto.length < LONGITUD_MINIMA_DEL_SECRETO) {
    throw new RangeError('Falta SEUDONIMO_SECRETO en el archivo .env, con al menos 32 caracteres.');
  }
  return (valor) => createHmac('sha256', secreto).update(String(valor).trim()).digest('hex');
}

export function ocultarValor(valor) {
  const texto = comoTexto(valor);
  return texto.length <= VISIBLES_AL_FINAL ? MASCARA : `${MASCARA}${texto.slice(-VISIBLES_AL_FINAL)}`;
}

export const ocultarDigitos = (valor) => comoTexto(valor).replace(SECUENCIA_LARGA_DE_DIGITOS, ocultarValor);

function ocultarDigitosEn(valor) {
  if (valor === null || valor === undefined || typeof valor === 'boolean') {
    return valor;
  }
  if (Array.isArray(valor)) {
    return valor.map(ocultarDigitosEn);
  }
  if (esObjeto(valor)) {
    return Object.fromEntries(
      Object.entries(valor).map(([clave, interno]) => [clave, ocultarDigitosEn(interno)]),
    );
  }
  return ocultarDigitos(valor);
}

export function crearOcultadorDeFilas(campos) {
  const claveDe = (campo) => (campo.origen ?? campo.nombre).trim().toLowerCase();
  const seudonimizados = new Set(campos.filter(({ seudonimizar }) => seudonimizar).map(claveDe));
  const conocidos = new Set(campos.map(claveDe));
  const nombresSeudonimizados = new Set(
    campos.filter(({ seudonimizar }) => seudonimizar).map(({ nombre }) => nombre),
  );

  function ocultarCampo([clave, valor]) {
    const nombre = clave.trim().toLowerCase();
    if (valor === null || valor === undefined || (conocidos.has(nombre) && !seudonimizados.has(nombre))) {
      return [clave, valor];
    }
    return [clave, seudonimizados.has(nombre) ? ocultarValor(valor) : ocultarDigitosEn(valor)];
  }

  return {
    fila: (datos) =>
      esObjeto(datos) ? Object.fromEntries(Object.entries(datos).map(ocultarCampo)) : ocultarDigitosEn(datos),
    estructura: ocultarDigitosEn,
    error: (error) =>
      nombresSeudonimizados.has(error.campo) ? { ...error, mensaje: ocultarDigitos(error.mensaje) } : error,
  };
}
