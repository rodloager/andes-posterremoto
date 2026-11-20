CREATE SCHEMA bi;

CREATE VIEW bi.dim_evento AS
SELECT codigo AS codigo_evento, nombre AS evento, fecha AS fecha_evento
FROM nucleo.eventos_sismicos;

CREATE VIEW bi.dim_tiempo AS
WITH calendario AS (
  SELECT dia::date AS fecha, (SELECT min(fecha) FROM nucleo.eventos_sismicos) AS primer_evento
  FROM generate_series(
    (SELECT min(fecha) FROM nucleo.eventos_sismicos),
    current_date,
    interval '1 day'
  ) AS dia
)
SELECT
  fecha,
  extract(year FROM fecha)::integer AS anio,
  extract(month FROM fecha)::integer AS mes,
  (ARRAY['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre',
         'noviembre', 'diciembre'])[extract(month FROM fecha)::integer] AS nombre_mes,
  extract(day FROM fecha)::integer AS dia_del_mes,
  extract(isodow FROM fecha)::integer AS dia_de_la_semana,
  date_trunc('week', fecha)::date AS inicio_semana,
  fecha - primer_evento AS dias_desde_sismo,
  (fecha - primer_evento) / 7 + 1 AS semana_desde_sismo
FROM calendario;

CREATE VIEW bi.dim_departamento AS
SELECT codigo AS codigo_departamento, nombre AS departamento
FROM nucleo.departamentos;

CREATE VIEW bi.dim_geografia AS
SELECT
  m.codigo AS codigo_municipio,
  m.nombre AS municipio,
  m.departamento_codigo AS codigo_departamento,
  d.nombre AS departamento,
  CASE
    WHEN EXISTS (SELECT 1 FROM analitica.reportes_municipales r WHERE r.municipio_codigo = m.codigo) THEN 'Sí'
    ELSE 'No'
  END AS con_reporte_oficial
FROM nucleo.municipios m
JOIN nucleo.departamentos d ON d.codigo = m.departamento_codigo;

CREATE VIEW bi.dim_fuente AS
SELECT
  id AS fuente_id,
  entidad,
  sigla,
  nombre,
  origen AS origen_dato,
  nivel AS nivel_confiabilidad,
  fecha_publicacion,
  fecha_consulta,
  enlace
FROM nucleo.fuentes_datos;

CREATE VIEW bi.dim_poblacion AS
SELECT
  concat_ws('|', e.codigo, s.codigo, c.codigo, t.codigo, si.codigo, sa.codigo, v.codigo) AS perfil_clave,
  e.codigo AS grupo_edad,
  e.nombre AS grupo_edad_nombre,
  e.orden AS grupo_edad_orden,
  s.codigo AS sexo,
  s.nombre AS sexo_nombre,
  c.codigo AS condicion,
  c.nombre AS condicion_nombre,
  coalesce(padre.codigo, c.codigo) AS grupo_condicion,
  coalesce(padre.nombre, c.nombre) AS grupo_condicion_nombre,
  t.codigo AS tenencia,
  t.nombre AS tenencia_nombre,
  si.codigo AS situacion,
  si.nombre AS situacion_nombre,
  sa.codigo AS condicion_salud,
  sa.nombre AS condicion_salud_nombre,
  v.codigo AS con_vulnerabilidad,
  v.nombre AS con_vulnerabilidad_nombre
FROM (VALUES
  ('DE_0_A_9', '0 a 9 años', 1),
  ('DE_10_A_17', '10 a 17 años', 2),
  ('DE_18_A_59', '18 a 59 años', 3),
  ('DE_60_O_MAS', '60 años o más', 4)
) AS e (codigo, nombre, orden)
CROSS JOIN (VALUES ('F', 'Mujer'), ('M', 'Hombre'), ('SIN_DATO', 'Sin dato')) AS s (codigo, nombre)
CROSS JOIN nucleo.condiciones_institucionales c
LEFT JOIN nucleo.condiciones_institucionales padre ON padre.id = c.padre_id
CROSS JOIN (
  SELECT codigo, nombre FROM nucleo.tipos_tenencia
  UNION ALL
  SELECT 'SIN_DATO', 'Sin dato'
) AS t
CROSS JOIN (VALUES ('DAMNIFICADA', 'Damnificada'), ('AFECTADA', 'Afectada')) AS si (codigo, nombre)
CROSS JOIN (VALUES
  ('ILESA', 'Ilesa'),
  ('HERIDA', 'Herida'),
  ('FALLECIDA', 'Fallecida'),
  ('DESAPARECIDA', 'Desaparecida')
) AS sa (codigo, nombre)
CROSS JOIN (VALUES ('SI', 'Con alguna vulnerabilidad'), ('NO', 'Sin vulnerabilidades')) AS v (codigo, nombre)
WHERE c.asignable;

