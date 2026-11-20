# Diccionario de datos

Describe los datos de ANDES y su estructura.

| Datos | Dónde viven | Cómo llegan al portal |
|---|---|---|
| Cifras oficiales | Semillas en `database/seeds/oficial/`, cargadas en PostgreSQL con `npm run db:seed` | Por la API, con la misma estructura de estos archivos. Ver [API.md](API.md). |
| Límites del mapa | `frontend/public/datos/geo/` | Como archivos |
| Datos simulados de los módulos sin registros | `frontend/public/datos/simulado/` | Como archivos, solo en el modo de demostración. No entran a la base de datos. |
| Registros simulados para el ETL | Archivos en `data/raw/generador-andes/`, cargados por el ETL en `nucleo.personas_afectadas` y `nucleo.viviendas` | Agregados, sin celdas de menos de 10 registros, por `/api/v1/eventos/:evento/registros/`, solo en el modo de demostración del portal. El entorno privado los consulta agregados, marcados como simulados. |
| Indicadores clave | `config/kpi.yml` | Calculados por la API. Ver la sección 9. |
| Modelo en estrella | Vistas del esquema `bi` | Solo a Power BI, con la cuenta `powerbi_lector`. Ver [POWERBI.md](POWERBI.md). |

Las tablas y vistas que guardan las cifras oficiales están en [DATABASE.md](DATABASE.md).

## 1. Clases de dato

| Campo | Valores | Significado |
|---|---|---|
| `origen` | `OFICIAL`, `ESTIMADO`, `SIMULADO` | Quién produjo la cifra. |
| `nivel` | `A`, `B`, `C`, `S` | Cómo se obtuvo: fuente primaria, tercero que cita a la entidad, cálculo no oficial o simulación. |

Una fuente `SIMULADO` siempre tiene nivel `S` y una `ESTIMADO` siempre tiene nivel `C`. Una prueba automática lo verifica.

## 2. Fuentes: `fuentes.json`

Catálogo de fuentes. Cada cifra publicada apunta a una ficha por su `id`. Se guarda en `nucleo.fuentes_datos` y se consulta en `GET /api/v1/fuentes`.

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | texto | Identificador estable de la fuente. |
| `entidad` | texto | Entidad responsable. |
| `sigla` | texto, opcional | Nombre corto para las tarjetas. |
| `nombre` | texto | Nombre del conjunto, boletín o documento. |
| `origen`, `nivel` | texto | Clase de dato, según la sección 1. |
| `tipoAcceso` | texto | API, documento, boletín, servicio geográfico u otro. |
| `enlace` | URL o nulo | Enlace de origen. Es nulo solo en la fuente simulada. |
| `leidoEn` | texto, opcional | Medio en el que se leyó una cifra de nivel B. |
| `fechaPublicacion` | fecha o nulo | Nulo cuando la fuente no la declara. |
| `fechaConsulta` | fecha | Día en que el proyecto consultó la fuente. |
| `cobertura` | texto | Cobertura geográfica. |
| `variables` | texto | Variables disponibles. |
| `limitaciones` | texto | Limitaciones conocidas. |
| `uso` | `indicadores` o `referencia` | Si respalda cifras publicadas o es un catálogo por integrar. |

## 3. Indicadores: `indicadores.json`

Catálogo de indicadores nacionales con su serie histórica. Se guarda en `nucleo.indicadores` y `nucleo.valores_indicador`, y se consulta en `GET /api/v1/eventos/:evento/indicadores`.

| Campo | Tipo | Descripción |
|---|---|---|
| `codigo` | texto | Identificador del indicador. |
| `nombre`, `descripcion` | texto | Lo que ve el ciudadano. |
| `unidad` | texto | Unidad de medida. `COP`, `USD` y `%` tienen formato propio. |
| `esAcumulado` | booleano | Si la cifra solo debería crecer. Una disminución se interpreta como revisión. |
| `esDerivado` | booleano, opcional | Si el proyecto la calcula a partir de otras cifras oficiales. |
| `motivoSinDato` | texto, opcional | Explicación específica cuando no hay cifra oficial. |
| `serie` | lista | Un punto por fecha de corte. Vacía si no hay cifra oficial. |

Cada punto de la serie tiene:

| Campo | Tipo | Descripción |
|---|---|---|
| `fechaCorte` | fecha | Fecha hasta la que la entidad contó los casos. |
| `valor` | número | Valor reportado. |
| `fuente` | texto | `id` de la fuente. |
| `calificador` | texto, opcional | Expresiones como «más de» o «cerca de» que usó la entidad. |
| `nota` | texto, opcional | Aclaración, por ejemplo una corrección de la entidad. |

