import argon2 from 'argon2';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { guardarUsuario } from '../../database/siembra/seguridad.js';
import { conectarComoPropietario } from './apoyo.js';

let propietario;

beforeAll(async () => {
  propietario = await conectarComoPropietario();
});

afterAll(() => propietario.end());

describe('alta de usuarios', () => {
  it('distingue una cuenta nueva de una existente y guarda la contraseña con Argon2id', async () => {
    await propietario.query('BEGIN');
    try {
      const datos = { correo: 'Nueva.Persona@Andes.test', nombre: 'Persona nueva', rol: 'analista' };
      const alta = await guardarUsuario(propietario, { ...datos, clave: 'primera-clave-de-prueba' });
      const cambio = await guardarUsuario(propietario, {
        ...datos,
        rol: 'ingeniero',
        clave: 'segunda-clave-de-prueba',
      });
      expect(alta).toEqual({ id: expect.any(Number), creado: true });
      expect(cambio).toEqual({ id: alta.id, creado: false });

      const { rows } = await propietario.query(
        `SELECT u.correo, u.hash_contrasena, r.codigo AS rol
         FROM seguridad.usuarios u JOIN seguridad.roles r ON r.id = u.rol_id
         WHERE u.id = $1`,
        [alta.id],
      );
      expect(rows[0]).toMatchObject({ correo: 'nueva.persona@andes.test', rol: 'ingeniero' });
      expect(rows[0].hash_contrasena).toMatch(/^\$argon2id\$/);
      expect(await argon2.verify(rows[0].hash_contrasena, 'segunda-clave-de-prueba')).toBe(true);
    } finally {
      await propietario.query('ROLLBACK');
    }
  });

  it('rechaza un rol que no existe', async () => {
    await propietario.query('BEGIN');
    try {
      await expect(
        guardarUsuario(propietario, {
          correo: 'x@andes.test',
          nombre: 'X',
          rol: 'invitado',
          clave: 'clave-de-prueba',
        }),
      ).rejects.toThrow('El rol invitado no existe.');
    } finally {
      await propietario.query('ROLLBACK');
    }
  });
});