CREATE VIEW bi.dim_vulnerabilidad AS
SELECT
  codigo AS vulnerabilidad,
  nombre AS vulnerabilidad_nombre,
  CASE WHEN es_derivada THEN 'Sí' ELSE 'No' END AS derivada_de_la_edad
FROM nucleo.tipos_vulnerabilidad;

CREATE VIEW bi.dim_vivienda AS
SELECT
  concat_ws('|', ef.codigo, o.codigo, tf.codigo, z.codigo, es.codigo) AS vivienda_clave,
  ef.codigo AS estado_fisico,
  ef.nombre AS estado_fisico_nombre,
  ef.orden AS estado_fisico_orden,
  CASE WHEN ef.afectada THEN 'Sí' ELSE 'No' END AS afectada,
  o.codigo AS ocupacion,
  o.nombre AS ocupacion_nombre,
  tf.codigo AS financiacion,
  tf.nombre AS financiacion_nombre,
  CASE WHEN tf.exige_seguro THEN 'Sí' ELSE 'No' END AS financiacion_exige_seguro,
  z.codigo AS zona,
  z.nombre AS zona_nombre,
  es.codigo AS estrato,
  es.nombre AS estrato_nombre
FROM nucleo.estados_fisicos ef
CROSS JOIN (
  SELECT codigo, nombre FROM nucleo.condiciones_ocupacion
  UNION ALL
  SELECT 'SIN_DATO', 'Sin dato'
) AS o
CROSS JOIN nucleo.tipos_financiacion tf
CROSS JOIN (VALUES ('URBANA', 'Urbana'), ('RURAL', 'Rural')) AS z (codigo, nombre)
CROSS JOIN (VALUES
  ('1', 'Estrato 1'),
  ('2', 'Estrato 2'),
  ('3', 'Estrato 3'),
  ('4', 'Estrato 4'),
  ('5', 'Estrato 5'),
  ('6', 'Estrato 6'),
  ('SIN_DATO', 'Sin dato')
) AS es (codigo, nombre);

CREATE VIEW bi.dim_aseguramiento AS
SELECT
  concat_ws('|', ca.codigo, r.codigo) AS aseguramiento_clave,
  ca.codigo AS condicion,
  ca.nombre AS condicion_nombre,
  r.codigo AS reclamacion,
  r.nombre AS reclamacion_nombre,
  r.orden AS reclamacion_orden
FROM nucleo.condiciones_aseguramiento ca
CROSS JOIN (VALUES
  ('NO_APLICA', 'No aplica', 0),
  ('NINGUNA', 'Sin reclamación', 1),
  ('EN_ESTUDIO', 'En estudio', 2),
  ('RECHAZADA', 'Rechazada', 3),
  ('APROBADA', 'Aprobada', 4),
  ('PAGADA', 'Pagada', 5)
) AS r (codigo, nombre, orden)
WHERE (ca.codigo = 'ASEGURADA') = (r.codigo <> 'NO_APLICA');

CREATE VIEW bi.dim_infraestructura AS
SELECT
  vt.codigo AS tipo_infraestructura,
  vt.nombre AS tipo_infraestructura_nombre,
  vt.unidad,
  x.categoria,
  x.critica
FROM analitica.variables_territoriales vt
JOIN (VALUES
  ('edificiosAveriados', 'Edificaciones', 'No'),
  ('edificiosColapsados', 'Edificaciones', 'No'),
  ('centrosSalud', 'Salud', 'Sí'),
  ('centrosEducativos', 'Educación', 'Sí'),
  ('centrosComunitarios', 'Comunitaria', 'No'),
  ('vias', 'Transporte', 'No'),
  ('aeropuertos', 'Transporte', 'No'),
  ('puentesVehiculares', 'Transporte', 'No'),
  ('puentesPeatonales', 'Transporte', 'No'),
  ('acueductos', 'Servicios públicos', 'Sí')
) AS x (codigo, categoria, critica) ON x.codigo = vt.codigo;

CREATE VIEW bi.dim_economia AS
SELECT
  concat_ws('|', e.codigo, p.tipo, p.orden) AS concepto_clave,
  p.tipo,
  CASE p.tipo WHEN 'COSTO' THEN 'Costo' WHEN 'RECURSO' THEN 'Recurso' ELSE 'Destino del fondo' END AS tipo_nombre,
  p.orden,
  p.concepto
FROM nucleo.partidas_economicas p
JOIN nucleo.eventos_sismicos e ON e.id = p.evento_id;

CREATE VIEW bi.dim_indicador AS
SELECT
  codigo AS indicador,
  nombre AS indicador_nombre,
  descripcion,
  unidad,
  CASE WHEN es_acumulado THEN 'Sí' ELSE 'No' END AS es_acumulado,
  CASE WHEN es_derivado THEN 'Sí' ELSE 'No' END AS es_derivado,
  orden
