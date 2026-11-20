CREATE VIEW analitica.agregados_publicables AS
SELECT
  e.codigo AS evento,
  a.origen,
  a.destino,
  a.nivel,
  a.territorio,
  a.dimension,
  a.categoria,
  CASE WHEN a.cantidad < 10 THEN NULL ELSE a.cantidad END AS cantidad,
  CASE WHEN a.cantidad < 10 THEN NULL ELSE a.suma END AS suma,
  a.cantidad < 10 AS suprimida,
  a.actualizado_en
FROM analitica.agregados a
JOIN nucleo.eventos_sismicos e ON e.id = a.evento_id
WHERE a.nivel IN ('NACIONAL', 'DEPARTAMENTO');

GRANT SELECT ON analitica.agregados_publicables TO andes_lector, andes_app;

CREATE VIEW analitica.cruces_publicables AS
WITH celdas AS (
  SELECT
    e.codigo AS evento,
    a.origen,
    a.nivel,
    a.territorio,
    string_to_array(a.categoria, '|') AS categorias,
    a.cantidad,
    a.suma,
    a.actualizado_en
  FROM analitica.agregados a
  JOIN nucleo.eventos_sismicos e ON e.id = a.evento_id
  WHERE a.destino = 'viviendas' AND a.dimension = 'cubo' AND a.nivel IN ('NACIONAL', 'DEPARTAMENTO')
),
dimensiones AS (
  SELECT posicion, nombre
  FROM unnest(ARRAY['estado_fisico', 'aseguramiento', 'financiacion', 'reclamacion']) WITH ORDINALITY AS d(nombre, posicion)
),
cruces AS (
  SELECT
    c.evento,
    c.origen,
    c.nivel,
    c.territorio,
    fila.nombre AS dimension_fila,
    c.categorias[fila.posicion] AS categoria_fila,
    columna.nombre AS dimension_columna,
    c.categorias[columna.posicion] AS categoria_columna,
    sum(c.cantidad) AS cantidad,
    sum(c.suma) AS suma,
    max(c.actualizado_en) AS actualizado_en
  FROM celdas c
  JOIN dimensiones fila ON true
  JOIN dimensiones columna ON columna.posicion > fila.posicion
  GROUP BY 1, 2, 3, 4, 5, 6, 7, 8
  UNION ALL
  SELECT
    e.codigo,
    a.origen,
    a.nivel,
    a.territorio,
    'estado_fisico',
    split_part(a.categoria, '|', 1),
    'ocupacion',
    split_part(a.categoria, '|', 2),
    a.cantidad,
    a.suma,
    a.actualizado_en
  FROM analitica.agregados a
  JOIN nucleo.eventos_sismicos e ON e.id = a.evento_id
  WHERE a.destino = 'viviendas' AND a.dimension = 'estado_ocupacion' AND a.nivel IN ('NACIONAL', 'DEPARTAMENTO')
)
SELECT
  evento,
  origen,
  nivel,
  territorio,
  dimension_fila,
  categoria_fila,
  dimension_columna,
  categoria_columna,
  CASE WHEN cantidad < 10 THEN NULL ELSE cantidad END AS cantidad,
  CASE WHEN cantidad < 10 THEN NULL ELSE suma END AS suma,
  cantidad < 10 AS suprimida,
  actualizado_en
FROM cruces;

GRANT SELECT ON analitica.cruces_publicables TO andes_lector, andes_app;

