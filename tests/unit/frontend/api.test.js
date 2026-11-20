import { describe, expect, it } from 'vitest';
import { ErrorDeApi, conParametros, describirError } from '../../../frontend/private/js/api.js';

describe('descripción de errores de la API', () => {
  it('prefiere los mensajes de cada campo cuando la API los envía', () => {
    const error = new ErrorDeApi(400, {
      detail: 'Hay datos que no cumplen el formato esperado.',
      codigo: 'VALIDACION',
      errores: [
        { campo: 'correo', mensaje: 'Escribe un correo electrónico válido.' },
        { campo: 'clave', mensaje: 'Escribe la contraseña.' },
      ],
    });
    expect(describirError(error, 'x')).toBe('Escribe un correo electrónico válido. Escribe la contraseña.');
  });

  it('usa el detalle del problema cuando no hay errores por campo', () => {
    const error = new ErrorDeApi(403, { detail: 'Tu rol no tiene permiso.', codigo: 'SIN_PERMISO' });
    expect(describirError(error, 'x')).toBe('Tu rol no tiene permiso.');
    expect(error).toMatchObject({ estado: 403, codigo: 'SIN_PERMISO', errores: [] });
  });

  it('da un mensaje propio cuando la respuesta no es un problema', () => {
    expect(new ErrorDeApi(502, null).message).toBe('La solicitud falló con el estado 502.');
  });

  it('usa el mensaje por defecto ante fallos de red', () => {
    expect(describirError(new TypeError('Failed to fetch'), 'Sin conexión.')).toBe('Sin conexión.');
  });
});

describe('parámetros de consulta', () => {
  it('omite los filtros vacíos y codifica los valores', () => {
    expect(
      conParametros('/admin/registros', { departamento: '66', alerta: '', despues: null, limite: 25 }),
    ).toBe('/admin/registros?departamento=66&limite=25');
    expect(conParametros('/admin/registros', { departamento: undefined })).toBe('/admin/registros');
    expect(conParametros('/x', { texto: 'a&b=c' })).toBe('/x?texto=a%26b%3Dc');
  });
});
