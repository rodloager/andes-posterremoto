# Base de datos

Documento de las fases 3 y 4. Describe la base de datos PostgreSQL de ANDES: cómo se levanta, cómo se organiza, quién puede hacer qué, cómo se garantiza la integridad y en qué se aparta del modelo de la propuesta técnica.

## 1. Puesta en marcha

PostgreSQL 18.7 corre en Docker. El contenedor publica el puerto 5433 solo en `127.0.0.1`, para no chocar con otra instalación de PostgreSQL en el puerto 5432 y para no quedar expuesto en la red.

```bash
docker compose up -d
```

```bash
npm run db:migrate
```

```bash
npm run db:seed
```

La primera vez que se crea el volumen, `database/docker/01-roles.sh` crea las cuentas `andes_app` y `andes_lector` con las claves del archivo `.env`. El contenedor usa la zona horaria `America/Bogota`.

| Comando | Qué hace |
|---|---|
| `npm run db:migrate` | Aplica las migraciones pendientes |
| `npm run db:rollback` | Revierte la última migración |
| `npm run db:seed` | Borra y vuelve a cargar los datos de las semillas, y crea los usuarios de demostración fuera de producción |
| `npm run db:reset` | Revierte todas las migraciones, las aplica de nuevo y siembra |
| `npm run usuarios:crear -- --correo … --nombre … --rol …` | Crea un usuario, o lo actualiza si el correo ya existe, con una contraseña aleatoria que se muestra una sola vez. La auditoría registra si fue un alta o una actualización. |

Para borrar también el volumen de datos:

```bash
docker compose down --volumes
```

## 2. Esquemas

| Esquema | Contenido | Quién lo lee |
|---|---|---|
| `seguridad` | Usuarios, roles, permisos, sesiones, registro de accesos y auditoría | `andes_app` |
| `nucleo` | Modelo normalizado: territorio, fuentes, conjuntos, cargas, evento, indicadores, afectación, seguros y economía | `andes_app` |
| `analitica` | Vistas de solo lectura que arman lo que publica el portal, y la tabla de agregados | `andes_lector` las vistas públicas; `andes_app` todo |
| `staging` | Tablas de trabajo del ETL: lotes en tránsito, filas rechazadas y cola de revisión de duplicados | `andes_app` solo las filas rechazadas y la cola |
| `bi` | Modelo en estrella para Power BI: 12 dimensiones y 9 tablas de hechos, todas vistas | `powerbi_lector`, y nadie más |

## 3. Cuentas y privilegios

| Cuenta | `seguridad` | `nucleo` | `analitica` | `staging` |
|---|---|---|---|---|
| `andes_propietario` | Dueña de todo | Dueña de todo | Dueña de todo | Dueña de todo. El trabajador del ETL usa esta cuenta. |
| `andes_app` | Lee roles, permisos, usuarios y auditoría. Actualiza solo `usuarios.ultimo_acceso`. Lee y escribe sesiones. Inserta en `registro_accesos`. Ejecuta `registrar_auditoria` y `verificar_auditoria`. | Lee todas las tablas. Actualiza solo `fecha_consulta`, `cobertura`, `variables`, `limitaciones` y `actualizado_en` de `fuentes_datos`, y `estado`, `fusionado_con` y `actualizado_en` de `personas_afectadas` y `viviendas`. Inserta cargas en cola en `ejecuciones_etl`, con columnas limitadas. | Lee todas las vistas. Lee, inserta y actualiza `agregados`, sin poder borrar. | Lee `filas_rechazadas` y `revision_duplicados`. Actualiza solo `estado`, `decidido_por` y `decidido_en` de `revision_duplicados`. |
| `andes_lector` | Nada | Nada | Lee las vistas públicas, entre ellas `agregados_publicables`, `cruces_publicables` y `categorias_de_registros`. No lee los agregados, las vistas de registros vigentes ni las de población y viviendas. | Nada |
| `powerbi_lector` | Nada | Nada | Nada | Nada. Solo lee el esquema `bi`. |

