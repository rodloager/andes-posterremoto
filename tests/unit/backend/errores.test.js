import { describe, expect, it, vi } from 'vitest';
import { crearManejadorDeErrores, rutaApiInexistente } from '../../../backend/src/middlewares/errores.js';
import { ErrorHttp, crearProblema, sinPermiso } from '../../../backend/src/utils/errores.js';

function respuestaFalsa({ enviada = false } = {}) {
  const respuesta = {
    headersSent: enviada,
    estado: null,
    tipo: null,
    cuerpo: null,
    status: vi.fn((estado) => {
      respuesta.estado = estado;
      return respuesta;
    }),
    type: vi.fn((tipo) => {
      respuesta.tipo = tipo;
      return respuesta;
    }),
    send: vi.fn((cuerpo) => {
      respuesta.cuerpo = JSON.parse(cuerpo);
      return respuesta;
    }),
  };
  return respuesta;
}

function manejar(error, { enviada } = {}) {
  const registro = { error: vi.fn() };
  const alFallar = vi.fn();
  const respuesta = respuestaFalsa({ enviada });
  const siguiente = vi.fn();
  const solicitud = { method: 'GET', path: '/api/v1/x', originalUrl: '/api/v1/x?y=1' };
  crearManejadorDeErrores({ registro, alFallar })(error, solicitud, respuesta, siguiente);
  return { respuesta, registro, alFallar, siguiente };
}

describe('manejador de errores', () => {
  it('convierte un error HTTP conocido en un problema RFC 9457', () => {
    const { respuesta, registro, alFallar } = manejar(sinPermiso());
    expect(respuesta.estado).toBe(403);
    expect(respuesta.tipo).toBe('application/problem+json');
    expect(respuesta.cuerpo).toEqual({
      type: 'about:blank',
      title: 'Acceso denegado',
      status: 403,
      detail: 'Tu rol no tiene permiso para realizar esta operación.',
      instance: '/api/v1/x?y=1',
      codigo: 'SIN_PERMISO',
    });
    expect(registro.error).not.toHaveBeenCalled();
    expect(alFallar).not.toHaveBeenCalled();
  });

  it('agrega los miembros de extensión del error', () => {
    const error = new ErrorHttp(400, 'VALIDACION', 'Datos no válidos.', { errores: [{ campo: 'x' }] });
    expect(manejar(error).respuesta.cuerpo.errores).toEqual([{ campo: 'x' }]);
  });

  it.each([
    [{ type: 'entity.parse.failed' }, 400, 'JSON_INVALIDO'],
    [{ type: 'entity.too.large' }, 413, 'CUERPO_DEMASIADO_GRANDE'],
    [{ code: 'ECONNREFUSED' }, 503, 'BASE_DE_DATOS_NO_DISPONIBLE'],
    [{ code: '57P01' }, 503, 'BASE_DE_DATOS_NO_DISPONIBLE'],
    [{ message: 'timeout exceeded when trying to connect' }, 503, 'BASE_DE_DATOS_NO_DISPONIBLE'],
  ])('clasifica %o como %i %s', (propiedades, estado, codigo) => {
    const { respuesta } = manejar(Object.assign(new Error(propiedades.message ?? 'x'), propiedades));
    expect(respuesta.cuerpo).toMatchObject({ status: estado, codigo });
  });

  it('oculta el detalle de un error inesperado, pero lo registra', () => {
    const error = new Error('relation "seguridad.usuarios" does not exist');
    const { respuesta, registro, alFallar } = manejar(error);
    expect(respuesta.cuerpo).toMatchObject({ status: 500, codigo: 'ERROR_INTERNO' });
    expect(JSON.stringify(respuesta.cuerpo)).not.toMatch(/seguridad|relation/);
    expect(registro.error).toHaveBeenCalledWith(expect.objectContaining({ err: error }), expect.any(String));
    expect(alFallar).toHaveBeenCalledWith({
      ruta: 'GET /api/v1/x',
      estado: 500,
      mensaje: respuesta.cuerpo.detail,
    });
  });

  it('delega en Express cuando la respuesta ya empezó a enviarse', () => {
    const error = new Error('tarde');
    const { respuesta, siguiente } = manejar(error, { enviada: true });
    expect(siguiente).toHaveBeenCalledWith(error);
    expect(respuesta.status).not.toHaveBeenCalled();
  });

  it('responde 404 en las rutas de la API que no existen', () => {
    expect(() => rutaApiInexistente({ method: 'DELETE', originalUrl: '/api/v1/fuentes' })).toThrow(
      expect.objectContaining({
        estado: 404,
        codigo: 'NO_ENCONTRADO',
        message: expect.stringContaining('DELETE'),
      }),
    );
  });

  it('usa un título genérico para estados sin título propio', () => {
    expect(crearProblema({ estado: 418, codigo: 'X', detalle: 'y', instancia: '/' }).title).toBe('Error');
  });
});
