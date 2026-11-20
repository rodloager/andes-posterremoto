# Registro de cambios

Los cambios de cada entrega se anotan aquí, del más reciente al más antiguo.

## 0.6.0 — 2026-11-19

Fase 6: calidad y documentación.

### Agregado

- `npm run medir:api`: percentil 95 de las 12 rutas públicas con un millón de registros, en la base aislada `andes_medicion_api`. Todas quedan entre 0,1 y 64 ms. Ver [RENDIMIENTO.md](docs/RENDIMIENTO.md).
- `npm run medir:consultas`: seis comparaciones de planes con `EXPLAIN ANALYZE`, entre ellas índice frente a recorrido secuencial, hash frente a ordenamiento y paginación por clave frente a desplazamiento.
- `npm run medir:graficas`: gráficas SVG de los algoritmos, la API y las consultas en `docs/graficas/`.
- Contrato OpenAPI 3.1 en [`docs/openapi.yml`](docs/openapi.yml), con una prueba que lo compara con las 37 rutas del servidor y otra que compara las respuestas públicas con su esquema.
- Cobertura con `npm run test:cobertura` y umbrales que hacen fallar la suite: 70 % en el código medido y 90 % en los algoritmos. Resultado: 93,8 % y 98,0 % de líneas.
- Proyecto de pruebas `interfaz` con happy-dom para el DOM, las tablas, las figuras, las tarjetas de indicadores clave, las gráficas y el buscador.
- Pruebas de contraste de los colores, encabezados de seguridad, límite de solicitudes, despliegue detrás de un proxy, ausencia de datos personales en las respuestas públicas, procedencia de cada cifra oficial, intentos de inyección en las rutas nuevas y carga del reporte oficial del DANE con el ETL.
- Buscador de municipios en el mapa, sobre el autocompletado del trie (RF-09), con enlace directo `?departamento=&municipio=`.
- Descarga en CSV de los indicadores con su serie y de la afectación por municipio (RF-16).
- Cuatro términos nuevos en el glosario: indicador clave, calificador, punto porcentual y celda oculta.
- Variable `PROXIES_DE_CONFIANZA` para desplegar detrás de un proxy con HTTPS.
- Documentación: [rendimiento](docs/RENDIMIENTO.md), [seguridad](docs/SEGURIDAD.md) y [verificación de cada requisito](docs/VERIFICACION.md).
- 1.126 pruebas en 64 archivos.

### Cambiado

- La vista `analitica.categorias_de_registros` se construye con los catálogos de `nucleo` en lugar de las dimensiones de `bi`. Bajó de 463 ms a 2 ms y con ella las rutas de indicadores clave y de registros pasaron de 1,2 a 1,9 s a menos de 64 ms con un millón de registros.
- `package.json` fija `glob` 14.0.6 para node-pg-migrate y `minimatch` 11.0.9 para ESLint, las versiones corregidas.
- `npm run test:unitarias` incluye el proyecto `interfaz`.

### Corregido

- Detrás de un proxy con HTTPS, en producción no se emitía la cookie de sesión y el límite de solicitudes veía a todos los usuarios como una sola IP.
- Las ventanas de información de cuatro gráficas insertaban nombres sin escapar en HTML.

### Seguridad

- `npm audit` pasó de 6 hallazgos moderados a ninguno.

## 0.5.0 — 2026-11-19

Fase 5: inteligencia de negocios.

### Agregado