FROM nucleo.indicadores;

CREATE VIEW bi.hecho_personas_afectadas AS
SELECT
  p.evento AS codigo_evento,
  p.semana::date AS fecha,
  p.municipio_codigo AS codigo_municipio,
  concat_ws(
    '|',
    p.grupo_edad,
    coalesce(p.sexo, 'SIN_DATO'),
    p.condicion,
    p.tenencia,
    p.situacion,
    p.condicion_salud,
    CASE
      WHEN p.edad < 18 OR p.edad >= 60
        OR EXISTS (SELECT 1 FROM nucleo.personas_vulnerabilidades pv WHERE pv.persona_id = p.id) THEN 'SI'
      ELSE 'NO'
    END
  ) AS perfil_clave,
  c.fuente_id,
  p.origen AS origen_dato,
  count(*) AS personas
FROM analitica.personas_vigentes p
JOIN nucleo.personas_afectadas registro ON registro.id = p.id
JOIN nucleo.ejecuciones_etl x ON x.id = registro.ejecucion_id
JOIN nucleo.conjuntos_datos c ON c.id = x.conjunto_id
GROUP BY 1, 2, 3, 4, 5, 6;

CREATE VIEW bi.hecho_vulnerabilidad AS
SELECT
  p.evento AS codigo_evento,
  p.semana::date AS fecha,
  p.municipio_codigo AS codigo_municipio,
  condicion.vulnerabilidad,
  c.fuente_id,
  p.origen AS origen_dato,
  count(*) AS personas
FROM analitica.personas_vigentes p
JOIN nucleo.personas_afectadas registro ON registro.id = p.id
JOIN nucleo.ejecuciones_etl x ON x.id = registro.ejecucion_id
JOIN nucleo.conjuntos_datos c ON c.id = x.conjunto_id
CROSS JOIN LATERAL (
  SELECT t.codigo AS vulnerabilidad
  FROM nucleo.personas_vulnerabilidades pv
  JOIN nucleo.tipos_vulnerabilidad t ON t.id = pv.tipo_vulnerabilidad_id
  WHERE pv.persona_id = p.id
  UNION ALL
  SELECT 'ADULTO_MAYOR' WHERE p.edad >= 60
  UNION ALL
  SELECT 'POBLACION_INFANTIL' WHERE p.edad < 18
) AS condicion
GROUP BY 1, 2, 3, 4, 5, 6;

CREATE VIEW bi.hecho_viviendas_afectadas AS
SELECT
  vv.evento AS codigo_evento,
  vv.semana::date AS fecha,
  vv.municipio_codigo AS codigo_municipio,
  concat_ws(
    '|',
    vv.estado_fisico,
    coalesce(co.codigo, 'SIN_DATO'),
    vv.financiacion,
    v.zona,
    coalesce(v.estrato::text, 'SIN_DATO')
  ) AS vivienda_clave,
  concat_ws('|', vv.aseguramiento, vv.reclamacion) AS aseguramiento_clave,
  c.fuente_id,
  vv.origen AS origen_dato,
  count(*) AS viviendas,
  sum(v.avaluo_cop) AS avaluo_cop,
  sum(a.costo_estimado_cop) AS valor_dano_cop,
  sum(s.valor_asegurado_cop) AS valor_asegurado_cop,
  sum(r.valor_reclamado_cop) AS valor_reclamado_cop,
  sum(r.valor_aprobado_cop) AS valor_aprobado_cop,
  sum(i.valor_cop) FILTER (WHERE i.estado = 'PAGADA') AS valor_pagado_cop
FROM analitica.viviendas_vigentes vv
JOIN nucleo.viviendas v ON v.id = vv.id
LEFT JOIN nucleo.condiciones_ocupacion co ON co.id = v.condicion_ocupacion_id
JOIN nucleo.afectaciones_vivienda a ON a.vivienda_id = v.id AND a.es_vigente
JOIN nucleo.aseguramiento s ON s.vivienda_id = v.id
LEFT JOIN nucleo.reclamaciones r ON r.aseguramiento_id = s.id
LEFT JOIN nucleo.indemnizaciones i ON i.reclamacion_id = r.id
JOIN nucleo.ejecuciones_etl x ON x.id = v.ejecucion_id
JOIN nucleo.conjuntos_datos c ON c.id = x.conjunto_id
GROUP BY 1, 2, 3, 4, 5, 6, 7;