Una serie nunca mezcla cifras de conceptos distintos. El costo de reconstrucción del Ministerio de Vivienda y el del Plan de Acción Específico son dos indicadores.

## 4. Afectación por municipio: `territorio.json`

Afectación por municipio, descargada del servicio geográfico del DANE con `npm run datos:afectaciones`. Se guarda en `nucleo.reportes_municipales` y `nucleo.valores_reporte_municipal`, con un registro de la carga en `nucleo.ejecuciones_etl`. La API reconstruye este documento desde las vistas en `GET /api/v1/eventos/:evento/territorio`.

| Sección | Contenido |
|---|---|
| `meta` | Fuente, fecha de consulta, periodo de los reportes, municipios con reporte y conteo de alertas de calidad. |
| `variables` | Código, nombre y unidad de las 18 variables. |
| `nacional` | Suma de todos los municipios. |
| `departamentos` | Código, nombre, municipios con reporte, valores y último reporte. |
| `municipios` | Código DIVIPOLA, nombre, departamento, valores, fecha del reporte y alertas. |

Correspondencia con los campos de la fuente:

| Variable | Campo de la fuente | Variable | Campo de la fuente |
|---|---|---|---|
| `familias` | `Familias` | `edificiosColapsados` | `Edificios_` |
| `personas` | `Personas` | `centrosSalud` | `Centros_de` |
| `fallecidos` | `Fallecidos` | `centrosEducativos` | `Centros_Ed` |
| `heridos` | `Heridos` | `centrosComunitarios` | `Centros_Co` |
| `desaparecidos` | `Desapareci` | `vias` | `Vías` |
| `rescatados` | `Rescatados` | `aeropuertos` | `Aeropuerto` |
| `viviendasAveriadas` | `Viviendas` | `acueductos` | `Acueductos` |
| `viviendasDestruidas` | `Viviendas_` | `puentesVehiculares` | `Puente_veh` |
| `edificiosAveriados` | `Edificios` | `puentesPeatonales` | `Puente_pea` |

Reglas de transformación:

- Los números llegan como texto y se convierten. Un texto que no es un número entero queda vacío.
- Un campo vacío no se guarda como cero. La variable simplemente no aparece en `valores`, y el portal la muestra como «Sin dato».
- La fecha del reporte se extrae de la bitácora. Si es anterior al sismo o posterior a la consulta, queda vacía y se registra la alerta `FECHA_REPORTE_INVALIDA`.
- Si un municipio informa menos personas que familias se registra la alerta `PERSONAS_MENOR_QUE_FAMILIAS`. El valor de la fuente se conserva.
- Solo se publican los municipios con al menos una cifra mayor que cero.
- Los campos de texto libre de la fuente, como comentarios y bitácoras, no se publican.

## 5. Otros archivos oficiales

| Archivo | Contenido | Ruta de la API |
|---|---|---|
| `evento.json` | Parámetros del sismo según cada fuente, coordenadas del epicentro y normas del evento. | `/api/v1/eventos/:evento` |
| `seguros.json` | Reclamaciones de seguros por departamento y por ramo, del reporte de Fasecolda. | `/api/v1/eventos/:evento/seguros` |
| `economia.json` | Costos estimados, recursos, destino del Fondo Milagro y mediciones de contratación. Cada partida cita su fuente y su fecha. | `/api/v1/eventos/:evento/economia` |

Los límites del mapa:

| Archivo | Contenido |
|---|---|
| `geo/departamentos.json` | Límites de los 33 departamentos en GeoJSON, con `codigo` y `nombre`. |
| `geo/municipios/<departamento>.json` | Límites de los municipios de cada departamento. Se cargan al seleccionarlo. |

Los límites se descargan con `npm run datos:limites` y se simplifican en el servicio de origen: 0,01 grados para departamentos y 0,004 para municipios.

## 6. Datos simulados

Los genera `npm run datos:simular` en `frontend/public/datos/simulado/`. Todos llevan este encabezado:

| Campo de `meta` | Valor |
|---|---|
| `origen` | `SIMULADO` |
| `nivel` | `S` |
| `fuente` | `generador-andes` |
| `semilla` | 20260810 |
| `advertencia` | Texto que declara que no son cifras oficiales. |

| Archivo | Contenido | Muestra |
|---|---|---|
| `economia.json` | Pérdidas por sector y recursos asignados, comprometidos y ejecutados | Derivado de una muestra interna de 50.000 viviendas |
| `infraestructura.json` | Trece tipos de infraestructura por nivel de daño y recuperación | Valores agregados |
| `salud.json`, `educacion.json`, `logistica.json` | Indicadores y series semanales de cada módulo | Valores agregados |
| `indicadores.json` | Un valor por cada indicador nacional sin cifra oficial, salvo los seis de vivienda que salen de los registros y las personas desplazadas, que no tienen fuente | Según el módulo |

