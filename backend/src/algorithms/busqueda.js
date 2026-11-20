import { Trie } from './estructuras/trie.js';
import { normalizarTexto } from './texto.js';

const PALABRAS_VACIAS = new Set(['DE', 'DEL', 'LA', 'LAS', 'LOS', 'EL', 'Y', 'E']);
const identidad = (valor) => valor;

export function limiteInferior(arreglo, buscado, clave = identidad, desde = 0) {
  let inicio = desde;
  let fin = arreglo.length;
  while (inicio < fin) {
    const medio = (inicio + fin) >>> 1;
    if (clave(arreglo[medio]) < buscado) {
      inicio = medio + 1;
    } else {
      fin = medio;
    }
  }
  return inicio;
}

export function limiteSuperior(arreglo, buscado, clave = identidad, desde = 0) {
  let inicio = desde;
  let fin = arreglo.length;
  while (inicio < fin) {
    const medio = (inicio + fin) >>> 1;
    if (clave(arreglo[medio]) <= buscado) {
      inicio = medio + 1;
    } else {
      fin = medio;
    }
  }
  return inicio;
}

export function intersectar(una, otra) {
  const [corta, larga] = una.length <= otra.length ? [una, otra] : [otra, una];
  const resultado = [];
  let desde = 0;
  for (const valor of corta) {
    const posicion = limiteInferior(larga, valor, identidad, desde);
    if (posicion >= larga.length) {
      break;
    }
    if (larga[posicion] === valor) {
      resultado.push(valor);
      desde = posicion + 1;
    } else {
      desde = posicion;
    }
  }
  return resultado;
}

const comparar = (uno, otro) => {
  if (uno === otro) {
    return 0;
  }
  return uno < otro ? -1 : 1;
};

export function crearIndiceInvertido(filas, { atributos, periodo }) {
  const ordenadas = [...filas].sort((una, otra) => comparar(una[periodo], otra[periodo]));
  const periodos = ordenadas.map((fila) => fila[periodo]);
  const indice = new Map(atributos.map((atributo) => [atributo, new Map()]));
  ordenadas.forEach((fila, posicion) => {
    for (const atributo of atributos) {
      const valor = fila[atributo];
      if (valor === null || valor === undefined) {
        continue;
      }
      const porValor = indice.get(atributo);
      const lista = porValor.get(valor);
      if (lista) {
        lista.push(posicion);
      } else {
        porValor.set(valor, [posicion]);
      }
    }
  });

  function rangoDePeriodo({ desde, hasta } = {}) {
    const inicio = desde === undefined ? 0 : limiteInferior(periodos, desde);
    const fin = hasta === undefined ? periodos.length : limiteSuperior(periodos, hasta);
    return [inicio, Math.max(inicio, fin)];
  }

  function filtrar(filtros = {}, periodoBuscado = {}) {
    const [inicio, fin] = rangoDePeriodo(periodoBuscado);
    const listas = [];
    for (const [atributo, valor] of Object.entries(filtros)) {
      if (valor === undefined || valor === null) {
        continue;
      }
      if (!indice.has(atributo)) {
        throw new RangeError(`El atributo ${atributo} no está indexado.`);
      }
      listas.push(indice.get(atributo).get(valor) ?? []);
    }
    if (listas.length === 0) {
      return ordenadas.slice(inicio, fin);
    }
    listas.sort((una, otra) => una.length - otra.length);
    const corta = listas[0];
    let resultado = corta.slice(limiteInferior(corta, inicio), limiteInferior(corta, fin));
    for (let posicion = 1; posicion < listas.length && resultado.length > 0; posicion += 1) {
      resultado = intersectar(resultado, listas[posicion]);
    }
    return resultado.map((posicionDeFila) => ordenadas[posicionDeFila]);
  }

  return {
    filtrar,
    rangoDePeriodo,
    get tamano() {
      return ordenadas.length;
    },
    valores: (atributo) => [...(indice.get(atributo)?.keys() ?? [])].sort(comparar),
  };
}

function* palabrasIniciales(nombreNormalizado) {
  const palabras = nombreNormalizado.split(' ');
  for (let posicion = 1; posicion < palabras.length; posicion += 1) {
    if (!PALABRAS_VACIAS.has(palabras[posicion])) {
      yield palabras.slice(posicion).join(' ');
    }
  }
}

export function crearAutocompletado(
  entradas,
  { nombre = (entrada) => entrada.nombre, clave = (entrada) => entrada.codigo } = {},
) {
  const completos = new Trie();
  const interiores = new Trie();
  for (const entrada of entradas) {
    const normalizado = normalizarTexto(nombre(entrada));
    if (!normalizado) {
      continue;
    }
    completos.insertar(normalizado, entrada);
    for (const sufijo of palabrasIniciales(normalizado)) {
      interiores.insertar(sufijo, entrada);
    }
  }

  return {
    sugerir(prefijo, limite = 10) {
      const buscado = normalizarTexto(prefijo ?? '');
      if (!buscado || limite <= 0) {
        return [];
      }
      const vistos = new Set();
      const sugerencias = [];
      const visitar = (entrada) => {
        const identificador = clave(entrada);
        if (!vistos.has(identificador)) {
          vistos.add(identificador);
          sugerencias.push(entrada);
        }
        return sugerencias.length < limite;
      };
      for (const trie of [completos, interiores]) {
        if (sugerencias.length >= limite) {
          break;
        }
        trie.recorrer(buscado, visitar);
      }
      return sugerencias;
    },
    get nodos() {
      return completos.nodos + interiores.nodos;
    },
  };
}

export function crearAutocompletadoOrdenado(entradas, { nombre = (entrada) => entrada.nombre } = {}) {
  const ordenadas = entradas
    .map((entrada) => ({ clave: normalizarTexto(nombre(entrada)), entrada }))
    .sort((una, otra) => comparar(una.clave, otra.clave));
  return {
    sugerir(prefijo, limite = 10) {
      const buscado = normalizarTexto(prefijo ?? '');
      if (!buscado || limite <= 0) {
        return [];
      }
      const sugerencias = [];
      for (
        let posicion = limiteInferior(ordenadas, buscado, (elemento) => elemento.clave);
        posicion < ordenadas.length &&
        ordenadas[posicion].clave.startsWith(buscado) &&
        sugerencias.length < limite;
        posicion += 1
      ) {
        sugerencias.push(ordenadas[posicion].entrada);
      }
      return sugerencias;
    },
  };
}
