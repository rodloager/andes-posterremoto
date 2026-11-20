CREATE TABLE nucleo.departamentos (
  codigo char(2) PRIMARY KEY CHECK (codigo ~ '^[0-9]{2}$'),
  nombre text NOT NULL
);

CREATE TABLE nucleo.municipios (
  codigo char(5) PRIMARY KEY CHECK (codigo ~ '^[0-9]{5}$'),
  departamento_codigo char(2) NOT NULL REFERENCES nucleo.departamentos (codigo),
  nombre text NOT NULL,
  CONSTRAINT municipios_prefijo_departamento CHECK (left(codigo, 2) = departamento_codigo)
);

CREATE INDEX municipios_departamento ON nucleo.municipios (departamento_codigo);

CREATE TABLE nucleo.fuentes_datos (
  id text PRIMARY KEY CHECK (id ~ '^[a-z0-9-]+$'),
  orden smallint NOT NULL UNIQUE,
  entidad text NOT NULL,
  sigla text,
  nombre text NOT NULL,
  origen text NOT NULL CHECK (origen IN ('OFICIAL', 'ESTIMADO', 'SIMULADO')),
  nivel char(1) NOT NULL CHECK (nivel IN ('A', 'B', 'C', 'S')),
  tipo_acceso text NOT NULL,
  enlace text CHECK (enlace ~ '^https://'),
  leido_en text,
  fecha_publicacion date,
  fecha_consulta date,
  cobertura text NOT NULL,
  variables text NOT NULL,
  limitaciones text NOT NULL,
  uso text NOT NULL CHECK (uso IN ('indicadores', 'referencia')),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fuentes_nivel_coherente CHECK (
    (origen = 'SIMULADO') = (nivel = 'S') AND (origen = 'ESTIMADO') = (nivel = 'C')
  ),
  CONSTRAINT fuentes_procedencia_obligatoria CHECK (
    origen = 'SIMULADO' OR (enlace IS NOT NULL AND fecha_consulta IS NOT NULL)
  )
);

CREATE TABLE nucleo.conjuntos_datos (
  id text PRIMARY KEY CHECK (id ~ '^[a-z0-9-]+$'),
  nombre text NOT NULL,
  descripcion text NOT NULL,
  fuente_id text NOT NULL REFERENCES nucleo.fuentes_datos (id)
);

CREATE TABLE nucleo.ejecuciones_etl (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  conjunto_id text NOT NULL REFERENCES nucleo.conjuntos_datos (id),
  usuario_id integer REFERENCES seguridad.usuarios (id),
  origen_archivo text NOT NULL,
  huella_archivo char(64) NOT NULL CHECK (huella_archivo ~ '^[0-9a-f]{64}$'),
  iniciada_en timestamptz NOT NULL DEFAULT now(),
  finalizada_en timestamptz,
  estado text NOT NULL CHECK (estado IN ('EN_CURSO', 'TERMINADA', 'FALLIDA')),
  filas_leidas integer NOT NULL DEFAULT 0 CHECK (filas_leidas >= 0),
  filas_validas integer NOT NULL DEFAULT 0 CHECK (filas_validas >= 0),
  filas_rechazadas integer NOT NULL DEFAULT 0 CHECK (filas_rechazadas >= 0),
  duplicados integer NOT NULL DEFAULT 0 CHECK (duplicados >= 0),
  alertas integer NOT NULL DEFAULT 0 CHECK (alertas >= 0),
  mensaje text,
  CONSTRAINT ejecuciones_finalizacion CHECK ((estado = 'EN_CURSO') = (finalizada_en IS NULL))
);

CREATE UNIQUE INDEX ejecuciones_archivo_unico
  ON nucleo.ejecuciones_etl (conjunto_id, huella_archivo)
  WHERE estado = 'TERMINADA';

CREATE TABLE nucleo.eventos_sismicos (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  codigo text NOT NULL UNIQUE CHECK (codigo ~ '^[a-z0-9-]+$'),
  nombre text NOT NULL,
  fecha date NOT NULL,
  municipio_epicentro char(5) NOT NULL REFERENCES nucleo.municipios (codigo),
  latitud numeric(8, 5) NOT NULL CHECK (latitud BETWEEN -90 AND 90),
  longitud numeric(8, 5) NOT NULL CHECK (longitud BETWEEN -180 AND 180),
  fuente_coordenadas text NOT NULL REFERENCES nucleo.fuentes_datos (id)
);

CREATE TABLE nucleo.parametros_evento (
  evento_id integer NOT NULL REFERENCES nucleo.eventos_sismicos (id) ON DELETE CASCADE,
  orden smallint NOT NULL,
  posicion smallint NOT NULL,
  parametro text NOT NULL,
  fuente_id text NOT NULL REFERENCES nucleo.fuentes_datos (id),
  valor text NOT NULL,
  PRIMARY KEY (evento_id, orden, posicion),
  UNIQUE (evento_id, parametro, fuente_id)
);

CREATE TABLE nucleo.normas_evento (
  evento_id integer NOT NULL REFERENCES nucleo.eventos_sismicos (id) ON DELETE CASCADE,
  orden smallint NOT NULL,
  nombre text NOT NULL,
  contenido text NOT NULL,
  PRIMARY KEY (evento_id, orden)
);

GRANT SELECT ON
  nucleo.departamentos,
  nucleo.municipios,
  nucleo.fuentes_datos,
  nucleo.conjuntos_datos,
  nucleo.ejecuciones_etl,
  nucleo.eventos_sismicos,
  nucleo.parametros_evento,
  nucleo.normas_evento
TO andes_app;

GRANT UPDATE (fecha_consulta, cobertura, variables, limitaciones, actualizado_en)
  ON nucleo.fuentes_datos TO andes_app;
