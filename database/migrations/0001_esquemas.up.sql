DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'andes_app') THEN
    CREATE ROLE andes_app NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'andes_lector') THEN
    CREATE ROLE andes_lector NOLOGIN;
  END IF;
  EXECUTE format('REVOKE ALL ON DATABASE %I FROM PUBLIC', current_database());
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO andes_app, andes_lector', current_database());
END
$$;

REVOKE ALL ON SCHEMA public FROM PUBLIC;

CREATE SCHEMA seguridad;
CREATE SCHEMA nucleo;
CREATE SCHEMA analitica;

GRANT USAGE ON SCHEMA seguridad, nucleo TO andes_app;
GRANT USAGE ON SCHEMA analitica TO andes_app, andes_lector;
