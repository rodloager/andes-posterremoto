export class Anillo {
  #valores;
  #siguiente = 0;
  #cantidad = 0;

  constructor(capacidad) {
    this.#valores = new Array(capacidad);
  }

  agregar(valor) {
    this.#valores[this.#siguiente] = valor;
    this.#siguiente = (this.#siguiente + 1) % this.#valores.length;
    this.#cantidad = Math.min(this.#cantidad + 1, this.#valores.length);
  }

  valores() {
    const inicio = this.#cantidad < this.#valores.length ? 0 : this.#siguiente;
    return Array.from(
      { length: this.#cantidad },
      (_, posicion) => this.#valores[(inicio + posicion) % this.#valores.length],
    );
  }
}
