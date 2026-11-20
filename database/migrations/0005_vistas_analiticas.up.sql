CREATE VIEW analitica.fuentes AS
SELECT
  id, orden, entidad, sigla, nombre, origen, nivel, tipo_acceso, enlace, leido_en,
  fecha_publicacion, fecha_consulta, cobertura, variables, limitaciones, uso
FROM nucleo.fuentes_datos;

CREATE VIEW analitica.eventos AS
SELECT
  e.codigo,
  e.nombre,
  e.fecha,
  e.municipio_epicentro AS codigo_municipio,
  m.nombre AS municipio,
  d.nombre AS departamento,
  e.latitud,
  e.longitud,
  e.fuente_coordenadas
FROM nucleo.eventos_sismicos e
JOIN nucleo.municipios m ON m.codigo = e.municipio_epicentro
JOIN nucleo.departamentos d ON d.codigo = m.departamento_codigo;

CREATE VIEW analitica.parametros_evento AS
SELECT e.codigo AS evento, p.orden, p.posicion, p.parametro, p.fuente_id, p.valor
FROM nucleo.parametros_evento p
JOIN nucleo.eventos_sismicos e ON e.id = p.evento_id;

CREATE VIEW analitica.normas_evento AS
SELECT e.codigo AS evento, n.orden, n.nombre, n.contenido
FROM nucleo.normas_evento n
JOIN nucleo.eventos_sismicos e ON e.id = n.evento_id;

CREATE VIEW analitica.indicadores AS
SELECT codigo, orden, nombre, descripcion, unidad, es_acumulado, es_derivado, motivo_sin_dato
FROM nucleo.indicadores;

CREATE VIEW analitica.valores_indicador AS
SELECT
  e.codigo AS evento,
  v.indicador_codigo,
  v.fecha_corte,
  v.valor,
  v.calificador,
  v.nota,
  v.fuente_id,
  lag(v.valor) OVER serie AS valor_anterior,
  lag(v.fecha_corte) OVER serie AS corte_anterior
FROM nucleo.valores_indicador v
JOIN nucleo.eventos_sismicos e ON e.id = v.evento_id
WINDOW serie AS (PARTITION BY v.evento_id, v.indicador_codigo ORDER BY v.fecha_corte);

CREATE VIEW analitica.variables_territoriales AS
SELECT codigo, orden, nombre, unidad
FROM nucleo.variables_territoriales;

CREATE VIEW analitica.ejecuciones_vigentes AS
SELECT DISTINCT ON (conjunto_id)
  conjunto_id,
  id AS ejecucion_id,
  filas_leidas,
  finalizada_en
FROM nucleo.ejecuciones_etl
WHERE estado = 'TERMINADA'
ORDER BY conjunto_id, finalizada_en DESC, id DESC;

CREATE VIEW analitica.reportes_municipales AS
SELECT
  e.codigo AS evento,
  r.id AS reporte_id,
  v.conjunto_id,
  r.municipio_codigo,
  m.nombre AS municipio,
  m.departamento_codigo,
  d.nombre AS departamento,
  r.fecha_reporte,
  r.alertas
FROM nucleo.reportes_municipales r
JOIN analitica.ejecuciones_vigentes v ON v.ejecucion_id = r.ejecucion_id
JOIN nucleo.eventos_sismicos e ON e.id = r.evento_id
JOIN nucleo.municipios m ON m.codigo = r.municipio_codigo
JOIN nucleo.departamentos d ON d.codigo = m.departamento_codigo;

CREATE VIEW analitica.valores_municipales AS
SELECT r.evento, r.municipio_codigo, r.departamento_codigo, v.variable_codigo, v.valor
FROM analitica.reportes_municipales r
JOIN nucleo.valores_reporte_municipal v ON v.reporte_id = r.reporte_id;

CREATE VIEW analitica.afectacion_agregada AS
SELECT
  evento,
  CASE WHEN grouping(departamento_codigo) = 1 THEN 'NACIONAL' ELSE 'DEPARTAMENTO' END AS nivel,
  departamento_codigo,
  variable_codigo,
  sum(valor)::bigint AS valor,
  count(*)::integer AS municipios_con_valor
FROM analitica.valores_municipales
GROUP BY GROUPING SETS ((evento, departamento_codigo, variable_codigo), (evento, variable_codigo));

CREATE VIEW analitica.resumen_departamental AS
SELECT
  evento,
  departamento_codigo,
  departamento,
  count(*)::integer AS municipios_con_reporte,
  max(fecha_reporte) AS ultimo_reporte
FROM analitica.reportes_municipales
GROUP BY evento, departamento_codigo, departamento;

CREATE VIEW analitica.carga_territorial AS
SELECT
  r.evento,
  r.conjunto_id,
  c.fuente_id,
  f.fecha_consulta,
  v.filas_leidas,
  count(*)::integer AS municipios_con_reporte,
  count(DISTINCT r.departamento_codigo)::integer AS departamentos_con_reporte,
  min(r.fecha_reporte) AS desde,
  max(r.fecha_reporte) AS hasta
FROM analitica.reportes_municipales r
JOIN analitica.ejecuciones_vigentes v ON v.conjunto_id = r.conjunto_id
JOIN nucleo.conjuntos_datos c ON c.id = r.conjunto_id
JOIN nucleo.fuentes_datos f ON f.id = c.fuente_id
GROUP BY r.evento, r.conjunto_id, c.fuente_id, f.fecha_consulta, v.filas_leidas;

CREATE VIEW analitica.alertas_territoriales AS
SELECT r.evento, alerta, count(*)::integer AS municipios
FROM analitica.reportes_municipales r
CROSS JOIN LATERAL unnest(r.alertas) AS alerta
GROUP BY r.evento, alerta;

CREATE VIEW analitica.reclamaciones_departamento AS
SELECT
  e.codigo AS evento,
  r.departamento_codigo,
  d.nombre AS departamento,
  r.fecha_corte,
  r.fuente_id,
  r.siniestros,
  r.pagos,
  r.valor_estimado
FROM nucleo.reclamaciones_departamento r
JOIN nucleo.eventos_sismicos e ON e.id = r.evento_id
JOIN nucleo.departamentos d ON d.codigo = r.departamento_codigo;

CREATE VIEW analitica.reclamaciones_ramo AS
SELECT e.codigo AS evento, r.orden, r.ramo, r.fecha_corte, r.fuente_id, r.reclamaciones, r.reserva
FROM nucleo.reclamaciones_ramo r
JOIN nucleo.eventos_sismicos e ON e.id = r.evento_id;

CREATE VIEW analitica.partidas_economicas AS
SELECT e.codigo AS evento, p.tipo, p.orden, p.concepto, p.valor, p.calificador, p.fecha_corte, p.fuente_id
FROM nucleo.partidas_economicas p
JOIN nucleo.eventos_sismicos e ON e.id = p.evento_id;

CREATE VIEW analitica.mediciones_contratacion AS
SELECT
  e.codigo AS evento,
  m.orden,
  m.concepto,
  m.contratos,
  m.valor,
  m.contratacion_directa,
  m.periodo,
  m.fuente_id
FROM nucleo.mediciones_contratacion m
JOIN nucleo.eventos_sismicos e ON e.id = m.evento_id;

GRANT SELECT ON ALL TABLES IN SCHEMA analitica TO andes_lector, andes_app;
