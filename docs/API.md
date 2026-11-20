# API REST

Describe cada ruta de la API de ANDES, sus parámetros, sus respuestas y sus errores. El contrato formal, en OpenAPI 3.1, está en [`openapi.yml`](openapi.yml) y se puede abrir con cualquier visor de OpenAPI. La arquitectura que la sostiene está en [ARCHITECTURE.md](ARCHITECTURE.md) y el proceso de carga, en [ETL.md](ETL.md).

## 1. Convenciones

| Tema | Regla |
|---|---|
| Prefijo | `/api/v1` |
| Formato | JSON en UTF-8. Las fechas van en ISO 8601, como `2026-08-10`, y los instantes con zona horaria. |
| Valores ausentes | `null` o un campo que no aparece. Nunca un cero inventado. |
| Errores | `application/problem+json` (RFC 9457), con un código estable en `codigo`. Ver la sección 6. |
| Rutas públicas | Solo lectura y sin sesión. Responden con `Cache-Control: no-cache` y `ETag`: el navegador revalida y recibe 304 si nada cambió. |
| Rutas privadas | Exigen sesión y un permiso. Responden con `Cache-Control: no-store`. |
| Sesión | Cookie `andes.sid`, que se obtiene con `POST /api/v1/sesion`. |
| Escrituras desde otro sitio | Rechazadas con 403 en `POST`, `PATCH` y `DELETE` cuando el origen no es el del servidor. |
| Límites | 300 solicitudes por minuto por dirección IP. 10 intentos fallidos de ingreso cada 15 minutos por dirección IP. Las respuestas traen las cabeceras `RateLimit` y `RateLimit-Policy`. |
| Tamaño del cuerpo | Hasta 20 kB en JSON. La subida de archivos usa `multipart/form-data` y admite hasta 250 MB. |
| Validación | Los parámetros, la consulta y el cuerpo se validan con un esquema por ruta. Un campo que la ruta no espera se rechaza. |

### Paginación

Los listados privados devuelven `{ "elementos": [...], "siguiente": ... }`.

| Parámetro | Regla |
|---|---|
| `limite` | Entero de 1 a 200. Por defecto, 50. |
| `despues` | El valor de `siguiente` de la página anterior. Se omite en la primera página. |

`siguiente` es `null` cuando la página vino incompleta, es decir, cuando no quedan más filas. Si el total es múltiplo exacto de `limite`, la última página llena trae un `siguiente` y la solicitud que sigue devuelve una lista vacía con `siguiente` en `null`.

## 2. Rutas públicas

Todas usan `GET` y no necesitan sesión. `:evento` es el código del sismo, `sismo-2026-08-10`.

