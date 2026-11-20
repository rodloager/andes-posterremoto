const DIACRITICOS = /\p{Diacritic}/gu;
const SIMBOLOS = /[^\p{L}\p{N}\s]/gu;
const ESPACIOS = /\s+/g;

const ABREVIATURAS_DE_DIRECCION = new Map([
  ['CALLE', 'CL'],
  ['CLL', 'CL'],
  ['CARRERA', 'KR'],
  ['CRA', 'KR'],
  ['CR', 'KR'],
  ['KRA', 'KR'],
  ['AVENIDA', 'AV'],
  ['AVDA', 'AV'],
  ['DIAGONAL', 'DG'],
  ['TRANSVERSAL', 'TV'],
  ['TRANSV', 'TV'],
  ['TR', 'TV'],
  ['MANZANA', 'MZ'],
  ['CASA', 'CS'],
  ['APARTAMENTO', 'AP'],
  ['APTO', 'AP'],
  ['BARRIO', 'BR'],
  ['VEREDA', 'VDA'],
  ['KILOMETRO', 'KM'],
]);

const PALABRAS_DE_NUMERO = new Set(['NUMERO', 'NO', 'NRO', 'N']);

export function quitarTildes(texto) {
  return String(texto).normalize('NFD').replace(DIACRITICOS, '');
}

export function normalizarTexto(texto) {
  return quitarTildes(texto).toUpperCase().replace(SIMBOLOS, ' ').replace(ESPACIOS, ' ').trim();
}

export function normalizarDireccion(texto) {
  return normalizarTexto(String(texto).replace(/#/g, ' '))
    .split(' ')
    .filter((palabra) => palabra && !PALABRAS_DE_NUMERO.has(palabra))
    .map((palabra) => ABREVIATURAS_DE_DIRECCION.get(palabra) ?? palabra)
    .join(' ');
}
