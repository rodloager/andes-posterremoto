export class MonticuloMinimo {
  #elementos = [];
  #comparar;

  constructor(comparar) {
    this.#comparar = comparar;
  }

  get tamano() {
    return this.#elementos.length;
  }

  minimo() {
    return this.#elementos[0];
  }

  insertar(elemento) {
    this.#elementos.push(elemento);
    this.#subir(this.#elementos.length - 1);
  }

  extraerMinimo() {
    if (this.#elementos.length === 0) {
      return undefined;
    }
    const minimo = this.#elementos[0];
    const ultimo = this.#elementos.pop();
    if (this.#elementos.length > 0) {
      this.#elementos[0] = ultimo;
      this.#bajar(0);
    }
    return minimo;
  }

  reemplazarMinimo(elemento) {
    if (this.#elementos.length === 0) {
      this.insertar(elemento);
      return undefined;
    }
    const minimo = this.#elementos[0];
    this.#elementos[0] = elemento;
    this.#bajar(0);
    return minimo;
  }

  #esMenor(posicion, otra) {
    return this.#comparar(this.#elementos[posicion], this.#elementos[otra]) < 0;
  }

  #intercambiar(posicion, otra) {
    [this.#elementos[posicion], this.#elementos[otra]] = [this.#elementos[otra], this.#elementos[posicion]];
  }

  #subir(inicio) {
    let posicion = inicio;
    let padre = (posicion - 1) >> 1;
    while (posicion > 0 && this.#esMenor(posicion, padre)) {
      this.#intercambiar(posicion, padre);
      posicion = padre;
      padre = (posicion - 1) >> 1;
    }
  }

  #hijoMenor(posicion) {
    const izquierdo = 2 * posicion + 1;
    if (izquierdo >= this.#elementos.length) {
      return null;
    }
    const derecho = izquierdo + 1;
    return derecho < this.#elementos.length && this.#esMenor(derecho, izquierdo) ? derecho : izquierdo;
  }

  #bajar(inicio) {
    let posicion = inicio;
    let hijo = this.#hijoMenor(posicion);
    while (hijo !== null && this.#esMenor(hijo, posicion)) {
      this.#intercambiar(hijo, posicion);
      posicion = hijo;
      hijo = this.#hijoMenor(posicion);
    }
  }
}
