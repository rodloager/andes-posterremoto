export const ERRORES_DE_ESTRUCTURA = Object.freeze({
  columnas: 'COLUMNAS',
  jsonInvalido: 'JSON_INVALIDO',
  jsonNoObjeto: 'JSON_NO_OBJETO',
});

export const esErrorDeEstructura = (codigo) => Object.values(ERRORES_DE_ESTRUCTURA).includes(codigo);

export class ErrorDeArchivo extends Error {
  constructor(mensaje) {
    super(mensaje);
    this.name = 'ErrorDeArchivo';
  }
}
