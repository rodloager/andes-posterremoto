function crearNodo() {
  return { hijos: new Map(), valores: [], ordenados: null };
}

const porLetra = ([una], [otra]) => (una < otra ? -1 : 1);

function hijosEnOrden(nodo) {
  nodo.ordenados ??= [...nodo.hijos].sort(porLetra).map(([, hijo]) => hijo);
  return nodo.ordenados;
}

export class Trie {
  #raiz = crearNodo();
  #claves = 0;
  #nodos = 1;

  get claves() {
    return this.#claves;
  }

  get nodos() {
    return this.#nodos;
  }

  insertar(clave, valor) {
    let nodo = this.#raiz;
    for (const letra of clave) {
      let siguiente = nodo.hijos.get(letra);
      if (!siguiente) {
        siguiente = crearNodo();
        nodo.hijos.set(letra, siguiente);
        nodo.ordenados = null;
        this.#nodos += 1;
      }
      nodo = siguiente;
    }
    if (nodo.valores.length === 0) {
      this.#claves += 1;
    }
    nodo.valores.push(valor);
  }

  #ubicar(prefijo) {
    let nodo = this.#raiz;
    for (const letra of prefijo) {
      nodo = nodo.hijos.get(letra);
      if (!nodo) {
        return null;
      }
    }
    return nodo;
  }

  recorrer(prefijo, visitar) {
    const inicio = this.#ubicar(prefijo);
    if (!inicio) {
      return;
    }
    const pendientes = [inicio];
    while (pendientes.length > 0) {
      const nodo = pendientes.pop();
      for (const valor of nodo.valores) {
        if (visitar(valor) === false) {
          return;
        }
      }
      const hijos = hijosEnOrden(nodo);
      for (let posicion = hijos.length - 1; posicion >= 0; posicion -= 1) {
        pendientes.push(hijos[posicion]);
      }
    }
  }

  buscarPrefijo(prefijo, limite = Infinity) {
    const encontrados = [];
    if (limite > 0) {
      this.recorrer(prefijo, (valor) => encontrados.push(valor) < limite);
    }
    return encontrados;
  }

  contiene(clave) {
    const nodo = this.#ubicar(clave);
    return Boolean(nodo && nodo.valores.length > 0);
  }
}
