import { createReadStream } from 'node:fs';
import { ERRORES_DE_ESTRUCTURA, ErrorDeArchivo } from './errores.js';

export const TAMANO_MAXIMO_DE_ELEMENTO = 1024 * 1024;
const TAMANO_DEL_FRAGMENTO = 1 << 16;
const MUESTRA_DE_LA_FILA = 500;
const ESPACIO = /\s/;

const esObjeto = (valor) => valor !== null && typeof valor === 'object' && !Array.isArray(valor);

function interpretar(numero, texto) {
  try {
    const valor = JSON.parse(texto);
    if (!esObjeto(valor)) {
      return {
        numero,
        error: {
          campo: null,
          codigo: ERRORES_DE_ESTRUCTURA.jsonNoObjeto,
          mensaje: 'Cada registro debe ser un objeto JSON.',
        },
        crudo: { texto: texto.slice(0, MUESTRA_DE_LA_FILA) },
      };
    }
    return { numero, datos: valor };
  } catch {
    return {
      numero,
      error: {
        campo: null,
        codigo: ERRORES_DE_ESTRUCTURA.jsonInvalido,
        mensaje: 'El registro no es JSON válido.',
      },
      crudo: { texto: texto.slice(0, MUESTRA_DE_LA_FILA) },
    };
  }
}

export async function* leerJsonLineas(ruta) {
  let pendiente = '';
  let numero = 0;
  for await (const fragmento of createReadStream(ruta, {
    encoding: 'utf8',
    highWaterMark: TAMANO_DEL_FRAGMENTO,
  })) {
    pendiente += fragmento;
    let inicio = 0;
    let corte = pendiente.indexOf('\n', inicio);
    while (corte !== -1) {
      const linea = pendiente.slice(inicio, corte).replace(/\r$/, '');
      inicio = corte + 1;
      if (linea.length > TAMANO_MAXIMO_DE_ELEMENTO) {
        throw new ErrorDeArchivo(`La línea ${numero + 1} supera el tamaño máximo de 1 MB.`);
      }
      if (linea.trim() !== '') {
        numero += 1;
        yield interpretar(numero, linea);
      }
      corte = pendiente.indexOf('\n', inicio);
    }
    pendiente = pendiente.slice(inicio);
    if (pendiente.length > TAMANO_MAXIMO_DE_ELEMENTO) {
      throw new ErrorDeArchivo(`La línea ${numero + 1} supera el tamaño máximo de 1 MB.`);
    }
  }
  if (pendiente.trim() !== '') {
    numero += 1;
    yield interpretar(numero, pendiente.replace(/\r$/, ''));
  }
}

export async function* leerJsonArreglo(ruta) {
  let estado = 'INICIO';
  let profundidad = 0;
  let enCadena = false;
  let escapado = false;
  let elemento = '';
  let numero = 0;
  let primerFragmento = true;

  for await (let fragmento of createReadStream(ruta, {
    encoding: 'utf8',
    highWaterMark: TAMANO_DEL_FRAGMENTO,
  })) {
    if (primerFragmento) {
      fragmento = fragmento.replace(/^\uFEFF/, '');
      primerFragmento = false;
    }
    let inicioDeElemento = estado === 'ELEMENTO' ? 0 : -1;
    for (let posicion = 0; posicion < fragmento.length; posicion += 1) {
      const caracter = fragmento[posicion];
      if (estado === 'ELEMENTO') {
        if (enCadena) {
          if (escapado) {
            escapado = false;
          } else if (caracter === '\\') {
            escapado = true;
          } else if (caracter === '"') {
            enCadena = false;
          }
          continue;
        }
        if (caracter === '"') {
          enCadena = true;
        } else if (caracter === '{' || caracter === '[') {
          profundidad += 1;
        } else if (caracter === '}' || caracter === ']') {
          profundidad -= 1;
          if (profundidad === 0) {
            elemento += fragmento.slice(inicioDeElemento, posicion + 1);
            if (elemento.length > TAMANO_MAXIMO_DE_ELEMENTO) {
              throw new ErrorDeArchivo(`El registro ${numero + 1} supera el tamaño máximo de 1 MB.`);
            }
            numero += 1;
            yield interpretar(numero, elemento);
            elemento = '';
            inicioDeElemento = -1;
            estado = 'DESPUES';
          }
        }
        continue;
      }
      if (ESPACIO.test(caracter)) {
        continue;
      }
      if (estado === 'INICIO') {
        if (caracter !== '[') {
          throw new ErrorDeArchivo('El archivo JSON debe contener un arreglo de objetos.');
        }
        estado = 'PRIMERO';
      } else if ((estado === 'PRIMERO' || estado === 'ESPERA') && caracter === '{') {
        estado = 'ELEMENTO';
        profundidad = 1;
        inicioDeElemento = posicion;
      } else if (estado === 'PRIMERO' && caracter === ']') {
        estado = 'FIN';
      } else if (estado === 'DESPUES' && caracter === ',') {
        estado = 'ESPERA';
      } else if (estado === 'DESPUES' && caracter === ']') {
        estado = 'FIN';
      } else if (estado === 'FIN') {
        throw new ErrorDeArchivo('Hay contenido después del cierre del arreglo JSON.');
      } else {
        throw new ErrorDeArchivo(`El arreglo JSON está mal formado después del registro ${numero}.`);
      }
    }
    if (estado === 'ELEMENTO') {
      elemento += fragmento.slice(inicioDeElemento);
      if (elemento.length > TAMANO_MAXIMO_DE_ELEMENTO) {
        throw new ErrorDeArchivo(`El registro ${numero + 1} supera el tamaño máximo de 1 MB.`);
      }
    }
  }
  if (estado !== 'FIN') {
    throw new ErrorDeArchivo('El arreglo JSON está incompleto.');
  }
}