- Trece indicadores clave en `config/kpi.yml`, validados con Zod: ocho con cifras oficiales y cinco con los registros simulados. La ruta `GET /api/v1/eventos/:evento/kpi` los calcula con su calificador combinado, las fuentes y la fecha de cada parte, su serie por cortes compartidos y su variación valorada según su sentido.
- Sección «Indicadores clave» en el panorama nacional, con el componente `andes-kpi` y el sello «Cálculo con cifras oficiales».
- Rutas públicas `GET /api/v1/eventos/:evento/registros/poblacion` y `/registros/viviendas`. Las páginas de población y vivienda del modo de demostración ya no leen archivos fijos sino los registros cargados por el ETL.
- Supresión de celdas pequeñas para las cifras públicas de los registros: primaria en las vistas y complementaria en el servidor, en particiones y en cruces. Ver [ALGORITHMS.md](docs/ALGORITHMS.md#supresión-de-celdas-pequeñas).
- Página pública `/comparar`: dos departamentos lado a lado con su participación y su puesto, ranking por variable y cambio de los balances nacionales entre el primer y el último corte.
- Laboratorio de priorización en `/privado/priorizacion`, con el permiso `priorizacion:usar`: pesos ajustables, aporte de cada criterio al puntaje, cambio de puesto frente a los pesos configurados y zonas que salen del grupo. La ruta `GET /api/v1/admin/priorizacion` acepta `pesos` y devuelve `posicionBase`, `cambio` y `salientes`.
- Migración 0008: esquema `bi` con el modelo en estrella, 12 dimensiones y 9 tablas de hechos, y el rol `powerbi_lector`.
- Migración 0009: vistas `analitica.agregados_publicables`, `analitica.cruces_publicables` y `analitica.categorias_de_registros`.
- Dimensión de agregados `estado_ocupacion`, para contar las viviendas propias y arrendadas afectadas.
- Power BI: 40 medidas DAX en `analytics/powerbi/medidas.dax`, un revisor que detecta nombres repetidos, medidas inexistentes, ciclos y paréntesis sin cerrar, la consulta que crea todas las medidas de una vez, `npm run bi:cuenta` y `npm run bi:exportar`. Ver [POWERBI.md](docs/POWERBI.md).
- `npm run datos:demostracion`: genera y carga 50.000 personas y 50.000 viviendas simuladas.
- La verificación de comentarios revisa también los archivos DAX.
- Pruebas: 1.031 pruebas en 51 archivos, entre ellas propiedades de la supresión con fast-check y la comprobación automática de la regla RNF-06 sobre cada número que publica la API.

### Cambiado

- `simulado/indicadores.json` ya no trae los seis indicadores de vivienda que ahora salen de los registros ni el de personas desplazadas, que no tiene fuente. `simulado/poblacion.json` y `simulado/vivienda.json` ya no se generan.
- El gráfico de evolución de la página de población muestra las personas registradas por semana.
- Las gráficas de pirámide y de matriz y la participación de las gráficas circulares muestran «Sin dato» en las celdas ocultas, en lugar de cero.
- Los indicadores clave de severidad son neutrales: su cambio entre balances no se presenta como mejora ni como deterioro.

### Corregido

- Un indicador clave simulado podía publicar una celda que la tabla de registros ocultaba como complemento. Los dos usan ahora las mismas tablas protegidas.
- La API de priorización mezclaba escalas cuando recibía solo algunos pesos.

### Pendiente

- El informe `.pbix`, que necesita un equipo con Windows (decisión B7).

## 0.4.0 — 2026-11-19

Fase 4: procesamiento de datos.

### Agregado

- ETL de CSV, JSON y JSON Lines en `etl/`, con tres definiciones YAML validadas con Zod: el reporte oficial por municipio, personas simuladas y viviendas simuladas. Ver [ETL.md](docs/ETL.md).
- Lectores en flujo, con un separador propio para arreglos JSON y límites de 64 kB por registro de CSV y 1 MB por objeto JSON.
- Validación por campo de siete tipos, con marcadores de ausencia, normalizaciones documentadas, nueve motivos de rechazo y nueve reglas de negocio con efecto de alerta o de rechazo.
- Carga por lotes de 5.000 filas en una transacción por lote, con `COPY` a tablas `UNLOGGED`, idempotencia por huella SHA-256, reanudación desde la última fila confirmada y candados consultivos.
- Seudónimos HMAC-SHA256 para documentos y predios, con el nuevo secreto `SEUDONIMO_SECRETO`.
- Detección de duplicados exactos y probables, con bloques indexados en la base de datos y una cola de revisión en la que una persona decide.
- Agregados incrementales en `analitica.agregados` y el comando `npm run etl -- reagregar`, que los recalcula desde cero.
- Cola de cargas con un trabajador en otro proceso, que recupera las cargas interrumpidas.
- Los siete algoritmos en `backend/src/algorithms/`, con montículo, conjuntos disjuntos, trie y cola circular. Ver [ALGORITHMS.md](docs/ALGORITHMS.md).
- Generador de registros simulados con defectos conocidos y manifiesto: `npm run datos:registros`.
- Migraciones 0006 y 0007: esquema `staging`, catálogos de la clasificación, personas, viviendas y sus tablas hijas, filas rechazadas, cola de duplicados, agregados y vistas de población y viviendas con `GROUPING SETS` y `CUBE`.
- API privada: catálogo de conjuntos importables, subida de archivos, estado y filas rechazadas de cada carga, resumen de calidad de los registros, cola de duplicados y decisiones, estadísticas de población y de aseguramiento, y priorización con los pesos de `config/priorizacion.yml`.
- API pública: búsqueda de municipios por prefijo y la tendencia de cada indicador.
- Interfaz privada: formulario de importación con el avance de la carga, tabla de cargas con enlace a sus filas rechazadas, filas rechazadas con los identificadores ocultos y revisión de duplicados con sus decisiones.
- Mediciones: `npm run medir:algoritmos`, con el experimento de duplicación de los siete algoritmos, y `npm run medir:etl`, con un millón de filas en una base de datos aislada.
- Pruebas: 903 pruebas en 42 archivos. Las de carga crean su propia base de datos.
- Documentación: [proceso de carga](docs/ETL.md) y [algoritmos](docs/ALGORITHMS.md), con los diez puntos de cada algoritmo, sus alternativas y sus mediciones.

### Seguridad

- El número de documento no se guarda en ningún lugar: ni en los registros, ni en las filas rechazadas, ni en los mensajes de error.
- La cuenta de la aplicación puede encolar cargas y decidir sobre duplicados, pero no insertar, modificar ni borrar registros, ni borrar agregados. Esas escrituras solo las hace el trabajador del ETL con la cuenta dueña.
- La cuenta pública no puede leer registros individuales, agregados sin anonimizar, filas rechazadas ni la cola de duplicados.
- Los archivos subidos se guardan con un nombre aleatorio, y se borran si la subida se rechaza en cualquier paso.
- El trabajador solo abre archivos dentro de `data/` y `tests/fixtures/`.

### Cambiado

- La página de calidad reemplazó sus secciones «Disponible en la fase 4» por las filas rechazadas y la revisión de duplicados, y la de administración, su formulario de importación.
- El historial de cambios incluye las decisiones sobre personas y viviendas.
- Los conjuntos de datos se siembran desde las definiciones YAML.
- README, arquitectura, base de datos, API, interfaz, diccionario de datos y guía de contribución.

### Rendimiento

- Un millón de filas en 68,6 s: 14.576 filas por segundo y 259,6 MB de memoria máxima, con conteos exactos frente al manifiesto. El criterio era ≥ 10.000 filas por segundo y < 300 MB.
- Los trece experimentos de duplicación quedaron dentro del rango de su complejidad. Con un millón de registros, la detección de duplicados por bloques hace 632.827 comparaciones en lugar de 5 × 10¹¹, con exhaustividad del 100 %.

### Dependencias

- csv-parse 7.0.3, pg-copy-streams 7.0.0 y multer 2.5.0. Pruebas: fast-check 4.10.2.
- Frente a la propuesta: stream-json no se usó, porque su documentación advierte que no está pensado para entradas no confiables. El arreglo JSON se separa con un lector propio.
- `npm audit` informa tres hallazgos moderados en `glob` y `minimatch`, que trae node-pg-migrate 9.0.0. Solo afectan a la herramienta de migraciones, que lee archivos locales. Se revisarán en la fase 6.

## 0.3.0 — 2026-11-18

Fase 3: backend.

### Agregado

- PostgreSQL 18.7 en Docker Compose, publicado solo en `127.0.0.1:5433`, con un programa que crea las cuentas de la aplicación y de lectura.
- Cinco migraciones reversibles con los esquemas `seguridad`, `nucleo` y `analitica`, 24 tablas y 18 vistas analíticas.
- Semillas con las cifras oficiales de la fase 2, roles y permisos de `config/roles.yml` y cuatro usuarios de demostración fuera de producción.
- Comandos `db:migrate`, `db:rollback`, `db:seed`, `db:reset` y `usuarios:crear`.
- API REST pública de solo lectura con diez rutas, que el portal consume en lugar de los archivos JSON.
- Inicio y cierre de sesión con sesiones guardadas en PostgreSQL y contraseñas Argon2id.
- API privada: cinco consultas de administración, la edición auditada de fuentes y cuatro rutas de ingeniería.
- Páginas privadas reales. Administración: conjuntos, fuentes, explorador de registros con filtros y paginación, cargas e historial. Calidad: reglas de validación y campos vacíos. Ingeniería: estado del servidor y de la base de datos, recursos, rutas más consultadas, cargas, antigüedad de las fuentes, filas por tabla, errores, auditoría y accesos.
- Auditoría encadenada con SHA-256, con verificación de integridad desde el panel de ingeniería.
- Registro de cada intento de ingreso y de cada cierre de sesión.
- Métricas por patrón de ruta: promedio, percentil 95 y las diez rutas más frecuentes, elegidas con un montículo mínimo.
- Registros estructurados en JSON con pino.
- Pruebas automáticas: 502 pruebas en 23 archivos. Las de integración crean una base de datos de prueba desde cero en cada ejecución.
- Documentación: [arquitectura del backend](docs/ARCHITECTURE.md), [base de datos](docs/DATABASE.md) y [API REST](docs/API.md).

### Seguridad

- Tres cuentas de base de datos de privilegio mínimo. La API pública solo puede leer vistas.
- Autorización que niega por defecto, en la API y en las páginas privadas, con normalización de la dirección antes de decidir.
- Respuesta idéntica para correo inexistente, contraseña incorrecta y cuenta desactivada, con un tiempo de verificación uniforme.
- Cookie `HttpOnly` y `SameSite=Strict`, sesión regenerada al ingresar y permisos releídos en cada solicitud.
- Verificación del origen en los métodos que escriben, límites de solicitudes y de intentos de ingreso, cuerpo de hasta 20 kB y política de seguridad de contenido.
- Errores en formato RFC 9457 que no revelan detalles internos.

### Cambiado

- Las cifras oficiales pasaron de `frontend/public/datos/oficial/` a `database/seeds/oficial/`.
- Vitest se divide en dos proyectos: `unitarias`, que no necesita la base de datos, e `integracion`.
- La verificación de comentarios cubre también SQL, YAML y los programas de shell.
- README, guía de contribución, guía de la interfaz, diccionario de datos y cabecera de la propuesta técnica.

### Dependencias

- Backend: pg 8.23.1, node-pg-migrate 9.0.0, express-session 1.19.0, connect-pg-simple 10.0.0, argon2 0.45.2, helmet 8.3.0, express-rate-limit 8.7.4, zod 4.6.7, pino 10.4.0, pino-http 11.0.0 y yaml 2.9.1. Pruebas: supertest 7.3.2.
- Frente a la tabla de versiones de la propuesta: express-rate-limit es la 8.7.4 y no la 8.7.3, y pino-http se agregó para registrar las solicitudes. multer, csv-parse, stream-json, pg-copy-streams y fast-check llegan con el ETL y los algoritmos de la fase 4.

## 0.2.0 — 2026-11-17

Fase 2: diseño de interfaz.

### Agregado

- Portal público con diez páginas: panorama nacional, población, vivienda, economía, infraestructura, salud, educación, logística, mapa y metodología.
- Componentes reutilizables: marco con navegación adaptable, tarjeta de indicador, sello de origen, gráfica con tabla alternativa, tabla accesible y mapa de coropletas.
- Modos de datos oficiales y de demostración, con sello, borde y marca de agua en todo lo simulado.
- Maqueta del entorno privado: acceso, administración de datos, calidad de datos y panel de ingeniería.
- Descarga y normalización de la afectación por municipio y de los límites oficiales del DANE (`etl/`).
- Datos oficiales compilados: indicadores con su serie por fecha de corte, fuentes, seguros, economía y parámetros del sismo.
- Generador reproducible de datos simulados (`data/generador/`).
- Servidor de archivos con página de error.
- Pruebas automáticas: 213 pruebas en 8 archivos.
- Regla de ESLint y verificación para HTML y CSS que rechazan comentarios en el código.
- Documentación: guía de la interfaz, diccionario de datos y guía de contribución.
- Archivo `.env.example` y carga opcional de `.env`.

### Cambiado

- Propuesta técnica 0.2: corrige la afirmación de que no existían datos del sismo por municipio y marca como resueltas las decisiones aprobadas.

### Corregido

- El mapa, sus tablas y las gráficas por departamento mostraban «0» cuando la fuente no traía un valor. Ahora muestran «Sin dato».

## 0.1.0 — 2026-11-09

Fase 1: planeación y arquitectura.

### Agregado

- Propuesta técnica preliminar en veinte puntos (`docs/PROPUESTA_TECNICA.md`).
- Registro de fuentes y cifras verificadas (`docs/FUENTES_VERIFICADAS.md`).
- Configuración base del editor: extensiones recomendadas, ajustes, `.editorconfig` y `.gitignore`.