CREATE VIEW analitica.categorias_de_registros AS
WITH fijas (destino, dimension, categoria, nombre, clave) AS (
  VALUES
    ('personas', 'grupo_edad', 'DE_0_A_9', '0 a 9 años', 1),
    ('personas', 'grupo_edad', 'DE_10_A_17', '10 a 17 años', 2),
    ('personas', 'grupo_edad', 'DE_18_A_59', '18 a 59 años', 3),
    ('personas', 'grupo_edad', 'DE_60_O_MAS', '60 años o más', 4),
    ('personas', 'sexo', 'F', 'Mujer', 1),
    ('personas', 'sexo', 'M', 'Hombre', 2),
    ('personas', 'sexo', 'SIN_DATO', 'Sin dato', 3),
    ('personas', 'situacion', 'AFECTADA', 'Afectada', 1),
    ('personas', 'situacion', 'DAMNIFICADA', 'Damnificada', 2),
    ('personas', 'condicion_salud', 'ILESA', 'Ilesa', 1),
    ('personas', 'condicion_salud', 'HERIDA', 'Herida', 2),
    ('personas', 'condicion_salud', 'FALLECIDA', 'Fallecida', 3),
    ('personas', 'condicion_salud', 'DESAPARECIDA', 'Desaparecida', 4),
    ('personas', 'vulnerable', 'SI', 'Con alguna vulnerabilidad', 1),
    ('personas', 'vulnerable', 'NO', 'Sin vulnerabilidades', 2),
    ('personas', 'tenencia', 'SIN_DATO', 'Sin dato', 999999),
    ('viviendas', 'ocupacion', 'SIN_DATO', 'Sin dato', 999999),
    ('viviendas', 'reclamacion', 'NO_APLICA', 'No aplica', 0),
    ('viviendas', 'reclamacion', 'NINGUNA', 'Sin reclamación', 1),
    ('viviendas', 'reclamacion', 'EN_ESTUDIO', 'En estudio', 2),
    ('viviendas', 'reclamacion', 'RECHAZADA', 'Rechazada', 3),
    ('viviendas', 'reclamacion', 'APROBADA', 'Aprobada', 4),
    ('viviendas', 'reclamacion', 'PAGADA', 'Pagada', 5),
    ('viviendas', 'zona', 'URBANA', 'Urbana', 1),
    ('viviendas', 'zona', 'RURAL', 'Rural', 2),
    ('viviendas', 'estrato', '1', 'Estrato 1', 1),
    ('viviendas', 'estrato', '2', 'Estrato 2', 2),
    ('viviendas', 'estrato', '3', 'Estrato 3', 3),
    ('viviendas', 'estrato', '4', 'Estrato 4', 4),
    ('viviendas', 'estrato', '5', 'Estrato 5', 5),
    ('viviendas', 'estrato', '6', 'Estrato 6', 6),
    ('viviendas', 'estrato', 'SIN_DATO', 'Sin dato', 7)
),
categorias AS (
  SELECT destino, dimension, categoria, nombre, clave, NULL::boolean AS afectada, NULL::boolean AS exige_seguro
  FROM fijas
  UNION ALL
  SELECT 'personas', 'condicion', codigo, nombre, id, NULL, NULL FROM nucleo.condiciones_institucionales WHERE asignable
  UNION ALL
  SELECT 'personas', 'grupo_condicion', codigo, nombre, id, NULL, NULL
  FROM nucleo.condiciones_institucionales WHERE padre_id IS NULL
  UNION ALL
  SELECT 'personas', 'tenencia', codigo, nombre, id, NULL, NULL FROM nucleo.tipos_tenencia
  UNION ALL
  SELECT 'personas', 'vulnerabilidad', codigo, nombre, id, NULL, NULL FROM nucleo.tipos_vulnerabilidad
  UNION ALL
  SELECT 'viviendas', 'estado_fisico', codigo, nombre, orden, afectada, NULL FROM nucleo.estados_fisicos
  UNION ALL
  SELECT 'viviendas', 'ocupacion', codigo, nombre, id, NULL, NULL FROM nucleo.condiciones_ocupacion
  UNION ALL
  SELECT 'viviendas', 'financiacion', codigo, nombre, id, NULL, exige_seguro FROM nucleo.tipos_financiacion
  UNION ALL
  SELECT 'viviendas', 'aseguramiento', codigo, nombre, id, NULL, NULL FROM nucleo.condiciones_aseguramiento
)
SELECT
  destino,
  dimension,
  categoria,
  nombre,
  row_number() OVER (PARTITION BY destino, dimension ORDER BY categoria = 'SIN_DATO', clave)::integer AS orden,
  afectada,
  exige_seguro
FROM categorias;

GRANT SELECT ON analitica.categorias_de_registros TO andes_lector, andes_app;
