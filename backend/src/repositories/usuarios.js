export function crearRepositorioUsuarios(grupo) {
  const primera = async (consulta, parametros) => (await grupo.query(consulta, parametros)).rows[0] ?? null;

  return {
    buscarPorCorreo: (correo) =>
      primera(
        `SELECT id, correo, hash_contrasena, activo
         FROM seguridad.usuarios
         WHERE correo = $1`,
        [correo],
      ),

    buscarActivo: (id) =>
      primera(
        `SELECT u.id, u.correo, u.nombre, r.codigo AS rol, r.nombre AS nombre_rol,
                coalesce(array_agg(p.codigo ORDER BY p.codigo) FILTER (WHERE p.codigo IS NOT NULL), '{}') AS permisos
         FROM seguridad.usuarios u
         JOIN seguridad.roles r ON r.id = u.rol_id
         LEFT JOIN seguridad.roles_permisos rp ON rp.rol_id = r.id
         LEFT JOIN seguridad.permisos p ON p.id = rp.permiso_id
         WHERE u.id = $1 AND u.activo
         GROUP BY u.id, r.codigo, r.nombre`,
        [id],
      ),

    marcarAcceso: (id) =>
      grupo.query('UPDATE seguridad.usuarios SET ultimo_acceso = now() WHERE id = $1', [id]),

    registrarAcceso: ({ usuarioId, correo, ip, exitoso, motivo }) =>
      grupo.query(
        `INSERT INTO seguridad.registro_accesos (usuario_id, correo_intentado, ip, exitoso, motivo)
         VALUES ($1, $2, $3, $4, $5)`,
        [usuarioId, correo, ip, exitoso, motivo],
      ),
  };
}
