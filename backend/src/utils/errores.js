const TITULOS = Object.freeze({
  400: 'Solicitud no válida',
  401: 'Sesión requerida',
  403: 'Acceso denegado',
  404: 'Recurso no encontrado',
  409: 'Conflicto',
  413: 'Contenido demasiado grande',
  429: 'Demasiadas solicitudes',
  500: 'Error interno',
  503: 'Servicio no disponible',
});

export class ErrorHttp extends Error {
  constructor(estado, codigo, detalle, extensiones = {}) {
    super(detalle);
    this.name = 'ErrorHttp';
    this.estado = estado;
    this.codigo = codigo;
    this.extensiones = extensiones;
  }
}

export const noEncontrado = (detalle) => new ErrorHttp(404, 'NO_ENCONTRADO', detalle);

export const noAutenticado = () => new ErrorHttp(401, 'NO_AUTENTICADO', 'Inicia sesión para continuar.');

export const sinPermiso = () =>
  new ErrorHttp(403, 'SIN_PERMISO', 'Tu rol no tiene permiso para realizar esta operación.');

export function crearProblema({ estado, codigo, detalle, instancia, extensiones = {} }) {
  return {
    type: 'about:blank',
    title: TITULOS[estado] ?? 'Error',
    status: estado,
    detail: detalle,
    instance: instancia,
    codigo,
    ...extensiones,
  };
}
