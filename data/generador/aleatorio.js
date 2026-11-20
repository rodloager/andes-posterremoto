const INCREMENTO = 0x6d2b79f5;
const RANGO = 4294967296;

export function crearGenerador(semilla) {
  let estado = semilla >>> 0;

  function siguiente() {
    estado = (estado + INCREMENTO) >>> 0;
    let mezcla = estado;
    mezcla = Math.imul(mezcla ^ (mezcla >>> 15), mezcla | 1);
    mezcla ^= mezcla + Math.imul(mezcla ^ (mezcla >>> 7), mezcla | 61);
    return ((mezcla ^ (mezcla >>> 14)) >>> 0) / RANGO;
  }

  return {
    siguiente,
    entero: (minimo, maximo) => minimo + Math.floor(siguiente() * (maximo - minimo + 1)),
    ocurre: (probabilidad) => siguiente() < probabilidad,
    variar: (base, amplitud) => base * (1 + (siguiente() * 2 - 1) * amplitud),
  };
}

export function crearSelector(opciones) {
  const acumulados = [];
  let total = 0;
  for (const opcion of opciones) {
    total += opcion.peso;
    acumulados.push(total);
  }
  return function elegir(generador) {
    const objetivo = generador.siguiente() * total;
    const posicion = acumulados.findIndex((limite) => objetivo < limite);
    return posicion === -1 ? opciones.length - 1 : posicion;
  };
}

export function crearSelectorAlias(pesos) {
  const cantidad = pesos.length;
  const total = pesos.reduce((suma, peso) => suma + peso, 0);
  if (cantidad === 0 || !(total > 0) || pesos.some((peso) => !(peso >= 0))) {
    throw new RangeError('El selector necesita al menos un peso positivo y ninguno negativo.');
  }
  const probabilidad = new Float64Array(cantidad);
  const alias = new Uint32Array(cantidad);
  const escalados = pesos.map((peso) => (peso * cantidad) / total);
  const pequenos = [];
  const grandes = [];
  escalados.forEach((valor, posicion) => (valor < 1 ? pequenos : grandes).push(posicion));
  while (pequenos.length > 0 && grandes.length > 0) {
    const pequeno = pequenos.pop();
    const grande = grandes.pop();
    probabilidad[pequeno] = escalados[pequeno];
    alias[pequeno] = grande;
    escalados[grande] += escalados[pequeno] - 1;
    (escalados[grande] < 1 ? pequenos : grandes).push(grande);
  }
  for (const posicion of [...pequenos, ...grandes]) {
    probabilidad[posicion] = 1;
  }
  return function elegir(generador) {
    const columna = Math.floor(generador.siguiente() * cantidad);
    return generador.siguiente() < probabilidad[columna] ? columna : alias[columna];
  };
}
