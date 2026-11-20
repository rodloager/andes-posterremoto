CREATE SCHEMA staging;

ALTER TABLE nucleo.conjuntos_datos
  ADD COLUMN destino text CHECK (destino IN ('reportes', 'personas', 'viviendas')),
  ADD COLUMN version_esquema integer NOT NULL DEFAULT 1 CHECK (version_esquema > 0);

UPDATE nucleo.conjuntos_datos SET destino = 'reportes' WHERE id = 'dane-afectaciones';

ALTER TABLE nucleo.ejecuciones_etl
  DROP CONSTRAINT ejecuciones_finalizacion,
  DROP CONSTRAINT ejecuciones_etl_estado_check;

ALTER TABLE nucleo.ejecuciones_etl
  ADD CONSTRAINT ejecuciones_etl_estado_check CHECK (estado IN ('EN_COLA', 'EN_CURSO', 'TERMINADA', 'FALLIDA')),
  ADD CONSTRAINT ejecuciones_finalizacion CHECK ((estado IN ('EN_COLA', 'EN_CURSO')) = (finalizada_en IS NULL)),
  ADD COLUMN formato text CHECK (formato IN ('csv', 'json', 'jsonl')),
  ADD COLUMN nombre_archivo text CHECK (length(nombre_archivo) BETWEEN 1 AND 255),
  ADD COLUMN tamano_bytes bigint CHECK (tamano_bytes >= 0),
  ADD COLUMN tamano_lote integer CHECK (tamano_lote > 0),
  ADD COLUMN encolada_en timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN filas_confirmadas integer NOT NULL DEFAULT 0 CHECK (filas_confirmadas >= 0),
  ADD COLUMN en_revision integer NOT NULL DEFAULT 0 CHECK (en_revision >= 0),
  ADD COLUMN duracion_ms integer CHECK (duracion_ms >= 0),
  ADD COLUMN memoria_maxima_mb numeric(8, 1) CHECK (memoria_maxima_mb >= 0),
  ADD COLUMN agregados_aplicados boolean NOT NULL DEFAULT false;

CREATE INDEX ejecuciones_en_cola ON nucleo.ejecuciones_etl (id) WHERE estado = 'EN_COLA';

CREATE TABLE nucleo.condiciones_institucionales (
  id smallint PRIMARY KEY,
  codigo text NOT NULL UNIQUE,
  nombre text NOT NULL,
  padre_id smallint REFERENCES nucleo.condiciones_institucionales (id),
  asignable boolean NOT NULL
);

INSERT INTO nucleo.condiciones_institucionales (id, codigo, nombre, padre_id, asignable) VALUES
  (1, 'CIVIL', 'Civil', NULL, true),
  (2, 'MILITAR', 'Militar', NULL, true),
  (3, 'PRIVADA_LIBERTAD', 'Privada de la libertad', NULL, false),
  (4, 'RECLUSION', 'Privada de la libertad en establecimiento de reclusión', 3, true),
  (5, 'OTRA_MODALIDAD', 'Privada de la libertad en otra modalidad', 3, true);

CREATE TABLE nucleo.tipos_tenencia (
  id smallint PRIMARY KEY,
  codigo text NOT NULL UNIQUE,
  nombre text NOT NULL
);

INSERT INTO nucleo.tipos_tenencia (id, codigo, nombre) VALUES
  (1, 'PROPIETARIO', 'Propietario'),
  (2, 'ARRENDATARIO', 'Arrendatario'),
  (3, 'OCUPANTE_CON_PERMISO', 'Ocupante con permiso'),
  (4, 'OTRA', 'Otra');

CREATE TABLE nucleo.tipos_vulnerabilidad (
  id smallint PRIMARY KEY,
  codigo text NOT NULL UNIQUE,
  nombre text NOT NULL,
  bit smallint NOT NULL UNIQUE CHECK (bit BETWEEN 0 AND 14),
  es_derivada boolean NOT NULL
);