Desde la fase 5, `poblacion.json` y `vivienda.json` ya no se generan: las páginas de población y vivienda leen los registros cargados en la base de datos. El generador sigue simulando internamente población y viviendas porque los módulos de salud, logística y economía dependen de esas muestras.

Cómo se generan:

- El generador de números es determinista. La misma semilla produce los mismos archivos.
- Cada persona y cada vivienda se sortea atributo por atributo con las probabilidades de `data/generador/catalogos.js`.
- El seguro de una vivienda depende de su financiación, pero no está determinado por ella: hay viviendas hipotecadas con y sin seguro.
- El reparto por departamento da más peso a los más cercanos al epicentro.
- Los parámetros son ilustrativos. No provienen de ninguna estadística y no deben citarse.

## 7. Registros simulados para el ETL

`npm run datos:registros` genera archivos de personas y viviendas individuales para ejercitar el ETL y los algoritmos. No son datos reales: su origen es `SIMULADO`, su fuente es `generador-andes` y la plataforma nunca los suma con cifras oficiales. Se escriben en `data/raw/generador-andes/<tipo>-<cantidad>-s<semilla>.<formato>`, en CSV, JSON Lines o arreglo JSON.

### 7.1 Personas: `personas-simuladas`

| Columna | Tipo | Regla | Ejemplo |
|---|---|---|---|
| `documento` | Texto | Obligatorio. De 5 a 12 dígitos. Se guarda como seudónimo HMAC. | `9300123457` |
| `nombre_completo` | Texto | Obligatorio. Hasta 120 caracteres. Se guarda normalizado. | `Néstor Vargas Restrepo` |
| `sexo` | Categoría | `F` o `M` | `M` |
| `edad` | Entero | Obligatoria. De 0 a 120. | `31` |
| `municipio` | Municipio | Obligatorio. Código DIVIPOLA existente. | `63401` |
| `condicion_institucional` | Categoría | Obligatoria. `CIVIL`, `MILITAR`, `RECLUSION` u `OTRA_MODALIDAD`. | `CIVIL` |
| `tenencia` | Categoría | `PROPIETARIO`, `ARRENDATARIO`, `OCUPANTE_CON_PERMISO` u `OTRA` | `ARRENDATARIO` |
| `situacion` | Categoría | Obligatoria. `DAMNIFICADA` o `AFECTADA`. | `DAMNIFICADA` |
| `condicion_salud` | Categoría | Obligatoria. `ILESA`, `HERIDA`, `FALLECIDA` o `DESAPARECIDA`. | `ILESA` |
| `vulnerabilidades` | Lista separada por `\|` | `DISCAPACIDAD`, `NECESIDADES_ESPECIALES`, `MOVILIDAD_REDUCIDA`, `EMBARAZO`, `VULNERABILIDAD_SOCIOECONOMICA` y `COMUNIDAD_ATENCION_PRIORITARIA`. Adulto mayor y población infantil se derivan de la edad. | `DISCAPACIDAD\|EMBARAZO` |
| `fecha_registro` | Fecha | Obligatoria. Entre el día del sismo y hoy. | `2026-08-21` |

### 7.2 Viviendas: `viviendas-simuladas`

| Columna | Tipo | Regla |
|---|---|---|
| `predio` | Texto | Obligatorio. De 4 a 20 letras, dígitos o guiones. Se guarda como seudónimo HMAC. |
| `direccion` | Texto | Obligatoria. Hasta 200 caracteres. Se guarda normalizada, con las abreviaturas unificadas. |
| `municipio` | Municipio | Obligatorio |
| `zona` | Categoría | Obligatoria. `URBANA` o `RURAL`. |
| `estrato` | Entero | De 1 a 6 |
| `ocupacion` | Categoría | `PROPIA`, `ARRENDADA`, `TERCEROS`, `DESOCUPADA` u `OTRA` |
| `avaluo`, `costo_estimado`, `saldo`, `valor_asegurado`, `valor_reclamado`, `valor_aprobado` | Entero | Pesos colombianos, mayores o iguales que cero |
| `estado_fisico` | Categoría | Obligatorio. `SIN_AFECTACION`, `AFECTACION_LEVE`, `AFECTACION_MODERADA`, `AFECTACION_GRAVE`, `DESTRUCCION_TOTAL` o `PENDIENTE_EVALUACION`. |
| `fecha_evaluacion` | Fecha | Entre el día del sismo y hoy |
| `financiacion` | Categoría | Obligatoria. `HIPOTECA`, `LEASING`, `SIN_FINANCIACION` o `PENDIENTE_VERIFICACION`. |
| `aseguramiento` | Categoría | Obligatorio. `ASEGURADA`, `NO_ASEGURADA` o `PENDIENTE_VERIFICACION`. |
| `reclamacion` | Categoría | `NINGUNA`, `EN_ESTUDIO`, `RECHAZADA`, `APROBADA` o `PAGADA` |
| `fecha_registro` | Fecha | Obligatoria. Entre el día del sismo y hoy. |

