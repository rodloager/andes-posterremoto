import { describe, expect, it, vi } from 'vitest';
import { validar } from '../../../backend/src/middlewares/validacion.js';
import {
  cambiosDeFuente,
  credenciales,
  filtrosDeRegistros,
  paginacionPorId,
  parametrosDepartamento,
} from '../../../backend/src/models/esquemas.js';

function ejecutar(esquemas, solicitud) {
  const respuesta = { locals: {} };
  const siguiente = vi.fn();
  try {
    validar(esquemas)(solicitud, respuesta, siguiente);
    return { validado: respuesta.locals.validado, siguiente };
  } catch (error) {
    return { error, siguiente };
  }
}

describe('middleware de validación', () => {
  it('deja los datos convertidos en res.locals y continúa', () => {
    const { validado, siguiente } = ejecutar(
      { query: paginacionPorId },
      { query: { limite: '20', despues: '7' } },
    );
    expect(validado).toEqual({ query: { limite: 20, despues: 7 } });
    expect(siguiente).toHaveBeenCalledOnce();
  });

  it('reúne los problemas de todas las partes de la solicitud', () => {
    const { error, siguiente } = ejecutar(
      { params: parametrosDepartamento, body: cambiosDeFuente },
      { params: { evento: 'sismo', departamento: '5' }, body: { fechaConsulta: 'ayer' } },
    );
    expect(siguiente).not.toHaveBeenCalled();
    expect(error).toMatchObject({ estado: 400, codigo: 'VALIDACION' });
    expect(error.extensiones.errores.map(({ ubicacion, campo }) => `${ubicacion}.${campo}`)).toEqual([
      'params.departamento',
      'body.fechaConsulta',
    ]);
  });

  it('trata una parte ausente como un objeto vacío', () => {
    const { validado } = ejecutar({ query: paginacionPorId }, {});
    expect(validado.query).toEqual({ limite: 50 });
  });

  it('describe los problemas en español', () => {
    const { error } = ejecutar({ body: credenciales }, { body: { correo: 'sin-arroba', clave: '' } });
    expect(error.extensiones.errores).toEqual([
      { ubicacion: 'body', campo: 'correo', mensaje: 'Escribe un correo electrónico válido.' },
      { ubicacion: 'body', campo: 'clave', mensaje: 'Escribe la contraseña.' },
    ]);
  });
});

describe('esquemas de entrada', () => {
  it('normaliza el correo a minúsculas', () => {
    expect(credenciales.parse({ correo: 'Persona@ANDES.test', clave: 'x' }).correo).toBe(
      'persona@andes.test',
    );
  });

  it('rechaza campos que no forman parte del contrato', () => {
    expect(credenciales.safeParse({ correo: 'a@b.co', clave: 'x', rol: 'superadministrador' }).success).toBe(
      false,
    );
  });

  it('limita el tamaño de página', () => {
    expect(paginacionPorId.parse({}).limite).toBe(50);
    expect(paginacionPorId.safeParse({ limite: '200' }).success).toBe(true);
    expect(paginacionPorId.safeParse({ limite: '201' }).success).toBe(false);
    expect(paginacionPorId.safeParse({ despues: '-1' }).success).toBe(false);
  });

  it('acepta solo códigos DIVIPOLA y alertas conocidas como filtros', () => {
    expect(
      filtrosDeRegistros.safeParse({ departamento: '66', alerta: 'FECHA_REPORTE_INVALIDA' }).success,
    ).toBe(true);
    expect(filtrosDeRegistros.safeParse({ despues: '6600' }).success).toBe(false);
    expect(filtrosDeRegistros.safeParse({ alerta: 'fecha_reporte_invalida' }).success).toBe(false);
  });

  it('explica los límites de longitud con mensajes propios', () => {
    expect(credenciales.safeParse({ correo: 'a@b.co', clave: 'x'.repeat(201) }).error.issues[0].message).toBe(
      'La contraseña no puede superar 200 caracteres.',
    );
    expect(cambiosDeFuente.safeParse({ limitaciones: ' ' }).error.issues[0].message).toBe(
      'El texto no puede quedar vacío.',
    );
    expect(cambiosDeFuente.safeParse({ cobertura: 'x'.repeat(501) }).error.issues[0].message).toBe(
      'El texto no puede superar 500 caracteres.',
    );
  });

  it('exige al menos un cambio y fechas reales al editar una fuente', () => {
    expect(cambiosDeFuente.safeParse({}).success).toBe(false);
    expect(cambiosDeFuente.safeParse({ fechaConsulta: '2028-02-29' }).success).toBe(true);
    expect(cambiosDeFuente.safeParse({ fechaConsulta: '2026-02-29' }).success).toBe(false);
    expect(cambiosDeFuente.parse({ cobertura: '  Nacional ' })).toEqual({ cobertura: 'Nacional' });
  });
});
