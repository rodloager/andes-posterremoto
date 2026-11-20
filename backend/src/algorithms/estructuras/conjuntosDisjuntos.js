export class ConjuntosDisjuntos {
  #padre;
  #rango;
  #componentes;

  constructor(cantidad) {
    if (!Number.isInteger(cantidad) || cantidad < 0) {
      throw new RangeError('La cantidad de elementos debe ser un entero no negativo.');
    }
    this.#padre = Int32Array.from({ length: cantidad }, (_, posicion) => posicion);
    this.#rango = new Uint8Array(cantidad);
    this.#componentes = cantidad;
  }

  get cantidad() {
    return this.#padre.length;
  }

  get componentes() {
    return this.#componentes;
  }

  #validar(elemento) {
    if (!Number.isInteger(elemento) || elemento < 0 || elemento >= this.#padre.length) {
      throw new RangeError(`El elemento ${elemento} no existe.`);
    }
  }

  buscar(elemento) {
    this.#validar(elemento);
    let actual = elemento;
    while (this.#padre[actual] !== actual) {
      this.#padre[actual] = this.#padre[this.#padre[actual]];
      actual = this.#padre[actual];
    }
    return actual;
  }

  unir(uno, otro) {
    let raizUno = this.buscar(uno);
    let raizOtro = this.buscar(otro);
    if (raizUno === raizOtro) {
      return false;
    }
    if (this.#rango[raizUno] < this.#rango[raizOtro]) {
      [raizUno, raizOtro] = [raizOtro, raizUno];
    }
    this.#padre[raizOtro] = raizUno;
    if (this.#rango[raizUno] === this.#rango[raizOtro]) {
      this.#rango[raizUno] += 1;
    }
    this.#componentes -= 1;
    return true;
  }

  conectados(uno, otro) {
    return this.buscar(uno) === this.buscar(otro);
  }

  grupos({ minimo = 1 } = {}) {
    const porRaiz = new Map();
    for (let elemento = 0; elemento < this.#padre.length; elemento += 1) {
      const raiz = this.buscar(elemento);
      const grupo = porRaiz.get(raiz);
      if (grupo) {
        grupo.push(elemento);
      } else {
        porRaiz.set(raiz, [elemento]);
      }
    }
    return [...porRaiz.values()].filter((grupo) => grupo.length >= minimo);
  }
}