| Ruta | Devuelve |
|---|---|
| `/estado` | `{ servicio, baseDeDatos }`. `baseDeDatos` vale `disponible` o `no disponible`. |
| `/fuentes` | `{ meta: { descripcion, niveles }, fuentes: [...] }`. Las 19 fuentes con entidad, enlace, fechas, cobertura, variables, limitaciones, origen y nivel. |
| `/eventos` | `{ eventos: [{ codigo, nombre, fecha }] }` |
| `/eventos/:evento` | `{ codigo, nombre, fecha, epicentro, coordenadas, parametros, normas }`. Cada parámetro trae el valor que reporta cada fuente. |
| `/eventos/:evento/indicadores` | `{ meta, indicadores: [...] }`. Los 65 indicadores, cada uno con su serie por fecha de corte y su tendencia. |
| `/eventos/:evento/indicadores/:codigo` | Un indicador: `{ codigo, nombre, descripcion, unidad, esAcumulado, esDerivado, motivoSinDato, serie, tendencia }`. Cada punto de la serie es `{ fechaCorte, valor, calificador, nota, fuente }`. Si no hay cifra oficial, la serie está vacía y `motivoSinDato` explica por qué. |
| `/eventos/:evento/territorio` | `{ meta, variables, nacional, departamentos, municipios }`. Afectación de los 498 municipios con reporte, totales por departamento y nacionales, y las alertas de calidad. |
| `/eventos/:evento/territorio/departamentos/:departamento` | `{ meta, variables, departamento, municipios }` de un departamento. `:departamento` es un código DIVIPOLA de dos dígitos. |
| `/eventos/:evento/seguros` | `{ meta, porDepartamento, porRamo }` del reporte de Fasecolda |
| `/eventos/:evento/economia` | `{ meta, costos, recursos, destinoFondo, contratacion }`. Cada partida cita su fuente y su fecha. |
| `/eventos/:evento/kpi` | `{ meta, kpi: [...] }`. Los 13 indicadores clave de `config/kpi.yml`, calculados con las cifras oficiales o con los registros simulados. Ver [Indicadores clave](#indicadores-clave). |
| `/eventos/:evento/registros/poblacion` | Distribuciones de las personas registradas: grupos de edad, pirámide, condición, tenencia, situación, condición de salud, vulnerabilidad, departamentos y registros por semana. Ver [Registros publicables](#registros-publicables). |
| `/eventos/:evento/registros/viviendas` | Distribuciones y cruces de las viviendas registradas, el embudo de reclamaciones, la cobertura de las destruidas y los indicadores de vivienda del modo de demostración |
| `/municipios?prefijo=&limite=` | `{ prefijo, municipios: [{ codigo, nombre, departamento: { codigo, nombre } }] }`. Autocompletado de municipios con el trie del algoritmo 5. |

Respuestas de error posibles: 400 si un código no tiene el formato esperado y 404 si el evento, el indicador o el departamento no existen o no tienen reportes.

### Tendencia de un indicador

`tendencia` sale del algoritmo 6 sobre la serie oficial. Si dos fuentes informan la misma fecha, se toma el valor mayor.

```json
{
  "clasificacion": "CRECIENTE",
  "cambioDiario": 388.80357142857144,
  "fechas": 2,
  "revisionesALaBaja": []
}
```

| Campo | Significado |
|---|---|
| `clasificacion` | `CRECIENTE`, `ESTABLE`, `DECRECIENTE` o `INSUFICIENTE`, este último cuando hay menos de dos fechas |
| `cambioDiario` | Pendiente de mínimos cuadrados en unidades por día, o `null` |
| `fechas` | Número de fechas de corte distintas |
| `revisionesALaBaja` | Fechas en las que un indicador acumulado bajó frente al corte anterior |

### Indicadores clave

Cada indicador clave es un cociente entre un numerador y un denominador. Los oficiales combinan indicadores nacionales o variables de los reportes municipales; los simulados, agregados o cruces de los registros cargados por el ETL. Nunca se mezclan los dos orígenes.

```json
{
  "codigo": "avance_reconstruccion_vivienda",
  "nombre": "Avance de la reconstrucción de vivienda",
  "unidad": "porcentaje",
  "sentido": "mayor_es_mejor",
  "origen": "OFICIAL",
  "estado": "disponible",
  "valor": 12.884478315697132,
  "calificador": "más de",
  "fechaCorte": "2026-10-23",
  "numerador": { "tipo": "indicador", "definicion": "viviendas_reconstruidas", "nombre": "Viviendas reconstruidas", "unidad": "viviendas", "valor": 4700, "calificador": "más de", "fechaCorte": "2026-10-23", "fuente": "minvivienda-2026-10-23" },
  "denominador": { "tipo": "indicador", "definicion": "viviendas_destruidas", "valor": 36478, "fechaCorte": "2026-10-10", "fuente": "ungrd-balance-2026-10-10" },
  "serie": [],
  "variacion": null
}
```

| Campo | Significado |
|---|---|
| `unidad` | `porcentaje` (el cociente por 100) o `por_cien_mil` (por 100.000) |
| `sentido` | `mayor_es_mejor`, `menor_es_mejor` o `neutral`. Decide si una variación es una mejora. Los indicadores de severidad son neutrales: su cambio entre balances refleja reportes tardíos, no una mejora. |
| `estado` | `disponible` o `sin-dato`. En el segundo caso, `motivoSinDato` dice qué falta. |
| `calificador` | Se combina el de las dos partes: «más de» en el numerador da «más de», «más de» en el denominador da «menos de», «cerca de» en cualquiera da «cerca de» y «más de» en las dos también da «cerca de». |
| `fechaCorte` | La más reciente de las dos partes. Cada parte trae la suya. |
| `serie` | El indicador en cada fecha de corte que comparten el numerador y el denominador |
| `variacion` | `{ absoluta, corteAnterior, valoracion }` frente al corte anterior de la serie. Es `null` si la serie tiene menos de dos puntos o si el valor actual no sale de su último punto. |

Los simulados devuelven `sin-dato` cuando una parte reúne menos de 10 registros o cuando la tabla de registros la oculta como supresión complementaria. Así ningún indicador revela una celda que otra ruta protege.

### Registros publicables

Las dos rutas de registros leen `analitica.agregados_publicables` y `analitica.cruces_publicables`, que solo tienen niveles nacional y departamental y dejan en `null` toda celda con menos de 10 registros. El servicio añade la supresión complementaria: en cada partición y en cada fila o columna de un cruce, si queda una sola celda oculta, oculta también la menor de las visibles. Ver el algoritmo en [ALGORITHMS.md](ALGORITHMS.md#supresión-de-celdas-pequeñas).

- Una celda oculta llega como `null`, nunca como cero. Una categoría sin registros llega como `0`.
- Las sumas que incluyen una celda oculta también son `null`.
- `meta` trae `origen: "SIMULADO"`, la advertencia, `umbralDePublicacion` y `actualizadoEn`.
- `indicadores` de la ruta de viviendas trae siempre las mismas seis claves; una cifra oculta llega como `null` y el portal la muestra como «Información no disponible».

### Búsqueda de municipios

| Parámetro | Regla |
|---|---|
| `prefijo` | Texto de 1 a 60 caracteres, sin contar los espacios de los extremos. No distingue mayúsculas ni tildes. |
| `limite` | Entero de 1 a 20. Por defecto, 10. |

Devuelve primero los municipios cuyo nombre empieza por el prefijo, en orden alfabético, y después los que lo contienen como palabra interior: `palmar` encuentra San José del Palmar. Un municipio nunca aparece dos veces.

El diccionario de datos describe cada campo: [DATA_DICTIONARY.md](DATA_DICTIONARY.md).

## 3. Sesión

| Método y ruta | Cuerpo | Respuesta |
|---|---|---|
| `POST /sesion` | `{ "correo": "...", "clave": "..." }` | 200 con `{ usuario }` y la cookie `andes.sid`. 400, 401, 403 o 429 en caso de error. |
| `GET /sesion` | | 200 con `{ usuario }`, o 401 sin sesión |
| `DELETE /sesion` | | 204. Destruye la sesión y borra la cookie. Responde igual aunque no haya sesión. |

`usuario` es `{ correo, nombre, rol, nombreRol, permisos }`. Nunca incluye el hash ni el identificador interno.

El correo no distingue mayúsculas. Un correo inexistente, una contraseña incorrecta y una cuenta desactivada responden igual: 401 con el código `CREDENCIALES_INVALIDAS`.

## 4. Administración

Todas exigen sesión. Sin sesión responden 401, incluso en rutas que no existen.

| Método y ruta | Permiso | Parámetros | Devuelve |
|---|---|---|---|
| `GET /admin/conjuntos` | `datos:consultar` | | `{ conjuntos }`: cada conjunto con su fuente, su última carga y el número de registros vigentes |
| `GET /admin/ejecuciones` | `datos:consultar` | `despues`, `limite` | Cargas, de la más reciente a la más antigua: archivo, huella SHA-256, formato, tamaño, filas leídas, válidas, rechazadas, duplicadas, en revisión y confirmadas, alertas, duración, memoria máxima, mensaje y estado |
| `GET /admin/registros` | `datos:consultar` | `despues` (código de municipio), `limite`, `departamento`, `alerta` | Reportes de la carga vigente en orden DIVIPOLA: `{ municipio, nombre, departamento, nombreDepartamento, fechaReporte, alertas, carga, valores }` |
| `GET /admin/calidad` | `datos:consultar` | | `{ conjunto, carga, municipios, reglas, camposVacios }`: municipios por regla de validación y campos vacíos por variable, de mayor a menor |
| `GET /admin/historial` | `datos:consultar` | `despues`, `limite` | Cambios sobre los datos (fuentes, cargas, personas y viviendas), del más reciente al más antiguo, con el valor anterior, el nuevo y el usuario |
| `GET /admin/importables` | `datos:consultar` | | `{ conjuntos: [{ id, nombre, origen, destino, formatos }] }`: los conjuntos definidos en YAML |
| `POST /admin/cargas` | `datos:importar` | `multipart/form-data` con `conjunto` y `archivo` | 202 con `{ carga, trabajadorActivo }`. La carga queda `EN_COLA`. |
| `GET /admin/cargas/:id` | `datos:consultar` | | `{ carga }` con su estado, sus conteos y `filasConfirmadas` |
| `GET /admin/cargas/:id/rechazos` | `datos:consultar` | `despues` (número de fila), `limite` | Filas rechazadas en el orden del archivo: `{ fila, errores, estructural, contenido }`, con los identificadores ocultos |
| `GET /admin/calidad/registros` | `datos:consultar` | | `{ rechazosPorMotivo, duplicadosPendientes }` de todas las cargas |
| `GET /admin/duplicados` | `datos:editar` | `destino`, `estado`, `despues`, `limite` | Pares de la cola de revisión |
| `POST /admin/duplicados/:id/decision` | `datos:editar` | Cuerpo `{ "decision": "MISMO" }` o `{ "decision": "DISTINTO" }` | `{ decision }` con el estado final del registro |
| `GET /admin/estadisticas/poblacion` | `datos:consultar` | `evento`, `territorio`, `origen` | Distribuciones, pirámide y tendencia semanal de las personas |
| `GET /admin/estadisticas/aseguramiento` | `datos:consultar` | `evento`, `territorio`, `origen` | Análisis del cubo de aseguramiento y embudo de reclamaciones |
| `GET /admin/priorizacion` | `priorizacion:usar` | `evento`, `k` | Las *k* zonas de mayor puntaje, con el aporte de cada criterio |
| `PATCH /admin/fuentes/:id` | `datos:importar` | Cuerpo con uno o más de `fechaConsulta`, `cobertura`, `variables` y `limitaciones` | `{ fuente }` actualizada. El cambio queda en la auditoría. |

`alerta` admite `PERSONAS_MENOR_QUE_FAMILIAS` y `FECHA_REPORTE_INVALIDA`.

Reglas de `PATCH /admin/fuentes/:id`:

| Campo | Regla |
|---|---|
| `fechaConsulta` | Fecha real en formato `AAAA-MM-DD`. `2026-02-30` se rechaza. |
| `cobertura` | Texto de 1 a 500 caracteres, sin espacios al inicio ni al final |
| `variables` | Texto de 1 a 1.000 caracteres |
| `limitaciones` | Texto de 1 a 2.000 caracteres |
| Cualquier otro, como `origen` o `nivel` | Se rechaza con 400. El origen y el nivel de una fuente no se cambian por la API. |

Un cuerpo vacío responde 400. Una fuente inexistente responde 404 y no deja registro en la auditoría.

### Subir un archivo

`POST /admin/cargas` recibe `multipart/form-data` con dos partes:

| Parte | Regla |
|---|---|
| `conjunto` | Identificador de un conjunto definido en YAML, como `personas-simuladas` |
| `archivo` | Un solo archivo con extensión `.csv`, `.json` o `.jsonl` y que el conjunto acepte. Hasta 250 MB. |

El servidor guarda el archivo con un nombre aleatorio, calcula su huella SHA-256 y crea la carga en cola. El nombre original solo se conserva como dato descriptivo: sin rutas, sin caracteres de control y con 255 caracteres como máximo. El procesamiento ocurre en el trabajador del ETL, en otro proceso. `trabajadorActivo` vale `false` si el servidor no tiene las claves para lanzarlo; en ese caso la carga espera a `npm run etl -- trabajar`.

Si la subida se rechaza por cualquier motivo, el archivo no queda en disco.

| Respuesta | Cuándo |
|---|---|
| 202 | La carga quedó en cola |
| 400 `FORMATO_NO_ADMITIDO` | La extensión no es CSV, JSON ni JSON Lines, o el conjunto no acepta ese formato |
| 400 `ARCHIVO_REQUERIDO` | Falta el archivo |
| 400 `ARCHIVO_INVALIDO` | Llegó más de un archivo o una parte inesperada |
| 404 `NO_ENCONTRADO` | El conjunto no existe |
| 409 `EN_PROCESO` | El mismo archivo ya está en la cola o en curso. `ejecucion` dice cuál. |
| 409 `YA_CARGADO` | El mismo archivo ya se cargó, aunque tenga otro nombre. `ejecucion` dice en qué carga. |
| 413 `ARCHIVO_DEMASIADO_GRANDE` | El archivo supera el límite |

La interfaz consulta `GET /admin/cargas/:id` cada 1,5 segundos. Los estados son `EN_COLA`, `EN_CURSO`, `TERMINADA` y `FALLIDA`. `filasConfirmadas` es la última fila guardada, y `mensaje` resume el resultado o explica la falla.

### Filas rechazadas

```json
{
  "fila": 3,
  "errores": [
    { "campo": "documento", "codigo": "FORMATO", "mensaje": "El valor •••ABC no tiene el formato esperado." }
  ],
  "estructural": false,
  "contenido": { "documento": "•••ABC", "nombre_completo": "Carmen Ruiz Díaz", "sexo": "F", "edad": "40" }
}
```

- `estructural` es `true` cuando la fila no se pudo interpretar, por columnas de más o de menos o por JSON roto. En ese caso `contenido` trae `{ valores: [...] }` o `{ texto }`.
- El contenido llega en el orden de los campos de la definición.
- Los campos seudonimizados se muestran con sus tres últimos caracteres, y en las filas que no se pudieron interpretar se ocultan las secuencias de cinco o más dígitos.

Los códigos de motivo están en [ETL.md](ETL.md#5-validación-y-limpieza).

### Revisión de duplicados

`GET /admin/duplicados` acepta:

| Parámetro | Regla |
|---|---|
| `destino` | Obligatorio: `personas` o `viviendas` |
| `estado` | `PENDIENTE` (por defecto), `FUSIONADO`, `DISTINTO` o `RESUELTO` |
| `despues`, `limite` | Paginación por el identificador del par |

Cada par trae `{ id, carga, similitud, motivo, detalle, estado, creadoEn, decididoEn, grupo, nuevo, candidato }`:

- `motivo` es `CLAVE_NATURAL` o `SIMILITUD`, y `detalle` trae la similitud de cada campo.
- `grupo` es `{ id, registros }` en los pares pendientes: cuántos registros enlaza el grupo, calculado con conjuntos disjuntos.
- `nuevo` y `candidato` traen el nombre o la dirección normalizados, el municipio, la carga y la fila de origen. Nunca traen el seudónimo.

Al decidir:

| Decisión | Efecto | Respuesta |
|---|---|---|
| `MISMO` | El registro nuevo queda `FUSIONADO` con el representante vigente del grupo y sus demás pares pendientes pasan a `RESUELTO`. No cambia las estadísticas. | `registro: { id, estado: "FUSIONADO", fusionadoCon }` |
| `DISTINTO` | El par queda `DISTINTO`. Si el registro no tiene más pares pendientes, pasa a `VIGENTE` y se suma a las estadísticas. | `registro: { id, estado }` y `pendientes`, los pares que le quedan |

Cada decisión se registra en la auditoría. Los errores propios de esta ruta son 409 `YA_DECIDIDO` si el par o el registro ya tienen una decisión, 409 `CARGA_EN_CURSO` si la carga del registro no ha terminado y 409 `CICLO` si la fusión cerraría un ciclo.

### Estadísticas

Parámetros comunes de `/admin/estadisticas/poblacion` y `/admin/estadisticas/aseguramiento`:

| Parámetro | Regla |
|---|---|
| `evento` | Por defecto, `sismo-2026-08-10` |
| `territorio` | `00` para el país, un departamento de dos dígitos o un municipio de cinco. Por defecto, `00`. |
| `origen` | `OFICIAL`, `ESTIMADO` o `SIMULADO`. Por defecto, `SIMULADO`, el único con registros individuales. |

Las dos rutas devuelven `meta` con el evento, el origen, el territorio con su nombre y nivel, la fecha de la última actualización de los agregados y un aviso cuando los datos son simulados. Un territorio sin registros responde con `total: 0` y listas vacías, nunca con ceros inventados.

| Ruta | Contenido |
|---|---|
| Población | `total`, `edadPromedio` y las distribuciones por grupo de edad, sexo, condición, grupo de condición, tenencia, situación, salud, vulnerabilidad y persona vulnerable, cada categoría con su cantidad y su proporción. Además, `piramide`, por quinquenio y sexo, y `registrosPorSemana`, con su serie, su tendencia, su cambio por semana y sus semanas anómalas. |
| Aseguramiento | `total`, `analisis`, que es el resultado del algoritmo 7 (totales, cobertura mínima y máxima, destruidas con póliza, tasas condicionales, inconsistencias y tabla), `reclamaciones` (el embudo), las distribuciones por zona, estrato y ocupación, y `registrosPorSemana` |

### Priorización

`GET /admin/priorizacion` lee los criterios y los pesos de `config/priorizacion.yml`. `k` es un entero de 1 a 100 y por defecto vale el de la configuración, 20. Las zonas son los municipios con reporte oficial del evento.

`pesos` cambia la importancia de los criterios: `pesos=personas_afectadas:40,viviendas_destruidas:20`. Cada peso va de 0 a 100. Un criterio que no aparece conserva su parte configurada, expresada sobre 100. Responde 400 con el código `VALIDACION` si el formato no es válido, si un criterio no existe, si un peso supera 100 o si todos los criterios con datos quedan en cero.

Ejemplo recortado, con los datos de la base de desarrollo:

```json
{
  "aviso": "Modelo analítico de carácter académico; no constituye una decisión oficial de asignación de ayudas.",
  "meta": { "evento": "sismo-2026-08-10", "zonas": 498, "k": 5, "notas": ["..."] },
  "criterios": [
    { "codigo": "personas_afectadas", "origen": "OFICIAL", "pesoConfigurado": 0.25, "peso": 0.3125, "zonasConDato": 259, "incluido": true, "motivo": null },
    { "codigo": "suministros", "origen": null, "pesoConfigurado": 0.1, "peso": null, "zonasConDato": 0, "incluido": false, "motivo": "La plataforma no tiene datos para este criterio." }
  ],
  "zonas": [
    {
      "posicion": 1,
      "codigo": "17001",
      "nombre": "Manizales",
      "departamento": { "codigo": "17", "nombre": "Caldas" },
      "puntaje": 0.7594,
      "aportes": [{ "criterio": "personas_afectadas", "valor": 8240, "normalizado": 0.9155, "peso": 0.3125, "aporte": 0.2861, "sinDato": false }]
    }
  ]
}
```

- `peso` es el peso efectivo después de excluir los criterios sin datos. Los pesos de los criterios incluidos suman 1. `pesoSolicitado` es el valor que llegó en `pesos`, o `null`.
- Cada zona trae `posicionBase`, su puesto con los pesos configurados, y `cambio`, los puestos que sube (positivo) o baja (negativo) con los pesos pedidos.
- `salientes` lista las zonas que estaban entre las *k* primeras con los pesos configurados y quedan fuera con los pedidos, con su puesto nuevo.
- `meta.pesosPersonalizados` vale `true` cuando llegó `pesos`.
- `notas` advierte cuando el puntaje combina cifras oficiales con datos simulados, que un criterio sin dato aporta cero y que los valores son absolutos y no tasas.
- El resultado no se publica en el portal ciudadano.

## 5. Ingeniería

Todas exigen sesión.

| Método y ruta | Permiso | Parámetros | Devuelve |
|---|---|---|---|
| `GET /ingenieria/estado` | `sistema:ver` | | Servidor, base de datos, filas por tabla, últimas cargas, antigüedad de cada fuente, métricas de solicitudes y errores recientes |
| `GET /ingenieria/auditoria` | `auditoria:ver` | `despues`, `limite` | Toda la auditoría, del registro más reciente al más antiguo |
| `GET /ingenieria/auditoria/verificacion` | `auditoria:ver` | | `{ registros, integra, primerRegistroAlterado }` |
| `GET /ingenieria/accesos` | `auditoria:ver` | `despues`, `limite` | Intentos de ingreso y cierres, con correo intentado, usuario, IP, resultado y motivo |

`solicitudes` dentro de `/ingenieria/estado` agrupa por patrón de ruta, como `GET /api/v1/eventos/:evento/territorio`. Las solicitudes que no llegan a una ruta se agrupan por el punto de montaje que alcanzaron, como `GET /api/v1/admin/*`.

## 6. Errores

Ejemplo de una consulta con un departamento mal escrito:

```json
{
  "type": "about:blank",
  "title": "Solicitud no válida",
  "status": 400,
  "detail": "Hay datos que no cumplen el formato esperado.",
  "instance": "/api/v1/eventos/sismo-2026-08-10/territorio/departamentos/6",
  "codigo": "VALIDACION",
  "errores": [
    {
      "ubicacion": "params",
      "campo": "departamento",
      "mensaje": "El departamento es un código DIVIPOLA de dos dígitos."
    }
  ]
}
```

| Estado | Código | Cuándo |
|---|---|---|
| 400 | `VALIDACION` | Un parámetro, la consulta o el cuerpo no cumplen el esquema. `errores` dice dónde y por qué. |
| 400 | `JSON_INVALIDO` | El cuerpo no es JSON válido |
| 401 | `NO_AUTENTICADO` | La ruta exige sesión y no la hay, o la cuenta se desactivó |
| 401 | `CREDENCIALES_INVALIDAS` | El ingreso falló |
| 403 | `SIN_PERMISO` | El rol no tiene el permiso de la ruta |
| 403 | `ORIGEN_NO_PERMITIDO` | Una escritura llegó desde otro sitio |
| 404 | `NO_ENCONTRADO` | La ruta o el recurso no existen |
| 400 | `FORMATO_NO_ADMITIDO`, `ARCHIVO_REQUERIDO`, `ARCHIVO_INVALIDO` | La subida de un archivo no cumple las reglas |
| 409 | `EN_PROCESO`, `YA_CARGADO` | El archivo ya está en la cola o ya se cargó |
| 409 | `YA_DECIDIDO`, `CARGA_EN_CURSO`, `CICLO` | La decisión sobre un duplicado no se puede aplicar |
| 413 | `CUERPO_DEMASIADO_GRANDE` | El cuerpo supera 20 kB |
| 413 | `ARCHIVO_DEMASIADO_GRANDE` | El archivo supera el límite de la subida |
| 429 | `DEMASIADAS_SOLICITUDES` | Se superó el límite general |
| 429 | `DEMASIADOS_INTENTOS` | Se superó el límite de ingresos fallidos |
| 500 | `ERROR_INTERNO` | Error inesperado. El mensaje es genérico y el detalle queda en el registro del servidor. |
| 503 | `BASE_DE_DATOS_NO_DISPONIBLE` | No hay conexión con PostgreSQL |

## 7. Ejemplos con curl

Los ejemplos guardan la cookie en `cookies.txt`. Reemplaza `CLAVE` por la contraseña de la cuenta: para los usuarios de demostración es el valor de `CLAVE_USUARIOS_DEMO` en tu archivo `.env`.

```bash
curl -c cookies.txt -H 'Content-Type: application/json' -d '{"correo":"datos@andes.test","clave":"CLAVE"}' http://localhost:3000/api/v1/sesion
```

```bash
curl -b cookies.txt 'http://localhost:3000/api/v1/admin/registros?departamento=66&limite=20'
```

```bash
curl -b cookies.txt -X PATCH -H 'Content-Type: application/json' -d '{"limitaciones":"Texto nuevo."}' http://localhost:3000/api/v1/admin/fuentes/dane-mgn
```

Subir un archivo y consultar su avance:

```bash
curl -b cookies.txt -F conjunto=personas-simuladas -F archivo=@data/raw/generador-andes/personas-10000-s20260810.csv http://localhost:3000/api/v1/admin/cargas
```

```bash
curl -b cookies.txt http://localhost:3000/api/v1/admin/cargas/12
```

Decidir sobre un par de la cola de revisión:

```bash
curl -b cookies.txt -H 'Content-Type: application/json' -d '{"decision":"DISTINTO"}' http://localhost:3000/api/v1/admin/duplicados/14/decision
```

Buscar un municipio, sin sesión:

```bash
curl 'http://localhost:3000/api/v1/municipios?prefijo=palmar'
```

```bash
curl -b cookies.txt -X DELETE http://localhost:3000/api/v1/sesion
```

Borra `cookies.txt` al terminar: mientras la sesión esté abierta, ese archivo da acceso a la cuenta.

## 8. Diferencias con la propuesta

| Propuesta (sección 9.6) | Fase 3 | Razón |
|---|---|---|
| Cada respuesta separa el dato de su procedencia en `{ datos, meta }` | Las rutas públicas conservan la forma de los archivos de la fase 2 | El portal pasó a la API sin cambiar su lógica. La procedencia no se perdió: cada punto de una serie y cada parámetro del sismo citan su fuente, y los documentos de territorio, seguros y economía traen su `meta`. |
| El indicador trae su variación frente al corte anterior | La serie completa viaja al navegador, y desde la fase 4 cada indicador trae además su `tendencia` | El análisis de tendencias del algoritmo 6 se calcula en el servidor. La variación de cada corte sigue disponible en la vista `analitica.valores_indicador`. |
| Laboratorio de priorización con pesos ajustables | Desde la fase 5 la ruta acepta `pesos` y la pantalla `/privado/priorizacion` los ajusta | Sin diferencia. |
| Contrato OpenAPI en YAML | [`openapi.yml`](openapi.yml), desde la fase 6 | Sin diferencia. Dos pruebas lo mantienen al día: una con las rutas del servidor y otra con las respuestas públicas. |
