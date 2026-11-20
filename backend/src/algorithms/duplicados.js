import { ConjuntosDisjuntos } from './estructuras/conjuntosDisjuntos.js';

export const MOTIVOS_EXACTOS = Object.freeze({
  identificador: 'IDENTIFICADOR',
  claveNatural: 'CLAVE_NATURAL',
});

export function distanciaDeEdicion(uno, otro, maximo = Infinity) {
  if (uno === otro) {
    return 0;
  }
  const [corta, larga] = uno.length <= otro.length ? [uno, otro] : [otro, uno];
  const columnas = corta.length;
  const filas = larga.length;
  const tope = Math.min(maximo, filas);
  const fuera = tope + 1;
  if (filas - columnas > tope) {
    return fuera;
  }
  if (columnas === 0) {
    return filas;
  }
  let anterior = new Int32Array(columnas + 1);
  let actual = new Int32Array(columnas + 1);
  for (let columna = 0; columna <= columnas; columna += 1) {
    anterior[columna] = columna <= tope ? columna : fuera;
  }
  for (let fila = 1; fila <= filas; fila += 1) {
    const desde = Math.max(1, fila - tope);
    const hasta = Math.min(columnas, fila + tope);
    actual[0] = fila <= tope ? fila : fuera;
    if (desde > 1) {
      actual[desde - 1] = fuera;
    }
    let minimoDeFila = actual[0];
    const letra = larga.charCodeAt(fila - 1);
    for (let columna = desde; columna <= hasta; columna += 1) {
      const sustitucion = anterior[columna - 1] + (letra === corta.charCodeAt(columna - 1) ? 0 : 1);
      const valor = Math.min(anterior[columna] + 1, actual[columna - 1] + 1, sustitucion);
      actual[columna] = valor > fuera ? fuera : valor;
      if (actual[columna] < minimoDeFila) {
        minimoDeFila = actual[columna];
      }
    }
    if (hasta < columnas) {
      actual[hasta + 1] = fuera;
    }
    if (minimoDeFila > tope) {
      return fuera;
    }
    [anterior, actual] = [actual, anterior];
  }
  return anterior[columnas] > tope ? fuera : anterior[columnas];
}

export function similitudDeTexto(uno, otro, minimo = 0) {
  const largo = Math.max(uno.length, otro.length);
  if (largo === 0) {
    return 1;
  }
  const permitida = Math.floor((1 - minimo) * largo + 1e-9);
  const distancia = distanciaDeEdicion(uno, otro, permitida);
  return Math.max(0, 1 - distancia / largo);
}

export function crearComparador({ campos, minimo = 0 }) {
  const pesoTotal = campos.reduce((total, { peso }) => total + peso, 0);
  if (!(pesoTotal > 0) || campos.some(({ peso }) => !(peso >= 0))) {
    throw new RangeError('Los pesos de comparación deben ser no negativos y sumar más que cero.');
  }
  const textos = campos.filter(({ tipo }) => tipo === 'texto');
  const exactos = campos.filter(({ tipo }) => tipo !== 'texto');

  return function comparar(uno, otro) {
    const detalle = {};
    let acumulado = 0;
    for (const { nombre, peso } of exactos) {
      const coincide = uno[nombre] !== null && uno[nombre] !== undefined && uno[nombre] === otro[nombre];
      detalle[nombre] = coincide ? 1 : 0;
      acumulado += coincide ? peso : 0;
    }
    let pendiente = textos.reduce((total, { peso }) => total + peso, 0);
    for (const { nombre, peso } of textos) {
      pendiente -= peso;
      const necesario = (minimo * pesoTotal - acumulado - pendiente) / peso;
      const valor = similitudDeTexto(
        uno[nombre] ?? '',
        otro[nombre] ?? '',
        Math.max(0, Math.min(1, necesario)),
      );
      detalle[nombre] = valor;
      acumulado += valor * peso;
    }
    return { valor: acumulado / pesoTotal, detalle };
  };
}

function agregarABloque(bloques, clave, posicion) {
  const miembros = bloques.get(clave);
  if (miembros) {
    miembros.push(posicion);
  } else {
    bloques.set(clave, [posicion]);
  }
}

const presente = (valor) => valor !== null && valor !== undefined && valor !== '';

export function detectarDuplicados(
  registros,
  {
    identificador = () => null,
    claveNatural = () => null,
    claveDeBloque,
    comparar,
    umbralDuplicado,
    umbralRevision,
  },
) {
  if (!(umbralRevision <= umbralDuplicado)) {
    throw new RangeError('El umbral de revisión no puede superar el umbral de duplicado.');
  }
  const grupos = new ConjuntosDisjuntos(registros.length);
  const primeraPorIdentificador = new Map();
  const primeraPorClave = new Map();
  const bloques = new Map();
  const exactos = [];
  const revision = [];
  let comparaciones = 0;

  registros.forEach((registro, posicion) => {
    const id = identificador(registro);
    if (presente(id) && primeraPorIdentificador.has(id)) {
      const original = primeraPorIdentificador.get(id);
      grupos.unir(original, posicion);
      exactos.push({ posicion, original, motivo: MOTIVOS_EXACTOS.identificador });
      return;
    }
    if (presente(id)) {
      primeraPorIdentificador.set(id, posicion);
    }
    const natural = claveNatural(registro);
    if (presente(natural) && primeraPorClave.has(natural)) {
      const original = primeraPorClave.get(natural);
      grupos.unir(original, posicion);
      exactos.push({ posicion, original, motivo: MOTIVOS_EXACTOS.claveNatural });
      return;
    }
    if (presente(natural)) {
      primeraPorClave.set(natural, posicion);
    }
    agregarABloque(bloques, claveDeBloque(registro), posicion);
  });

  for (const miembros of bloques.values()) {
    for (let primero = 0; primero < miembros.length; primero += 1) {
      for (let segundo = primero + 1; segundo < miembros.length; segundo += 1) {
        const uno = miembros[primero];
        const otro = miembros[segundo];
        comparaciones += 1;
        const { valor, detalle } = comparar(registros[uno], registros[otro]);
        if (valor >= umbralDuplicado) {
          grupos.unir(uno, otro);
        } else if (valor >= umbralRevision) {
          revision.push({ uno, otro, similitud: valor, detalle });
        }
      }
    }
  }

  return {
    grupos: grupos.grupos({ minimo: 2 }),
    exactos,
    revision,
    unicos: grupos.componentes,
    comparaciones,
    bloques: bloques.size,
  };
}

export function agruparPares(pares) {
  const posiciones = new Map();
  const identificadores = [];
  const posicionDe = (id) => {
    let posicion = posiciones.get(id);
    if (posicion === undefined) {
      posicion = identificadores.length;
      posiciones.set(id, posicion);
      identificadores.push(id);
    }
    return posicion;
  };
  const indices = pares.map(([uno, otro]) => [posicionDe(uno), posicionDe(otro)]);
  const conjuntos = new ConjuntosDisjuntos(identificadores.length);
  for (const [uno, otro] of indices) {
    conjuntos.unir(uno, otro);
  }
  return conjuntos.grupos({ minimo: 2 }).map((grupo) => grupo.map((posicion) => identificadores[posicion]));
}
