import { randomBytes } from 'node:crypto';
import argon2 from 'argon2';
import { ErrorHttp } from '../utils/errores.js';

const credencialesInvalidas = () =>
  new ErrorHttp(401, 'CREDENCIALES_INVALIDAS', 'El correo o la contraseña no son correctos.');

function determinarMotivo(usuario, claveValida) {
  if (!claveValida) {
    return 'CREDENCIALES_INVALIDAS';
  }
  return usuario.activo ? 'INICIO_SESION' : 'USUARIO_INACTIVO';
}

export function comoUsuarioPublico(usuario) {
  return {
    correo: usuario.correo,
    nombre: usuario.nombre,
    rol: usuario.rol,
    nombreRol: usuario.nombre_rol,
    permisos: usuario.permisos,
  };
}

export function crearServicioSesion(repositorio) {
  const hashFicticio = argon2.hash(randomBytes(32).toString('hex'), { type: argon2.argon2id });

  async function verificarClave(usuario, clave) {
    if (!usuario) {
      await argon2.verify(await hashFicticio, clave);
      return false;
    }
    return argon2.verify(usuario.hash_contrasena, clave);
  }

  return {
    async iniciar({ correo, clave, ip }) {
      const usuario = await repositorio.buscarPorCorreo(correo);
      const motivo = determinarMotivo(usuario, await verificarClave(usuario, clave));
      const exitoso = motivo === 'INICIO_SESION';
      await repositorio.registrarAcceso({ usuarioId: usuario?.id ?? null, correo, ip, exitoso, motivo });
      if (!exitoso) {
        throw credencialesInvalidas();
      }
      await repositorio.marcarAcceso(usuario.id);
      return repositorio.buscarActivo(usuario.id);
    },

    cargar: (id) => repositorio.buscarActivo(id),

    cerrar: ({ usuario, ip }) =>
      repositorio.registrarAcceso({
        usuarioId: usuario.id,
        correo: usuario.correo,
        ip,
        exitoso: true,
        motivo: 'CIERRE_SESION',
      }),
  };
}