INSERT INTO nucleo.tipos_vulnerabilidad (id, codigo, nombre, bit, es_derivada) VALUES
  (1, 'DISCAPACIDAD', 'Discapacidad', 0, false),
  (2, 'NECESIDADES_ESPECIALES', 'Necesidades especiales', 1, false),
  (3, 'MOVILIDAD_REDUCIDA', 'Movilidad reducida', 2, false),
  (4, 'ADULTO_MAYOR', 'Adulto mayor', 3, true),
  (5, 'EMBARAZO', 'Embarazo', 4, false),
  (6, 'POBLACION_INFANTIL', 'Población infantil', 5, true),
  (7, 'VULNERABILIDAD_SOCIOECONOMICA', 'Vulnerabilidad socioeconómica', 6, false),
  (8, 'COMUNIDAD_ATENCION_PRIORITARIA', 'Comunidad de atención prioritaria', 7, false);

CREATE TABLE nucleo.estados_fisicos (
  id smallint PRIMARY KEY,
  codigo text NOT NULL UNIQUE,
  nombre text NOT NULL,
  orden smallint NOT NULL UNIQUE,
  afectada boolean NOT NULL
);

INSERT INTO nucleo.estados_fisicos (id, codigo, nombre, orden, afectada) VALUES
  (1, 'SIN_AFECTACION', 'Sin afectación', 1, false),
  (2, 'AFECTACION_LEVE', 'Afectación leve', 2, true),
  (3, 'AFECTACION_MODERADA', 'Afectación moderada', 3, true),
  (4, 'AFECTACION_GRAVE', 'Afectación grave', 4, true),
  (5, 'DESTRUCCION_TOTAL', 'Destrucción total', 5, true),
  (6, 'PENDIENTE_EVALUACION', 'Pendiente de evaluación', 6, false);

CREATE TABLE nucleo.condiciones_ocupacion (
  id smallint PRIMARY KEY,
  codigo text NOT NULL UNIQUE,
  nombre text NOT NULL
);

INSERT INTO nucleo.condiciones_ocupacion (id, codigo, nombre) VALUES
  (1, 'PROPIA', 'Vivienda propia'),
  (2, 'ARRENDADA', 'Vivienda arrendada'),
  (3, 'TERCEROS', 'Ocupada por terceros'),
  (4, 'DESOCUPADA', 'Desocupada'),
  (5, 'OTRA', 'Otra modalidad');

CREATE TABLE nucleo.tipos_financiacion (
  id smallint PRIMARY KEY,
  codigo text NOT NULL UNIQUE,
  nombre text NOT NULL,
  exige_seguro boolean NOT NULL
);

INSERT INTO nucleo.tipos_financiacion (id, codigo, nombre, exige_seguro) VALUES
  (1, 'HIPOTECA', 'Hipotecada', true),
  (2, 'LEASING', 'Leasing habitacional', true),
  (3, 'SIN_FINANCIACION', 'Sin financiación', false),
  (4, 'PENDIENTE_VERIFICACION', 'Pendiente de verificación', false);

CREATE TABLE nucleo.condiciones_aseguramiento (
  id smallint PRIMARY KEY,
  codigo text NOT NULL UNIQUE,
  nombre text NOT NULL
);

INSERT INTO nucleo.condiciones_aseguramiento (id, codigo, nombre) VALUES
  (1, 'ASEGURADA', 'Asegurada'),
  (2, 'NO_ASEGURADA', 'No asegurada'),
  (3, 'PENDIENTE_VERIFICACION', 'Póliza pendiente de verificación');

