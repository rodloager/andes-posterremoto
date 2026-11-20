CREATE TABLE analitica.agregados (
  evento_id integer NOT NULL REFERENCES nucleo.eventos_sismicos (id) ON DELETE CASCADE,
  origen text NOT NULL CHECK (origen IN ('OFICIAL', 'ESTIMADO', 'SIMULADO')),
  destino text NOT NULL CHECK (destino IN ('personas', 'viviendas')),
  nivel text NOT NULL CHECK (nivel IN ('MUNICIPIO', 'DEPARTAMENTO', 'NACIONAL')),
  territorio text NOT NULL CHECK (territorio ~ '^[0-9]{2}([0-9]{3})?$'),
  dimension text NOT NULL,
  categoria text NOT NULL,
  cantidad bigint NOT NULL CHECK (cantidad >= 0),
  suma numeric NOT NULL,
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (evento_id, origen, destino, nivel, territorio, dimension, categoria)
);

CREATE INDEX agregados_dimension ON analitica.agregados (evento_id, destino, dimension, nivel);

CREATE VIEW analitica.municipios AS
SELECT m.codigo, m.nombre, m.departamento_codigo, d.nombre AS departamento
FROM nucleo.municipios m
JOIN nucleo.departamentos d ON d.codigo = m.departamento_codigo;

CREATE VIEW analitica.personas_vigentes AS
SELECT
  p.id,
  e.codigo AS evento,
  p.evento_id,
  p.origen_dato AS origen,
  p.municipio_codigo,
  m.departamento_codigo,
  p.edad_al_evento AS edad,
  p.sexo,
  CASE
    WHEN p.edad_al_evento < 10 THEN 'DE_0_A_9'
    WHEN p.edad_al_evento < 18 THEN 'DE_10_A_17'
    WHEN p.edad_al_evento < 60 THEN 'DE_18_A_59'
    ELSE 'DE_60_O_MAS'
  END AS grupo_edad,
  ci.codigo AS condicion,
  coalesce(padre.codigo, ci.codigo) AS grupo_condicion,
  coalesce(tt.codigo, 'SIN_DATO') AS tenencia,
  p.situacion,
  p.condicion_salud,
  to_char(date_trunc('week', p.capturado_en), 'YYYY-MM-DD') AS semana
FROM nucleo.personas_afectadas p
JOIN nucleo.eventos_sismicos e ON e.id = p.evento_id
JOIN nucleo.municipios m ON m.codigo = p.municipio_codigo
JOIN nucleo.condiciones_institucionales ci ON ci.id = p.condicion_institucional_id
LEFT JOIN nucleo.condiciones_institucionales padre ON padre.id = ci.padre_id
LEFT JOIN nucleo.tipos_tenencia tt ON tt.id = p.tenencia_id
WHERE p.estado = 'VIGENTE';

CREATE VIEW analitica.poblacion_por_grupo_de_edad AS
SELECT
  evento,
  origen,
  CASE
    WHEN grouping(municipio_codigo) = 0 THEN 'MUNICIPIO'
    WHEN grouping(departamento_codigo) = 0 THEN 'DEPARTAMENTO'
    ELSE 'NACIONAL'
  END AS nivel,
  coalesce(municipio_codigo, departamento_codigo, '00') AS territorio,
  grupo_edad,
  count(*) AS cantidad,
  sum(edad) AS suma_edad,
  round(avg(edad), 2) AS edad_promedio
FROM analitica.personas_vigentes
GROUP BY GROUPING SETS (
  (evento, origen, departamento_codigo, municipio_codigo, grupo_edad),
  (evento, origen, departamento_codigo, grupo_edad),
  (evento, origen, grupo_edad)
);

CREATE VIEW analitica.poblacion_por_condicion AS
SELECT evento, origen, 'CONDICION' AS nivel_jerarquia, condicion AS categoria, count(*) AS cantidad
FROM analitica.personas_vigentes
GROUP BY evento, origen, condicion
UNION ALL
SELECT evento, origen, 'GRUPO', grupo_condicion, count(*)
FROM analitica.personas_vigentes
GROUP BY evento, origen, grupo_condicion;