CREATE VIEW bi.hecho_afectacion_municipal AS
SELECT
  r.evento AS codigo_evento,
  r.fecha_reporte AS fecha,
  r.municipio_codigo AS codigo_municipio,
  c.fuente_id,
  f.origen AS origen_dato,
  max(v.valor) FILTER (WHERE v.variable_codigo = 'familias') AS familias,
  max(v.valor) FILTER (WHERE v.variable_codigo = 'personas') AS personas,
  max(v.valor) FILTER (WHERE v.variable_codigo = 'fallecidos') AS fallecidos,
  max(v.valor) FILTER (WHERE v.variable_codigo = 'heridos') AS heridos,
  max(v.valor) FILTER (WHERE v.variable_codigo = 'desaparecidos') AS desaparecidos,
  max(v.valor) FILTER (WHERE v.variable_codigo = 'rescatados') AS rescatados,
  max(v.valor) FILTER (WHERE v.variable_codigo = 'viviendasAveriadas') AS viviendas_averiadas,
  max(v.valor) FILTER (WHERE v.variable_codigo = 'viviendasDestruidas') AS viviendas_destruidas
FROM analitica.reportes_municipales r
JOIN nucleo.conjuntos_datos c ON c.id = r.conjunto_id
JOIN nucleo.fuentes_datos f ON f.id = c.fuente_id
LEFT JOIN analitica.valores_municipales v ON v.evento = r.evento AND v.municipio_codigo = r.municipio_codigo
GROUP BY 1, 2, 3, 4, 5;

CREATE VIEW bi.hecho_infraestructura AS
SELECT
  r.evento AS codigo_evento,
  r.fecha_reporte AS fecha,
  r.municipio_codigo AS codigo_municipio,
  v.variable_codigo AS tipo_infraestructura,
  c.fuente_id,
  f.origen AS origen_dato,
  v.valor AS estructuras_afectadas
FROM analitica.reportes_municipales r
JOIN nucleo.conjuntos_datos c ON c.id = r.conjunto_id
JOIN nucleo.fuentes_datos f ON f.id = c.fuente_id
JOIN analitica.valores_municipales v ON v.evento = r.evento AND v.municipio_codigo = r.municipio_codigo
JOIN bi.dim_infraestructura d ON d.tipo_infraestructura = v.variable_codigo;

CREATE VIEW bi.hecho_danos_economicos AS
SELECT
  e.codigo AS codigo_evento,
  p.fecha_corte AS fecha,
  concat_ws('|', e.codigo, p.tipo, p.orden) AS concepto_clave,
  p.fuente_id,
  f.origen AS origen_dato,
  p.valor AS valor_cop,
  p.calificador
FROM nucleo.partidas_economicas p
JOIN nucleo.eventos_sismicos e ON e.id = p.evento_id
JOIN nucleo.fuentes_datos f ON f.id = p.fuente_id;

CREATE VIEW bi.hecho_reclamaciones_seguros AS
SELECT
  e.codigo AS codigo_evento,
  rd.fecha_corte AS fecha,
  rd.departamento_codigo AS codigo_departamento,
  rd.fuente_id,
  f.origen AS origen_dato,
  rd.siniestros,
  rd.pagos AS pagos_cop,
  rd.valor_estimado AS valor_estimado_cop
FROM nucleo.reclamaciones_departamento rd
JOIN nucleo.eventos_sismicos e ON e.id = rd.evento_id
JOIN nucleo.fuentes_datos f ON f.id = rd.fuente_id;

CREATE VIEW bi.hecho_reclamaciones_ramo AS
SELECT
  e.codigo AS codigo_evento,
  rr.fecha_corte AS fecha,
  rr.ramo,
  rr.orden AS ramo_orden,
  rr.fuente_id,
  f.origen AS origen_dato,
  rr.reclamaciones,
  rr.reserva AS reserva_cop
FROM nucleo.reclamaciones_ramo rr
JOIN nucleo.eventos_sismicos e ON e.id = rr.evento_id
JOIN nucleo.fuentes_datos f ON f.id = rr.fuente_id;

CREATE VIEW bi.hecho_indicadores AS
SELECT
  v.evento AS codigo_evento,
  v.fecha_corte AS fecha,
  v.indicador_codigo AS indicador,
  v.fuente_id,
  f.origen AS origen_dato,
  v.valor,
  v.calificador,
  dense_rank() OVER (PARTITION BY v.evento, v.indicador_codigo ORDER BY v.fecha_corte) AS numero_corte
FROM analitica.valores_indicador v
JOIN nucleo.fuentes_datos f ON f.id = v.fuente_id;

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'powerbi_lector') THEN
    CREATE ROLE powerbi_lector NOLOGIN;
  END IF;
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO powerbi_lector', current_database());
END
$$;

GRANT USAGE ON SCHEMA bi TO powerbi_lector;
GRANT SELECT ON ALL TABLES IN SCHEMA bi TO powerbi_lector;
ALTER DEFAULT PRIVILEGES IN SCHEMA bi GRANT SELECT ON TABLES TO powerbi_lector;