CREATE TABLE nucleo.personas_afectadas (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  evento_id integer NOT NULL REFERENCES nucleo.eventos_sismicos (id),
  identificador_hmac char(64) NOT NULL CHECK (identificador_hmac ~ '^[0-9a-f]{64}$'),
  nombre_normalizado text NOT NULL CHECK (nombre_normalizado <> ''),
  edad_al_evento smallint NOT NULL CHECK (edad_al_evento BETWEEN 0 AND 120),
  sexo char(1) CHECK (sexo IN ('F', 'M')),
  municipio_codigo char(5) NOT NULL REFERENCES nucleo.municipios (codigo),
  condicion_institucional_id smallint NOT NULL REFERENCES nucleo.condiciones_institucionales (id),
  tenencia_id smallint REFERENCES nucleo.tipos_tenencia (id),
  situacion text NOT NULL CHECK (situacion IN ('DAMNIFICADA', 'AFECTADA')),
  condicion_salud text NOT NULL CHECK (condicion_salud IN ('ILESA', 'HERIDA', 'FALLECIDA', 'DESAPARECIDA')),
  alertas text[] NOT NULL DEFAULT '{}',
  estado text NOT NULL DEFAULT 'VIGENTE' CHECK (estado IN ('VIGENTE', 'EN_REVISION', 'FUSIONADO')),
  fusionado_con bigint REFERENCES nucleo.personas_afectadas (id),
  clave_bloque text NOT NULL,
  origen_dato text NOT NULL CHECK (origen_dato IN ('OFICIAL', 'ESTIMADO', 'SIMULADO')),
  ejecucion_id bigint NOT NULL REFERENCES nucleo.ejecuciones_etl (id),
  numero_fila integer NOT NULL CHECK (numero_fila > 0),
  capturado_en date NOT NULL,
  cargado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT personas_identificador_unico UNIQUE (evento_id, identificador_hmac),
  CONSTRAINT personas_fusion CHECK ((estado = 'FUSIONADO') = (fusionado_con IS NOT NULL))
);

CREATE INDEX personas_bloque ON nucleo.personas_afectadas (evento_id, clave_bloque);
CREATE INDEX personas_vigentes ON nucleo.personas_afectadas (evento_id, municipio_codigo) WHERE estado = 'VIGENTE';
CREATE INDEX personas_ejecucion ON nucleo.personas_afectadas (ejecucion_id, numero_fila);
CREATE INDEX personas_carga ON nucleo.personas_afectadas USING brin (cargado_en);

CREATE TABLE nucleo.personas_vulnerabilidades (
  persona_id bigint NOT NULL REFERENCES nucleo.personas_afectadas (id) ON DELETE CASCADE,
  tipo_vulnerabilidad_id smallint NOT NULL REFERENCES nucleo.tipos_vulnerabilidad (id),
  PRIMARY KEY (persona_id, tipo_vulnerabilidad_id),
  CONSTRAINT vulnerabilidad_declarada CHECK (tipo_vulnerabilidad_id NOT IN (4, 6))
);

CREATE INDEX personas_vulnerabilidades_tipo ON nucleo.personas_vulnerabilidades (tipo_vulnerabilidad_id);

CREATE TABLE nucleo.viviendas (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  evento_id integer NOT NULL REFERENCES nucleo.eventos_sismicos (id),
  predio_hmac char(64) NOT NULL CHECK (predio_hmac ~ '^[0-9a-f]{64}$'),
  direccion_normalizada text NOT NULL CHECK (direccion_normalizada <> ''),
  municipio_codigo char(5) NOT NULL REFERENCES nucleo.municipios (codigo),
  zona text NOT NULL CHECK (zona IN ('URBANA', 'RURAL')),
  estrato smallint CHECK (estrato BETWEEN 1 AND 6),
  condicion_ocupacion_id smallint REFERENCES nucleo.condiciones_ocupacion (id),
  avaluo_cop numeric(15, 0) CHECK (avaluo_cop >= 0),
  alertas text[] NOT NULL DEFAULT '{}',
  estado text NOT NULL DEFAULT 'VIGENTE' CHECK (estado IN ('VIGENTE', 'EN_REVISION', 'FUSIONADO')),
  fusionado_con bigint REFERENCES nucleo.viviendas (id),
  clave_bloque text NOT NULL,
  origen_dato text NOT NULL CHECK (origen_dato IN ('OFICIAL', 'ESTIMADO', 'SIMULADO')),
  ejecucion_id bigint NOT NULL REFERENCES nucleo.ejecuciones_etl (id),
  numero_fila integer NOT NULL CHECK (numero_fila > 0),
  capturado_en date NOT NULL,
  cargado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT viviendas_predio_unico UNIQUE (evento_id, predio_hmac),
  CONSTRAINT viviendas_fusion CHECK ((estado = 'FUSIONADO') = (fusionado_con IS NOT NULL))
);

CREATE INDEX viviendas_bloque ON nucleo.viviendas (evento_id, clave_bloque);
CREATE INDEX viviendas_vigentes ON nucleo.viviendas (evento_id, municipio_codigo) WHERE estado = 'VIGENTE';
CREATE INDEX viviendas_ejecucion ON nucleo.viviendas (ejecucion_id, numero_fila);
CREATE INDEX viviendas_carga ON nucleo.viviendas USING brin (cargado_en);

