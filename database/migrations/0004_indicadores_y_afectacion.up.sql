CREATE TABLE nucleo.indicadores (
  codigo text PRIMARY KEY CHECK (codigo ~ '^[a-z_]+$'),
  orden smallint NOT NULL UNIQUE,
  nombre text NOT NULL,
  descripcion text NOT NULL,
  unidad text NOT NULL,
  es_acumulado boolean NOT NULL,
  es_derivado boolean NOT NULL DEFAULT false,
  motivo_sin_dato text
);

CREATE TABLE nucleo.valores_indicador (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  indicador_codigo text NOT NULL REFERENCES nucleo.indicadores (codigo),
  evento_id integer NOT NULL REFERENCES nucleo.eventos_sismicos (id),
  fecha_corte date NOT NULL,
  valor numeric NOT NULL CHECK (valor >= 0),
  calificador text CHECK (calificador IN ('más de', 'cerca de')),
  nota text,
  fuente_id text NOT NULL REFERENCES nucleo.fuentes_datos (id),
  UNIQUE (indicador_codigo, evento_id, fecha_corte, fuente_id)
);

CREATE INDEX valores_indicador_serie ON nucleo.valores_indicador (evento_id, indicador_codigo, fecha_corte);

CREATE TABLE nucleo.variables_territoriales (
  codigo text PRIMARY KEY CHECK (codigo ~ '^[a-z][a-zA-Z]+$'),
  orden smallint NOT NULL UNIQUE,
  nombre text NOT NULL,
  unidad text NOT NULL
);

CREATE TABLE nucleo.reportes_municipales (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ejecucion_id bigint NOT NULL REFERENCES nucleo.ejecuciones_etl (id) ON DELETE CASCADE,
  evento_id integer NOT NULL REFERENCES nucleo.eventos_sismicos (id),
  municipio_codigo char(5) NOT NULL REFERENCES nucleo.municipios (codigo),
  fecha_reporte date,
  alertas text[] NOT NULL DEFAULT '{}'
    CHECK (alertas <@ ARRAY['PERSONAS_MENOR_QUE_FAMILIAS', 'FECHA_REPORTE_INVALIDA']::text[]),
  UNIQUE (ejecucion_id, municipio_codigo)
);

CREATE INDEX reportes_municipales_evento ON nucleo.reportes_municipales (evento_id, municipio_codigo);

CREATE TABLE nucleo.valores_reporte_municipal (
  reporte_id bigint NOT NULL REFERENCES nucleo.reportes_municipales (id) ON DELETE CASCADE,
  variable_codigo text NOT NULL REFERENCES nucleo.variables_territoriales (codigo),
  valor integer NOT NULL CHECK (valor >= 0),
  PRIMARY KEY (reporte_id, variable_codigo)
);

CREATE INDEX valores_reporte_variable ON nucleo.valores_reporte_municipal (variable_codigo);

CREATE TABLE nucleo.reclamaciones_departamento (
  evento_id integer NOT NULL REFERENCES nucleo.eventos_sismicos (id),
  departamento_codigo char(2) NOT NULL REFERENCES nucleo.departamentos (codigo),
  fecha_corte date NOT NULL,
  fuente_id text NOT NULL REFERENCES nucleo.fuentes_datos (id),
  siniestros integer NOT NULL CHECK (siniestros >= 0),
  pagos numeric NOT NULL CHECK (pagos >= 0),
  valor_estimado numeric NOT NULL CHECK (valor_estimado >= 0),
  PRIMARY KEY (evento_id, departamento_codigo, fecha_corte, fuente_id)
);

CREATE TABLE nucleo.reclamaciones_ramo (
  evento_id integer NOT NULL REFERENCES nucleo.eventos_sismicos (id),
  orden smallint NOT NULL,
  ramo text NOT NULL,
  fecha_corte date NOT NULL,
  fuente_id text NOT NULL REFERENCES nucleo.fuentes_datos (id),
  reclamaciones integer NOT NULL CHECK (reclamaciones >= 0),
  reserva numeric NOT NULL CHECK (reserva >= 0),
  PRIMARY KEY (evento_id, ramo, fecha_corte, fuente_id)
);

CREATE TABLE nucleo.partidas_economicas (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  evento_id integer NOT NULL REFERENCES nucleo.eventos_sismicos (id),
  tipo text NOT NULL CHECK (tipo IN ('COSTO', 'RECURSO', 'DESTINO_FONDO')),
  orden smallint NOT NULL,
  concepto text NOT NULL,
  valor numeric NOT NULL CHECK (valor >= 0),
  calificador text CHECK (calificador IN ('más de', 'cerca de')),
  fecha_corte date NOT NULL,
  fuente_id text NOT NULL REFERENCES nucleo.fuentes_datos (id),
  UNIQUE (evento_id, tipo, orden)
);

CREATE TABLE nucleo.mediciones_contratacion (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  evento_id integer NOT NULL REFERENCES nucleo.eventos_sismicos (id),
  orden smallint NOT NULL,
  concepto text NOT NULL,
  contratos integer NOT NULL CHECK (contratos >= 0),
  valor numeric NOT NULL CHECK (valor >= 0),
  contratacion_directa integer NOT NULL CHECK (contratacion_directa >= 0),
  periodo text NOT NULL,
  fuente_id text NOT NULL REFERENCES nucleo.fuentes_datos (id),
  UNIQUE (evento_id, orden),
  CONSTRAINT contratacion_directa_acotada CHECK (contratacion_directa <= contratos)
);

CREATE FUNCTION nucleo.rechazar_fuente_simulada() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF EXISTS (SELECT FROM nucleo.fuentes_datos WHERE id = NEW.fuente_id AND origen = 'SIMULADO') THEN
    RAISE EXCEPTION 'La tabla % no admite cifras de una fuente simulada: %', TG_TABLE_NAME, NEW.fuente_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER sin_fuente_simulada BEFORE INSERT OR UPDATE ON nucleo.valores_indicador
  FOR EACH ROW EXECUTE FUNCTION nucleo.rechazar_fuente_simulada();
CREATE TRIGGER sin_fuente_simulada BEFORE INSERT OR UPDATE ON nucleo.reclamaciones_departamento
  FOR EACH ROW EXECUTE FUNCTION nucleo.rechazar_fuente_simulada();
CREATE TRIGGER sin_fuente_simulada BEFORE INSERT OR UPDATE ON nucleo.reclamaciones_ramo
  FOR EACH ROW EXECUTE FUNCTION nucleo.rechazar_fuente_simulada();
CREATE TRIGGER sin_fuente_simulada BEFORE INSERT OR UPDATE ON nucleo.partidas_economicas
  FOR EACH ROW EXECUTE FUNCTION nucleo.rechazar_fuente_simulada();
CREATE TRIGGER sin_fuente_simulada BEFORE INSERT OR UPDATE ON nucleo.mediciones_contratacion
  FOR EACH ROW EXECUTE FUNCTION nucleo.rechazar_fuente_simulada();

GRANT SELECT ON
  nucleo.indicadores,
  nucleo.valores_indicador,
  nucleo.variables_territoriales,
  nucleo.reportes_municipales,
  nucleo.valores_reporte_municipal,
  nucleo.reclamaciones_departamento,
  nucleo.reclamaciones_ramo,
  nucleo.partidas_economicas,
  nucleo.mediciones_contratacion
TO andes_app;
