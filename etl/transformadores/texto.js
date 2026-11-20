const PALABRAS_MENORES = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'y', 'e']);

function capitalizar(palabra) {
  return palabra.charAt(0).toLocaleUpperCase('es-CO') + palabra.slice(1);
}

function capitalizarCompuesta(palabra) {
  return palabra.split('-').map(capitalizar).join('-');
}

export function aTitulo(texto) {
  return texto
    .trim()
    .toLocaleLowerCase('es-CO')
    .split(/\s+/)
    .map((palabra, posicion) =>
      posicion > 0 && PALABRAS_MENORES.has(palabra) ? palabra : capitalizarCompuesta(palabra),
    )
    .join(' ')
    .replace(/\bd\.\s?c\./i, 'D. C.');
}

export function aEntero(valor) {
  if (typeof valor === 'number') {
    return Number.isInteger(valor) && valor >= 0 ? valor : null;
  }
  if (typeof valor !== 'string') {
    return null;
  }
  const limpio = valor.trim();
  return /^\d+$/.test(limpio) ? Number(limpio) : null;
}