CREATE TABLE nucleo.afectaciones_vivienda (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  vivienda_id bigint NOT NULL REFERENCES nucleo.viviendas (id) ON DELETE CASCADE,
  estado_fisico_id smallint NOT NULL REFERENCES nucleo.estados_fisicos (id),
  fecha_evaluacion date,
  costo_estimado_cop numeric(15, 0) CHECK (costo_estimado_cop >= 0),
  es_vigente boolean NOT NULL DEFAULT true,
  registrada_en timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX afectaciones_vigentes ON nucleo.afectaciones_vivienda (vivienda_id) WHERE es_vigente;

CREATE TABLE nucleo.aseguramiento (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  vivienda_id bigint NOT NULL UNIQUE REFERENCES nucleo.viviendas (id) ON DELETE CASCADE,
  condicion_aseguramiento_id smallint NOT NULL REFERENCES nucleo.condiciones_aseguramiento (id),
  valor_asegurado_cop numeric(15, 0) CHECK (valor_asegurado_cop >= 0),
  verificado_en date
);

CREATE TABLE nucleo.financiacion_vivienda (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  vivienda_id bigint NOT NULL UNIQUE REFERENCES nucleo.viviendas (id) ON DELETE CASCADE,
  tipo_financiacion_id smallint NOT NULL REFERENCES nucleo.tipos_financiacion (id),
  saldo_cop numeric(15, 0) CHECK (saldo_cop >= 0),
  verificado_en date
);

CREATE TABLE nucleo.reclamaciones (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  aseguramiento_id bigint NOT NULL UNIQUE REFERENCES nucleo.aseguramiento (id) ON DELETE CASCADE,
  estado text NOT NULL CHECK (estado IN ('EN_ESTUDIO', 'APROBADA', 'RECHAZADA')),
  valor_reclamado_cop numeric(15, 0) CHECK (valor_reclamado_cop >= 0),
  valor_aprobado_cop numeric(15, 0) CHECK (valor_aprobado_cop >= 0),
  CONSTRAINT reclamaciones_aprobacion CHECK ((estado = 'APROBADA') = (valor_aprobado_cop IS NOT NULL))
);

CREATE TABLE nucleo.indemnizaciones (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  reclamacion_id bigint NOT NULL UNIQUE REFERENCES nucleo.reclamaciones (id) ON DELETE CASCADE,
  valor_cop numeric(15, 0) NOT NULL CHECK (valor_cop >= 0),
  estado text NOT NULL CHECK (estado IN ('PENDIENTE', 'PAGADA'))
);

CREATE UNLOGGED TABLE staging.personas (
  ejecucion_id bigint NOT NULL,
  lote integer NOT NULL,
  numero_fila integer NOT NULL,
  identificador_hmac char(64) NOT NULL,
  nombre_normalizado text NOT NULL,
  edad smallint NOT NULL,
  sexo char(1),
  municipio_codigo char(5) NOT NULL,
  condicion_institucional text NOT NULL,
  tenencia text,
  situacion text NOT NULL,
  condicion_salud text NOT NULL,
  vulnerabilidades smallint NOT NULL,
  alertas text[] NOT NULL,
  clave_bloque text NOT NULL,
  capturado_en date NOT NULL,
  PRIMARY KEY (ejecucion_id, numero_fila)
);

CREATE UNLOGGED TABLE staging.viviendas (
  ejecucion_id bigint NOT NULL,
  lote integer NOT NULL,
  numero_fila integer NOT NULL,
  predio_hmac char(64) NOT NULL,
  direccion_normalizada text NOT NULL,
  municipio_codigo char(5) NOT NULL,
  zona text NOT NULL,
  estrato smallint,
  ocupacion text,
  avaluo numeric(15, 0),
  estado_fisico text NOT NULL,
  fecha_evaluacion date,
  costo_estimado numeric(15, 0),
  financiacion text NOT NULL,
  saldo numeric(15, 0),
  aseguramiento text NOT NULL,
  valor_asegurado numeric(15, 0),
  reclamacion text,
  valor_reclamado numeric(15, 0),
  valor_aprobado numeric(15, 0),
  alertas text[] NOT NULL,
  clave_bloque text NOT NULL,
  capturado_en date NOT NULL,
  PRIMARY KEY (ejecucion_id, numero_fila)
);

CREATE TABLE staging.filas_rechazadas (
  ejecucion_id bigint NOT NULL REFERENCES nucleo.ejecuciones_etl (id) ON DELETE CASCADE,
  numero_fila integer NOT NULL CHECK (numero_fila > 0),
  errores jsonb NOT NULL CHECK (jsonb_typeof(errores) = 'array' AND jsonb_array_length(errores) > 0),
  fila_cruda jsonb NOT NULL,
  PRIMARY KEY (ejecucion_id, numero_fila)
);

CREATE TABLE staging.revision_duplicados (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ejecucion_id bigint NOT NULL REFERENCES nucleo.ejecuciones_etl (id) ON DELETE CASCADE,
  destino text NOT NULL CHECK (destino IN ('personas', 'viviendas')),
  persona_id bigint REFERENCES nucleo.personas_afectadas (id) ON DELETE CASCADE,
  persona_candidata_id bigint REFERENCES nucleo.personas_afectadas (id) ON DELETE CASCADE,
  vivienda_id bigint REFERENCES nucleo.viviendas (id) ON DELETE CASCADE,
  vivienda_candidata_id bigint REFERENCES nucleo.viviendas (id) ON DELETE CASCADE,
  similitud numeric(5, 4) NOT NULL CHECK (similitud BETWEEN 0 AND 1),
  motivo text NOT NULL CHECK (motivo IN ('CLAVE_NATURAL', 'SIMILITUD')),
  detalle jsonb NOT NULL,
  estado text NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE', 'FUSIONADO', 'DISTINTO', 'RESUELTO')),
  decidido_por integer REFERENCES seguridad.usuarios (id),
  decidido_en timestamptz,
  creado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT revision_registros CHECK (
    (destino = 'personas' AND persona_id IS NOT NULL AND persona_candidata_id IS NOT NULL
      AND vivienda_id IS NULL AND vivienda_candidata_id IS NULL)
    OR (destino = 'viviendas' AND vivienda_id IS NOT NULL AND vivienda_candidata_id IS NOT NULL
      AND persona_id IS NULL AND persona_candidata_id IS NULL)
  ),
  CONSTRAINT revision_decision CHECK ((estado = 'PENDIENTE') = (decidido_en IS NULL))
);

CREATE UNIQUE INDEX revision_par_personas ON staging.revision_duplicados (persona_id, persona_candidata_id)
  WHERE destino = 'personas';
CREATE UNIQUE INDEX revision_par_viviendas ON staging.revision_duplicados (vivienda_id, vivienda_candidata_id)
  WHERE destino = 'viviendas';
CREATE INDEX revision_pendientes ON staging.revision_duplicados (destino, id) WHERE estado = 'PENDIENTE';

GRANT USAGE ON SCHEMA staging TO andes_app;

GRANT SELECT ON
  nucleo.condiciones_institucionales,
  nucleo.tipos_tenencia,
  nucleo.tipos_vulnerabilidad,
  nucleo.estados_fisicos,
  nucleo.condiciones_ocupacion,
  nucleo.tipos_financiacion,
  nucleo.condiciones_aseguramiento,
  nucleo.personas_afectadas,
  nucleo.personas_vulnerabilidades,
  nucleo.viviendas,
  nucleo.afectaciones_vivienda,
  nucleo.aseguramiento,
  nucleo.financiacion_vivienda,
  nucleo.reclamaciones,
  nucleo.indemnizaciones,
  staging.filas_rechazadas,
  staging.revision_duplicados
TO andes_app;

GRANT UPDATE (estado, fusionado_con, actualizado_en) ON nucleo.personas_afectadas, nucleo.viviendas TO andes_app;
GRANT UPDATE (estado, decidido_por, decidido_en) ON staging.revision_duplicados TO andes_app;
GRANT INSERT (conjunto_id, usuario_id, origen_archivo, nombre_archivo, huella_archivo, estado, formato, tamano_bytes)
  ON nucleo.ejecuciones_etl TO andes_app;
