DROP TABLE staging.revision_duplicados;
DROP TABLE staging.filas_rechazadas;
DROP TABLE staging.viviendas;
DROP TABLE staging.personas;
DROP TABLE nucleo.indemnizaciones;
DROP TABLE nucleo.reclamaciones;
DROP TABLE nucleo.financiacion_vivienda;
DROP TABLE nucleo.aseguramiento;
DROP TABLE nucleo.afectaciones_vivienda;
DROP TABLE nucleo.viviendas;
DROP TABLE nucleo.personas_vulnerabilidades;
DROP TABLE nucleo.personas_afectadas;
DROP TABLE nucleo.condiciones_aseguramiento;
DROP TABLE nucleo.tipos_financiacion;
DROP TABLE nucleo.condiciones_ocupacion;
DROP TABLE nucleo.estados_fisicos;
DROP TABLE nucleo.tipos_vulnerabilidad;
DROP TABLE nucleo.tipos_tenencia;
DROP TABLE nucleo.condiciones_institucionales;

DROP INDEX nucleo.ejecuciones_en_cola;

DELETE FROM nucleo.ejecuciones_etl WHERE estado = 'EN_COLA';

ALTER TABLE nucleo.ejecuciones_etl
  DROP CONSTRAINT ejecuciones_finalizacion,
  DROP CONSTRAINT ejecuciones_etl_estado_check,
  DROP COLUMN formato,
  DROP COLUMN nombre_archivo,
  DROP COLUMN tamano_bytes,
  DROP COLUMN tamano_lote,
  DROP COLUMN encolada_en,
  DROP COLUMN filas_confirmadas,
  DROP COLUMN en_revision,
  DROP COLUMN duracion_ms,
  DROP COLUMN memoria_maxima_mb,
  DROP COLUMN agregados_aplicados;

ALTER TABLE nucleo.ejecuciones_etl
  ADD CONSTRAINT ejecuciones_etl_estado_check CHECK (estado IN ('EN_CURSO', 'TERMINADA', 'FALLIDA')),
  ADD CONSTRAINT ejecuciones_finalizacion CHECK ((estado = 'EN_CURSO') = (finalizada_en IS NULL));

ALTER TABLE nucleo.conjuntos_datos
  DROP COLUMN destino,
  DROP COLUMN version_esquema;

DROP SCHEMA staging;
