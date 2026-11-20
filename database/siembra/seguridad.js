import argon2 from 'argon2';

export const USUARIOS_DEMO = Object.freeze([
  {
    correo: 'superadministrador@andes.test',
    nombre: 'Superadministración de demostración',
    rol: 'superadministrador',
  },
  { correo: 'ingenieria@andes.test', nombre: 'Ingeniería de demostración', rol: 'ingeniero' },
  {
    correo: 'datos@andes.test',
    nombre: 'Administración de datos de demostración',
    rol: 'administrador_datos',
  },
  { correo: 'analisis@andes.test', nombre: 'Análisis de demostración', rol: 'analista' },
]);

async function sembrarPermisos(cliente, permisos) {
  for (const { id, codigo, descripcion } of permisos) {
    await cliente.query(
      `INSERT INTO seguridad.permisos (id, codigo, descripcion) VALUES ($1, $2, $3)
       ON CONFLICT (id) DO UPDATE SET codigo = EXCLUDED.codigo, descripcion = EXCLUDED.descripcion`,
      [id, codigo, descripcion],
    );
  }
}

async function sembrarRoles(cliente, roles) {
  for (const { id, codigo, nombre } of roles) {
    await cliente.query(
      `INSERT INTO seguridad.roles (id, codigo, nombre) VALUES ($1, $2, $3)
       ON CONFLICT (id) DO UPDATE SET codigo = EXCLUDED.codigo, nombre = EXCLUDED.nombre`,
      [id, codigo, nombre],
    );
  }
}

async function sembrarAsignaciones(cliente, roles) {
  await cliente.query('DELETE FROM seguridad.roles_permisos');
  for (const { id, permisos } of roles) {
    await cliente.query(
      `INSERT INTO seguridad.roles_permisos (rol_id, permiso_id)
       SELECT $1, id FROM seguridad.permisos WHERE codigo = ANY($2::text[])`,
      [id, permisos],
    );
  }
}

export async function sembrarRolesYPermisos(cliente, { roles, permisos }) {
  await sembrarPermisos(cliente, permisos);
  await sembrarRoles(cliente, roles);
  await sembrarAsignaciones(cliente, roles);
}

export async function guardarUsuario(cliente, { correo, nombre, rol, clave }) {
  const hash = await argon2.hash(clave, { type: argon2.argon2id });
  const { rows } = await cliente.query(
    `INSERT INTO seguridad.usuarios (correo, nombre, hash_contrasena, rol_id)
     SELECT $1, $2, $3, id FROM seguridad.roles WHERE codigo = $4
     ON CONFLICT (correo) DO UPDATE
       SET nombre = EXCLUDED.nombre,
           hash_contrasena = EXCLUDED.hash_contrasena,
           rol_id = EXCLUDED.rol_id,
           activo = true
     RETURNING id, xmax = 0 AS creado`,
    [correo.toLowerCase(), nombre, hash, rol],
  );
  if (rows.length === 0) {
    throw new Error(`El rol ${rol} no existe.`);
  }
  return rows[0];
}

export async function sembrarUsuariosDemo(cliente, clave) {
  for (const usuario of USUARIOS_DEMO) {
    await guardarUsuario(cliente, { ...usuario, clave });
  }
  return USUARIOS_DEMO.length;
}