### 7.3 Defectos que inyecta el generador

Con las tasas por defecto, el 1 % de las filas tiene un error que debe rechazarse, el 0,5 % es un duplicado exacto de una fila reciente, otro 0,5 % es un duplicado probable y el 3 % tiene un valor que el ETL debe normalizar.

| Clase | Personas | Viviendas |
|---|---|---|
| Rechazo | Edad no numérica, edad de 150, municipio `99999`, documento vacío, condición `CIVL`, fecha `2026-02-30` y fecha anterior al sismo | Estrato 9, avalúo negativo, estado `DERRUMBADA`, municipio `99999`, predio vacío y fecha `2026-13-01` |
| Normalización | Municipio sin el cero inicial, condición en minúsculas con espacios, `No registra` en la tenencia y sexo en minúscula | Municipio sin el cero inicial, dirección abreviada, estado en minúsculas y `N/A` en el saldo |
| Duplicado probable | Otro documento y un error de digitación en el nombre, que nunca cambia la primera letra | Otro predio y la misma dirección escrita de otra forma |

### 7.4 Manifiesto

Al lado de cada archivo, `<archivo>.manifiesto.json` dice lo que el ETL debe encontrar:

| Campo | Contenido |
|---|---|
| `conjunto`, `origen`, `formato`, `semilla`, `tasas` | Cómo se generó |
| `filas` | Filas de datos, sin el encabezado |
| `rechazadas` | `{ total, porMotivo }` |
| `normalizables` | Filas con un valor que el ETL normaliza, por tipo |
| `duplicadosExactos`, `duplicadosProbables` | Duplicados inyectados |
| `validasEsperadas`, `insertadasEsperadas` | Filas que deben pasar la validación y registros que deben quedar en la base de datos |
| `huella` | SHA-256 del archivo |

Las pruebas de integración y la medición del ETL comparan los conteos de cada carga con su manifiesto.

## 8. Filas rechazadas y cola de duplicados

| Dato | Dónde | Campos |
|---|---|---|
| Fila rechazada | `staging.filas_rechazadas` | Carga, número de fila, errores (`[{ campo, codigo, mensaje }]`) y contenido con los identificadores ocultos |
| Par en revisión | `staging.revision_duplicados` | Carga, los dos registros, similitud, motivo (`CLAVE_NATURAL` o `SIMILITUD`), detalle por campo, estado, quién decidió y cuándo |
| Agregado | `analitica.agregados` | Evento, origen, destino, nivel, territorio, dimensión, categoría, cantidad, suma y fecha de actualización |

Los códigos de los motivos de rechazo y sus reglas están en [ETL.md](ETL.md#5-validación-y-limpieza).

## 9. Indicadores clave: `config/kpi.yml`

Cada indicador clave es un cociente. El servidor valida el archivo con Zod la primera vez que lo usa.

| Campo | Regla |
|---|---|
| `codigo` | Minúsculas y guiones bajos, único |
| `nombre`, `descripcion` | Texto para el portal. Cada nombre coincide con el de una medida DAX de `analytics/powerbi/medidas.dax`, sin distinguir mayúsculas. |
| `modulo` | Módulo del portal al que pertenece |
| `unidad` | `porcentaje` o `por_cien_mil` |
| `sentido` | `mayor_es_mejor`, `menor_es_mejor` o `neutral` |
| `origen` | `OFICIAL` o `SIMULADO` |
| `numerador`, `denominador` | Exactamente un ingrediente cada uno |

| Ingrediente | Origen | Qué suma |
|---|---|---|
| `indicador: codigo` | Oficial | El último valor publicado del indicador nacional |
| `territorial: { variables, mayores }` | Oficial | Las variables de los reportes municipales en todos los municipios, o en los `mayores` municipios con más valor |
| `agregado: { destino, dimension, categorias }` | Simulado | Las categorías de una dimensión nacional de `analitica.agregados_publicables` |
| `cruce: { dimension: [categorias], otra: [categorias] }` | Simulado | Las celdas de un cruce de dos variables de vivienda en `analitica.cruces_publicables` |

## 10. Modelo en estrella

Las 12 dimensiones y las 9 tablas de hechos del esquema `bi`, con sus claves, su granularidad y su origen, están en [POWERBI.md](POWERBI.md#2-modelo-en-estrella). Las columnas de cada vista viajan en el encabezado de su CSV y en `manifiesto.json` cuando se exporta con `npm run bi:exportar`.
