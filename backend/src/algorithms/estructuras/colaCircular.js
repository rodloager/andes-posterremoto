export class ColaCircular {
  #valores;
  #inicio = 0;
  #tamano = 0;

  constructor(capacidad) {
    if (!Number.isInteger(capacidad) || capacidad < 1) {
      throw new RangeError('La capacidad de la cola debe ser un entero positivo.');
    }
    this.#valores = new Array(capacidad);
  }

  get capacidad() {
    return this.#valores.length;
  }

  get tamano() {
    return this.#tamano;
  }

  get llena() {
    return this.#tamano === this.#valores.length;
  }

  encolar(valor) {
    if (this.llena) {
      throw new RangeError('La cola está llena.');
    }
    this.#valores[(this.#inicio + this.#tamano) % this.#valores.length] = valor;
    this.#tamano += 1;
  }

  desencolar() {
    if (this.#tamano === 0) {
      return undefined;
    }
    const valor = this.#valores[this.#inicio];
    this.#valores[this.#inicio] = undefined;
    this.#inicio = (this.#inicio + 1) % this.#valores.length;
    this.#tamano -= 1;
    return valor;
  }

  primero() {
    return this.#tamano === 0 ? undefined : this.#valores[this.#inicio];
  }

  valores() {
    return Array.from(
      { length: this.#tamano },
      (_, posicion) => this.#valores[(this.#inicio + posicion) % this.#valores.length],
    );
  }
}