CREATE VIEW analitica.poblacion_vulnerable AS
SELECT p.evento, p.origen, t.codigo AS vulnerabilidad, count(*) AS cantidad
FROM analitica.personas_vigentes p
JOIN nucleo.personas_vulnerabilidades pv ON pv.persona_id = p.id
JOIN nucleo.tipos_vulnerabilidad t ON t.id = pv.tipo_vulnerabilidad_id
GROUP BY p.evento, p.origen, t.codigo
UNION ALL
SELECT evento, origen, 'ADULTO_MAYOR', count(*) FILTER (WHERE edad >= 60)
FROM analitica.personas_vigentes
GROUP BY evento, origen
UNION ALL
SELECT evento, origen, 'POBLACION_INFANTIL', count(*) FILTER (WHERE edad < 18)
FROM analitica.personas_vigentes
GROUP BY evento, origen;

CREATE VIEW analitica.viviendas_vigentes AS
SELECT
  v.id,
  e.codigo AS evento,
  v.evento_id,
  v.origen_dato AS origen,
  v.municipio_codigo,
  m.departamento_codigo,
  v.avaluo_cop,
  ef.codigo AS estado_fisico,
  ca.codigo AS aseguramiento,
  tf.codigo AS financiacion,
  CASE
    WHEN ca.codigo <> 'ASEGURADA' THEN 'NO_APLICA'
    WHEN r.id IS NULL THEN 'NINGUNA'
    WHEN i.estado = 'PAGADA' THEN 'PAGADA'
    ELSE r.estado
  END AS reclamacion,
  to_char(date_trunc('week', v.capturado_en), 'YYYY-MM-DD') AS semana
FROM nucleo.viviendas v
JOIN nucleo.eventos_sismicos e ON e.id = v.evento_id
JOIN nucleo.municipios m ON m.codigo = v.municipio_codigo
JOIN nucleo.afectaciones_vivienda a ON a.vivienda_id = v.id AND a.es_vigente
JOIN nucleo.estados_fisicos ef ON ef.id = a.estado_fisico_id
JOIN nucleo.aseguramiento s ON s.vivienda_id = v.id
JOIN nucleo.condiciones_aseguramiento ca ON ca.id = s.condicion_aseguramiento_id
JOIN nucleo.financiacion_vivienda f ON f.vivienda_id = v.id
JOIN nucleo.tipos_financiacion tf ON tf.id = f.tipo_financiacion_id
LEFT JOIN nucleo.reclamaciones r ON r.aseguramiento_id = s.id
LEFT JOIN nucleo.indemnizaciones i ON i.reclamacion_id = r.id
WHERE v.estado = 'VIGENTE';

CREATE VIEW analitica.viviendas_por_aseguramiento AS
SELECT
  evento,
  origen,
  coalesce(estado_fisico, 'TODOS') AS estado_fisico,
  coalesce(aseguramiento, 'TODOS') AS aseguramiento,
  coalesce(financiacion, 'TODOS') AS financiacion,
  count(*) AS cantidad,
  sum(avaluo_cop) AS suma_avaluo
FROM analitica.viviendas_vigentes
GROUP BY evento, origen, CUBE (estado_fisico, aseguramiento, financiacion);

CREATE VIEW analitica.registros_semanales AS
SELECT evento, origen, 'personas' AS destino, semana, count(*) AS cantidad
FROM analitica.personas_vigentes
GROUP BY evento, origen, semana
UNION ALL
SELECT evento, origen, 'viviendas', semana, count(*)
FROM analitica.viviendas_vigentes
GROUP BY evento, origen, semana;

GRANT SELECT, INSERT, UPDATE ON analitica.agregados TO andes_app;
GRANT SELECT ON
  analitica.personas_vigentes,
  analitica.poblacion_por_grupo_de_edad,
  analitica.poblacion_por_condicion,
  analitica.poblacion_vulnerable,
  analitica.viviendas_vigentes,
  analitica.viviendas_por_aseguramiento,
  analitica.registros_semanales
TO andes_app;
GRANT SELECT ON analitica.municipios TO andes_app, andes_lector;
