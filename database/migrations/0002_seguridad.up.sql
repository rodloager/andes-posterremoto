CREATE TABLE seguridad.roles (
  id smallint PRIMARY KEY,
  codigo text NOT NULL UNIQUE CHECK (codigo ~ '^[a-z_]+$'),
  nombre text NOT NULL
);

CREATE TABLE seguridad.permisos (
  id smallint PRIMARY KEY,
  codigo text NOT NULL UNIQUE CHECK (codigo ~ '^[a-z]+:[a-z]+$'),
  descripcion text NOT NULL
);

CREATE TABLE seguridad.roles_permisos (
  rol_id smallint NOT NULL REFERENCES seguridad.roles (id) ON DELETE CASCADE,
  permiso_id smallint NOT NULL REFERENCES seguridad.permisos (id) ON DELETE CASCADE,
  PRIMARY KEY (rol_id, permiso_id)
);

CREATE TABLE seguridad.usuarios (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  correo text NOT NULL UNIQUE,
  nombre text NOT NULL,
  hash_contrasena text NOT NULL,
  rol_id smallint NOT NULL REFERENCES seguridad.roles (id),
  activo boolean NOT NULL DEFAULT true,
  creado_en timestamptz NOT NULL DEFAULT now(),
  ultimo_acceso timestamptz,
  CONSTRAINT usuarios_correo_valido CHECK (correo = lower(correo) AND correo ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  CONSTRAINT usuarios_nombre_valido CHECK (length(nombre) BETWEEN 1 AND 120),
  CONSTRAINT usuarios_hash_argon2id CHECK (hash_contrasena LIKE '$argon2id$%')
);

CREATE TABLE seguridad.sesiones (
  sid varchar NOT NULL PRIMARY KEY,
  sess json NOT NULL,
  expire timestamp(6) NOT NULL
);

CREATE INDEX sesiones_expiracion ON seguridad.sesiones (expire);

CREATE TABLE seguridad.registro_accesos (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usuario_id integer REFERENCES seguridad.usuarios (id),
  correo_intentado text NOT NULL,
  ip inet,
  exitoso boolean NOT NULL,
  motivo text NOT NULL CHECK (motivo IN ('INICIO_SESION', 'CIERRE_SESION', 'CREDENCIALES_INVALIDAS', 'USUARIO_INACTIVO')),
  ocurrido_en timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX registro_accesos_fecha ON seguridad.registro_accesos USING brin (ocurrido_en);

CREATE TABLE seguridad.auditoria (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usuario_id integer REFERENCES seguridad.usuarios (id),
  accion text NOT NULL CHECK (accion IN ('CREAR', 'ACTUALIZAR', 'ELIMINAR')),
  entidad text NOT NULL,
  entidad_id text NOT NULL,
  antes jsonb,
  despues jsonb,
  ocurrido_en timestamptz NOT NULL,
  hash_anterior char(64) NOT NULL,
  hash char(64) NOT NULL UNIQUE
);

CREATE INDEX auditoria_entidad ON seguridad.auditoria (entidad, entidad_id);
CREATE INDEX auditoria_fecha ON seguridad.auditoria USING brin (ocurrido_en);

CREATE FUNCTION seguridad.calcular_hash_auditoria(
  hash_anterior text,
  usuario_id integer,
  accion text,
  entidad text,
  entidad_id text,
  antes jsonb,
  despues jsonb,
  ocurrido_en timestamptz
) RETURNS char(64)
LANGUAGE sql
STABLE
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT encode(sha256(convert_to(concat_ws('|',
    hash_anterior,
    coalesce(usuario_id::text, ''),
    accion,
    entidad,
    entidad_id,
    coalesce(antes::text, ''),
    coalesce(despues::text, ''),
    to_char(ocurrido_en AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US')
  ), 'UTF8')), 'hex')
$$;

CREATE FUNCTION seguridad.registrar_auditoria(
  p_usuario_id integer,
  p_accion text,
  p_entidad text,
  p_entidad_id text,
  p_antes jsonb,
  p_despues jsonb
) RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_anterior char(64);
  v_momento timestamptz := clock_timestamp();
  v_id bigint;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('seguridad.auditoria'));
  SELECT hash INTO v_anterior FROM seguridad.auditoria ORDER BY id DESC LIMIT 1;
  v_anterior := coalesce(v_anterior, repeat('0', 64));
  INSERT INTO seguridad.auditoria (usuario_id, accion, entidad, entidad_id, antes, despues, ocurrido_en, hash_anterior, hash)
  VALUES (
    p_usuario_id, p_accion, p_entidad, p_entidad_id, p_antes, p_despues, v_momento, v_anterior,
    seguridad.calcular_hash_auditoria(v_anterior, p_usuario_id, p_accion, p_entidad, p_entidad_id, p_antes, p_despues, v_momento)
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END
$$;

CREATE FUNCTION seguridad.verificar_auditoria()
RETURNS TABLE (registros bigint, primer_error bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_fila seguridad.auditoria%ROWTYPE;
  v_esperado char(64) := repeat('0', 64);
BEGIN
  registros := 0;
  primer_error := NULL;
  FOR v_fila IN SELECT * FROM seguridad.auditoria ORDER BY id LOOP
    registros := registros + 1;
    IF primer_error IS NULL AND (
      v_fila.hash_anterior <> v_esperado
      OR v_fila.hash <> seguridad.calcular_hash_auditoria(
        v_fila.hash_anterior, v_fila.usuario_id, v_fila.accion, v_fila.entidad,
        v_fila.entidad_id, v_fila.antes, v_fila.despues, v_fila.ocurrido_en
      )
    ) THEN
      primer_error := v_fila.id;
    END IF;
    v_esperado := v_fila.hash;
  END LOOP;
  RETURN NEXT;
END
$$;

REVOKE ALL ON FUNCTION seguridad.registrar_auditoria(integer, text, text, text, jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION seguridad.verificar_auditoria() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION seguridad.registrar_auditoria(integer, text, text, text, jsonb, jsonb) TO andes_app;
GRANT EXECUTE ON FUNCTION seguridad.verificar_auditoria() TO andes_app;

GRANT SELECT ON seguridad.roles, seguridad.permisos, seguridad.roles_permisos TO andes_app;
GRANT SELECT ON seguridad.usuarios TO andes_app;
GRANT UPDATE (ultimo_acceso) ON seguridad.usuarios TO andes_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON seguridad.sesiones TO andes_app;
GRANT SELECT, INSERT ON seguridad.registro_accesos TO andes_app;
GRANT SELECT ON seguridad.auditoria TO andes_app;
