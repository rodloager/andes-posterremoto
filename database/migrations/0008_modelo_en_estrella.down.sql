ALTER DEFAULT PRIVILEGES IN SCHEMA bi REVOKE SELECT ON TABLES FROM powerbi_lector;

DROP SCHEMA bi CASCADE;

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'powerbi_lector') THEN
    EXECUTE format('REVOKE CONNECT ON DATABASE %I FROM powerbi_lector', current_database());
  END IF;
END
$$;