Consecuencias que las pruebas verifican:

- `andes_app` no puede borrar ni modificar la auditoría, ni insertar en ella sin pasar por la función que encadena el hash.
- `andes_app` no puede cambiar el rol ni la contraseña de un usuario, crear usuarios ni borrar el registro de accesos.
- `andes_app` no puede cambiar el origen de una fuente, borrar fuentes, modificar cifras oficiales, vaciar tablas ni crear tablas.
- `andes_lector` no puede leer ninguna tabla de `nucleo` ni de `seguridad`, ni escribir en las vistas, ni ejecutar las funciones de auditoría.
- `andes_lector` no puede leer los registros de personas y viviendas, ni sus vistas, ni los agregados sin anonimizar, ni las filas rechazadas, ni la cola de duplicados. Sí lee `analitica.municipios`, para el buscador.
- `andes_app` no puede insertar personas ni viviendas, cambiar su nombre o su seudónimo, borrarlas, borrar agregados, escribir o borrar filas rechazadas, cambiar la similitud de un par o los conteos de una carga. Esas escrituras solo las hace el ETL.

`powerbi_lector` nace en la migración 0008 sin permiso para iniciar sesión, porque la clave no puede estar en una migración. `npm run bi:cuenta` le pone la clave de `BD_POWERBI_CLAVE`, un límite de 5 conexiones y `default_transaction_read_only = on`. El rol es del servidor, no de la base de datos: la migración solo le da `CONNECT` sobre la base en la que corre, y al revertirse lo retira sin borrar el rol. Ver [POWERBI.md](POWERBI.md#3-cuenta-de-solo-lectura).

Las vistas se ejecutan con los permisos de su dueña. Por eso `andes_lector` lee una vista sin tener acceso a las tablas que la alimentan. Las funciones de `seguridad` son `SECURITY DEFINER`, fijan su `search_path` y no se pueden ejecutar desde `PUBLIC`.

## 4. Tablas

### 4.1 Seguridad

| Tabla | Contenido | Notas |
|---|---|---|
| `roles`, `permisos`, `roles_permisos` | Los cuatro roles y los siete permisos de `config/roles.yml` | |
| `usuarios` | Correo, nombre, hash, rol, estado y último acceso | El correo se guarda en minúsculas. El hash debe empezar por `$argon2id$`. |
| `sesiones` | Sesiones de `express-session` | Las columnas `sid`, `sess` y `expire` llevan los nombres que exige `connect-pg-simple`. |
| `registro_accesos` | Cada intento de ingreso y cada cierre, con correo intentado, IP, resultado y motivo | Solo se inserta. El motivo es uno de cuatro valores. |
| `auditoria` | Cada cambio con usuario, acción, entidad, valor anterior, valor nuevo y hash encadenado | Solo se inserta, por medio de `registrar_auditoria`. |

### 4.2 Núcleo

| Tabla | Contenido | Clave |
|---|---|---|
| `departamentos`, `municipios` | División político-administrativa del DANE: 33 departamentos y 1.122 municipios | Código DIVIPOLA como texto, para no perder el cero inicial |
| `fuentes_datos` | Las 19 fuentes, con entidad, enlace, fechas, cobertura, variables, limitaciones, origen y nivel | Identificador legible, como `dane-afectaciones` |
| `conjuntos_datos` | Cada conjunto que se carga y la fuente que lo alimenta | Identificador legible |
| `ejecuciones_etl` | Cada carga: archivo, nombre original, formato, tamaño, huella SHA-256, quién la subió, estados `EN_COLA`, `EN_CURSO`, `TERMINADA` y `FALLIDA`, filas leídas, válidas, rechazadas, duplicadas, en revisión y confirmadas, alertas, tamaño del lote, duración, memoria máxima, mensaje y si sus agregados ya se aplicaron | Numérica |
| `eventos_sismicos` | El sismo, su epicentro y la fuente de sus coordenadas | Numérica, con un código único `sismo-2026-08-10` |
| `parametros_evento`, `normas_evento` | Magnitud, profundidad y hora según cada fuente, y las normas del evento | |
| `indicadores`, `valores_indicador` | Catálogo de 65 indicadores y sus 32 valores oficiales por fecha de corte y fuente | El indicador usa su código como clave |
| `variables_territoriales` | Las 18 variables del reporte por municipio | Código |
| `reportes_municipales`, `valores_reporte_municipal` | Los 498 reportes de la carga y sus 2.309 valores | Un reporte por municipio y carga |
| `reclamaciones_departamento`, `reclamaciones_ramo` | Reclamaciones de seguros de Fasecolda | |
| `partidas_economicas`, `mediciones_contratacion` | Costos, recursos, destino del fondo y contratación | |
| `condiciones_institucionales`, `tipos_tenencia`, `tipos_vulnerabilidad`, `estados_fisicos`, `condiciones_ocupacion`, `tipos_financiacion`, `condiciones_aseguramiento` | Catálogos de la clasificación. Las condiciones tienen jerarquía (`RECLUSION` pertenece a `PRIVADA_LIBERTAD`) y cada vulnerabilidad tiene su bit en la máscara del algoritmo 1. | Numérica, con un código único |
| `personas_afectadas` | Una persona por fila: seudónimo HMAC del documento, nombre normalizado, edad al momento del sismo, sexo, municipio, condición, tenencia, situación, salud, alertas, estado (`VIGENTE`, `EN_REVISION` o `FUSIONADO`), clave de bloque, origen, carga y fila de origen, y fechas de captura, carga y actualización | Numérica. Única por evento y seudónimo. |
| `personas_vulnerabilidades` | Las vulnerabilidades declaradas de cada persona. Las que dependen de la edad no se guardan: se derivan. | Persona y tipo |
| `viviendas` | Una vivienda por fila: seudónimo del predio, dirección normalizada, municipio, zona, estrato, ocupación, avalúo, alertas, estado, clave de bloque, origen, carga, fila y fechas | Numérica. Única por evento y seudónimo. |
| `afectaciones_vivienda` | El estado físico evaluado, la fecha y el costo estimado. Una vivienda puede tener varias evaluaciones y solo una vigente. | Numérica |
| `aseguramiento`, `financiacion_vivienda`, `reclamaciones`, `indemnizaciones` | Póliza, financiación, reclamación e indemnización de cada vivienda | Numérica, una por vivienda o por reclamación |

### 4.3 Staging

| Tabla | Contenido |
|---|---|
| `personas`, `viviendas` | Tablas `UNLOGGED` por las que pasa cada lote antes de llegar a `nucleo`. No escriben en el registro de transacciones y se vacían en cada lote. |
| `filas_rechazadas` | Una fila por fila rechazada: carga, número de fila, la lista de errores en `jsonb` y el contenido con los identificadores ocultos |
| `revision_duplicados` | La cola de revisión: los dos registros, la similitud, el motivo, el detalle por campo, el estado (`PENDIENTE`, `FUSIONADO`, `DISTINTO` o `RESUELTO`), quién decidió y cuándo |

### 4.4 Analítica

| Tabla | Contenido | Clave |
|---|---|---|
| `agregados` | Cantidad y suma por evento, origen, destino, nivel, territorio, dimensión y categoría. La llena el ETL con el algoritmo 2 y la actualiza cada decisión sobre un duplicado. | Las siete columnas |

## 5. Vistas analíticas

| Vista | Qué entrega | Técnica |
|---|---|---|
| `fuentes`, `eventos`, `parametros_evento`, `normas_evento`, `indicadores`, `variables_territoriales` | Catálogos sin columnas internas | Proyección |
| `valores_indicador` | Cada valor con el valor y la fecha de corte anteriores de su serie | Función de ventana `lag`. La tendencia que publica la API la calcula el algoritmo 6 en el servidor; estas columnas quedan para Power BI. |
| `ejecuciones_vigentes` | La última carga terminada de cada conjunto | `DISTINCT ON` |
| `reportes_municipales`, `valores_municipales` | Solo los reportes de la carga vigente | Unión con `ejecuciones_vigentes` |
| `afectacion_agregada` | Totales nacionales y departamentales de cada variable, en una sola pasada | `GROUPING SETS` |
| `resumen_departamental`, `carga_territorial`, `alertas_territoriales` | Municipios con reporte, último reporte y alertas | Agregación |
| `reclamaciones_departamento`, `reclamaciones_ramo`, `partidas_economicas`, `mediciones_contratacion` | Seguros y economía | Proyección |
| `municipios` | Los 1.122 municipios con su departamento, para el buscador | Unión |
| `personas_vigentes`, `viviendas_vigentes` | Los registros vigentes con sus códigos ya resueltos: grupo de edad, condición, tenencia, estado físico, aseguramiento, financiación, reclamación y semana | Uniones con los catálogos. Solo las lee `andes_app`. |
| `poblacion_por_grupo_de_edad` | Cantidad, suma y edad promedio por grupo de edad en los tres niveles territoriales | `GROUPING SETS` |
| `poblacion_por_condicion`, `poblacion_vulnerable` | Personas por condición y grupo de condición, y por vulnerabilidad, incluidas las derivadas de la edad | Unión de agregaciones |
| `viviendas_por_aseguramiento` | Las 72 combinaciones de estado, aseguramiento y financiación y todos sus totales parciales | `CUBE` |
| `registros_semanales` | Registros por semana de captura | Agregación |
| `agregados_publicables` | Los agregados nacionales y departamentales, con `cantidad` y `suma` en `null` cuando la celda reúne menos de 10 registros, y la marca `suprimida` | Proyección con `CASE`. Lo lee `andes_lector`. |
| `cruces_publicables` | Los cruces de dos variables de vivienda: los seis pares de estado físico, aseguramiento, financiación y reclamación, sumados desde el cubo, y estado físico por ocupación. Con la misma supresión. | `unnest WITH ORDINALITY`, unión y agregación |
| `categorias_de_registros` | Nombre y orden de cada categoría de los registros, y las marcas `afectada` y `exige_seguro` | Unión de los catálogos de `nucleo` y una lista fija de valores. Una prueba comprueba que los nombres coinciden con los del esquema `bi`. Se construía sobre las dimensiones de `bi` y tardaba 463 ms; ver [RENDIMIENTO.md](RENDIMIENTO.md#3-la-optimización-que-encontró-la-medición). |

Las vistas de población y viviendas son la versión SQL del algoritmo 2: las pruebas comparan sus resultados con los de `analitica.agregados` celda por celda.

Como el portal lee de la carga vigente, una carga nueva reemplaza a la anterior sin borrarla, y la anterior sigue disponible para auditoría.

### 5.1 Esquema `bi`

El modelo en estrella de la migración 0008 son 21 vistas comunes: Power BI las importa y cada actualización del informe las recalcula. Las dimensiones de combinaciones (`dim_poblacion`, `dim_vivienda`, `dim_aseguramiento`) llevan claves de texto que las tablas de hechos arman con `concat_ws`, y `hecho_indicadores` numera los cortes de cada indicador con `dense_rank`. [POWERBI.md](POWERBI.md#2-modelo-en-estrella) describe cada vista, su granularidad y sus relaciones.

## 6. Reglas de integridad

| Regla | Dónde |
|---|---|
| Una fuente `SIMULADO` tiene nivel `S`, y una `ESTIMADO` nivel `C` | Restricción `fuentes_nivel_coherente` |
| Toda fuente que no sea simulada tiene enlace y fecha de consulta | Restricción `fuentes_procedencia_obligatoria` |
| Ningún valor oficial, reclamación, partida o medición puede atribuirse a una fuente simulada | Disparador `sin_fuente_simulada` en cinco tablas |
| El mismo archivo no se carga dos veces en un conjunto | Índice único parcial `ejecuciones_archivo_unico` sobre la huella de las cargas terminadas |
| Un valor de indicador es mayor o igual que cero | Restricción en `valores_indicador` |
| Las contraseñas solo se guardan como Argon2id | Restricción `usuarios_hash_argon2id` |
| Los motivos de acceso y las acciones de auditoría son valores conocidos | Restricciones de dominio |
| El identificador de una persona o de un predio es un HMAC de 64 caracteres hexadecimales | Restricciones en `personas_afectadas` y `viviendas` |
| Un documento o predio aparece una sola vez por evento | Restricciones únicas `personas_identificador_unico` y `viviendas_predio_unico`. Son las que convierten un duplicado exacto en un `ON CONFLICT DO NOTHING`. |
| Un registro está fusionado si y solo si tiene representante | Restricciones `personas_fusion` y `viviendas_fusion` |
| Un par de la cola apunta a dos personas o a dos viviendas, nunca a una mezcla | Restricción `revision_registros` |
| Un par está pendiente si y solo si no tiene fecha de decisión | Restricción `revision_decision` |
| El mismo par no entra dos veces en la cola | Índices únicos `revision_par_personas` y `revision_par_viviendas` |
| Una reclamación aprobada tiene valor aprobado, y una no aprobada no lo tiene | Restricción `reclamaciones_aprobacion` |
| Una vivienda tiene una sola evaluación vigente | Índice único parcial `afectaciones_vigentes` |
| Una carga en cola o en curso no tiene fecha de finalización | Restricción `ejecuciones_finalizacion` |
| Un agregado no tiene cantidad negativa y su territorio es `00`, un departamento o un municipio | Restricciones en `analitica.agregados` |

## 7. Auditoría encadenada

Cada fila de `seguridad.auditoria` guarda el hash SHA-256 de su contenido junto con el hash de la fila anterior. La primera fila encadena con 64 ceros.

- **Escritura.** `registrar_auditoria` toma un bloqueo consultivo de transacción, lee el último hash, calcula el nuevo e inserta. El bloqueo evita que dos cambios simultáneos encadenen con la misma fila anterior.
- **Verificación.** `verificar_auditoria` recorre la tabla en orden y recalcula cada hash. Devuelve el número de registros y el primero que no coincide. Su costo es O(n) en el número de registros.
- **Qué detecta.** La modificación de cualquier campo de una fila, el borrado de una fila, que se señala en la fila siguiente, y toda fila cuyo hash no corresponda a su contenido o a la fila anterior.
- **Qué no detecta.** Alguien con la cuenta propietaria que calcule los hashes correctos, ya sea para reescribir la cadena desde una fila alterada o para agregar filas al final. Para detectarlo habría que guardar fuera de la base de datos el último hash de cada día. Queda fuera del alcance académico.

Las pruebas de `tests/integration/ingenieria.test.js` alteran una fila, borran otra, comprueban que la verificación las señala y restauran la cadena.

## 8. Migraciones

Las migraciones están en `database/migrations/`, una pareja de archivos por versión: `.up.sql` aplica el cambio y `.down.sql` lo revierte. Se usan archivos separados porque el formato de un solo archivo de node-pg-migrate exige marcadores con forma de comentario, que la regla del proyecto prohíbe.

| Versión | Contenido |
|---|---|
| 0001 | Esquemas |
| 0002 | Seguridad, funciones de auditoría y permisos |
| 0003 | Territorio, fuentes, conjuntos, cargas y evento |
| 0004 | Indicadores, afectación, seguros, economía y disparadores |
| 0005 | Vistas analíticas |
| 0006 | Esquema `staging`, catálogos de la clasificación, personas, viviendas y sus tablas hijas, filas rechazadas, cola de duplicados y columnas nuevas de las cargas |
| 0007 | Tabla de agregados y vistas de población y viviendas |
| 0008 | Esquema `bi` con el modelo en estrella y la cuenta `powerbi_lector` |
| 0009 | Vistas `agregados_publicables`, `cruces_publicables` y `categorias_de_registros` para el portal |

Cada ejecución corre en una sola transacción y verifica el orden. Si una migración falla, no queda nada a medias. Se comprobó la secuencia completa: aplicar todo, revertir todo y aplicar de nuevo.

## 9. Semillas

`npm run db:seed` vacía las tablas de datos y las vuelve a llenar en una sola transacción, de modo que se puede ejecutar varias veces con el mismo resultado.

| Origen | Contenido |
|---|---|
| `frontend/public/datos/geo/` | Departamentos y municipios del DANE |
| `database/seeds/oficial/` | Fuentes, evento, indicadores, afectación por municipio, seguros y economía. Son los archivos que la fase 2 publicaba en `frontend/public/datos/oficial/`. |
| `config/roles.yml` | Roles y permisos |
| `etl/definiciones/*.yml` | Los tres conjuntos de datos, con su destino y su versión de esquema |

La carga de la afectación por municipio se registra como una ejecución con el nombre del archivo y su huella SHA-256. Así se puede comprobar de qué archivo exacto salieron los datos publicados.

Fuera de producción, la semilla crea cuatro usuarios de demostración con la clave de `CLAVE_USUARIOS_DEMO`. En producción no los crea, y si la variable no está definida tampoco, y lo avisa.

## 10. Índices

| Índice | Consulta que acelera |
|---|---|
| `valores_indicador_serie (evento_id, indicador_codigo, fecha_corte)` | Serie de un indicador |
| Único `(ejecucion_id, municipio_codigo)` en `reportes_municipales` | Explorador de registros: reportes de la carga vigente en orden DIVIPOLA |
| `reportes_municipales_evento (evento_id, municipio_codigo)` | Reportes de un evento por municipio |
| `municipios_departamento (departamento_codigo)` | Filtro por departamento |
| `valores_reporte_variable (variable_codigo)` | Campos vacíos por variable |
| `ejecuciones_archivo_unico` parcial | Impide cargar dos veces el mismo archivo |
| `auditoria_entidad (entidad, entidad_id)` | Historial de una entidad |
| BRIN sobre `auditoria.ocurrido_en` y `registro_accesos.ocurrido_en` | Filtros por fecha en tablas que solo crecen, con un índice muy pequeño |
| `sesiones_expiracion (expire)` | Limpieza de sesiones vencidas |
| `personas_bloque` y `viviendas_bloque (evento_id, clave_bloque)` | Candidatos a duplicado del mismo bloque, en esta carga y en las anteriores |
| `personas_vigentes` y `viviendas_vigentes (evento_id, municipio_codigo)`, parciales sobre `estado = 'VIGENTE'` | Agregados y estadísticas, que solo cuentan registros vigentes |
| `personas_ejecucion` y `viviendas_ejecucion (ejecucion_id, numero_fila)` | Agregar los registros de una carga y localizar una fila del archivo |
| BRIN sobre `cargado_en` | Filtros por fecha de carga |
| `revision_pendientes (destino, id)`, parcial sobre los pares pendientes | Cola de revisión paginada |
| `ejecuciones_en_cola (id)`, parcial | El trabajador reclama la siguiente carga sin recorrer el historial |
| `agregados_dimension (evento_id, destino, dimension, nivel)` | Estadísticas de un territorio y criterios de la priorización |

Los listados privados se paginan por clave: piden las filas con un identificador menor o mayor que el último visto, con `LIMIT`. Sin filtros adicionales, el índice permite ubicar el punto de partida y leer k filas en O(log n + k), sin importar cuán lejos esté la página. Con un filtro que el índice no cubre, como la alerta, el motor puede recorrer más filas hasta completar la página.

## 11. Diferencias con el modelo de la propuesta

La propuesta técnica describe el modelo completo de las seis fases. La fase 3 construyó la parte que tiene datos reales y la fase 4, la de los registros individuales y el ETL. Estas son las diferencias:

| Propuesta | Implementación | Razón |
|---|---|---|
| Tabla `errores_etl`, una fila por error | `staging.filas_rechazadas`, una fila por fila rechazada con la lista de errores | La revisión muestra cada fila una vez, con todos sus motivos y su contenido. |
| Cola de revisión en `nucleo` | `staging.revision_duplicados` | Es una cola de trabajo, no un dato publicado, y la cuenta pública no tiene acceso a `staging`. |
| `personas_afectadas`, `viviendas` y demás tablas de registros individuales | Creadas en la fase 4 | No existen datos oficiales por persona ni por vivienda. Las llenan los datos simulados del generador, marcados como `SIMULADO`. |
| Solo el seudónimo de cada persona | El seudónimo y el nombre normalizado | La detección de duplicados probables necesita comparar nombres. Solo los ven los roles con permiso para editar datos. |
| Una tabla por estadística | `analitica.agregados`, genérica, con la dimensión y la categoría como columnas | Una sola consulta sirve a todas las estadísticas y una dimensión nueva no exige una migración. |
| Una columna por variable en la afectación municipal | Formato largo: `reportes_municipales` y `valores_reporte_municipal` | La fuente trae solo las variables con dato en cada municipio. El formato largo guarda el vacío como ausencia de fila, no como cero. |
| Claves numéricas en fuentes y conjuntos | Identificadores legibles, como `dane-afectaciones` | Las semillas, las pruebas y la API los usan directamente, y no cambian entre una carga y otra. |
| `afectaciones_economicas` | `partidas_economicas` con un tipo: costo, recurso o destino | Las cifras disponibles son partidas anunciadas, no afectaciones medidas. |
| `lote_id` en cada registro | `ejecucion_id` en cada reporte municipal | Es la misma idea con el nombre de la tabla de cargas. |

## 12. Pruebas

| Archivo | Qué comprueba |
|---|---|
| `tests/integration/preparar-base-de-datos.js` | Antes de las pruebas, recrea `andes_pruebas`, aplica las migraciones y siembra con una clave aleatoria |
| `tests/integration/privilegios.test.js` | Cada permiso de la sección 3 y las reglas de la sección 6 |
| `tests/integration/api-publica.test.js` | Que la API devuelve exactamente lo que contienen las semillas |
| `tests/integration/administracion.test.js` | Procedencia de la carga, paginación sin repetir ni saltar filas, conteos de calidad, edición auditada e intentos de inyección |
| `tests/integration/ingenieria.test.js` | Estado del sistema, métricas por patrón y detección de alteraciones en la auditoría |
| `tests/integration/usuarios.test.js` | Alta y actualización de usuarios con Argon2id |
| `tests/integration/etl.test.js` | En su propia base de datos: cada motivo de rechazo, el ocultamiento en `staging`, los duplicados, la reanudación, y la igualdad de los agregados con las vistas `GROUPING SETS` y `CUBE` y con un recálculo completo |
| `tests/integration/cargas.test.js` | En su propia base de datos: la subida, la cola, el trabajador, las filas rechazadas, las decisiones sobre duplicados con su auditoría y su efecto en los agregados, las estadísticas y la priorización con pesos propios |
| `tests/integration/inteligencia.test.js` | En su propia base de datos: que los hechos del esquema `bi` suman los registros vigentes, que ninguna clave queda sin pareja, que `powerbi_lector` solo lee `bi`, que las medidas DAX nombran columnas y valores existentes, la exportación a CSV, los indicadores clave y que ninguna cifra pública de los registros esté entre 1 y 9 |
