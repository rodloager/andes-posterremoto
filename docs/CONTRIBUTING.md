# Guía de contribución

Cómo trabajar en ANDES sin romper sus reglas. Para instalar y ejecutar el proyecto, ver el [README](../README.md).

## 1. Flujo de trabajo con Git

- La rama `main` siempre debe funcionar: pruebas aprobadas y sin hallazgos de lint.
- Cada tarea se hace en una rama corta que parte de `main`. El nombre empieza por el tipo de cambio, por ejemplo `feat/dashboard-nacional` o `fix/agregacion-viviendas`.
- Un commit contiene un solo cambio lógico. Su mensaje empieza por el tipo y describe el cambio en una línea.

| Tipo | Uso | Ejemplo |
|---|---|---|
| `feat` | Funcionalidad nueva | `feat: implement national dashboard` |
| `fix` | Corrección de un error | `fix: correct housing aggregation` |
| `refactor` | Cambio interno sin cambio de comportamiento | `refactor: optimize database queries` |
| `docs` | Documentación | `docs: update architecture documentation` |
| `test` | Pruebas | `test: add algorithm unit tests` |

- Cada entrega se resume en el [registro de cambios](../CHANGELOG.md).
- No se versionan el archivo `.env`, `node_modules/`, `frontend/public/vendor/`, que `npm install` vuelve a copiar, ni las copias sin procesar de `data/raw/`. La excepción es `data/raw/dane-afectaciones/`: pesa menos de 1 MB, es la evidencia de la fuente oficial y la usa la prueba de la carga del reporte municipal.

## 2. Antes de cada commit

```bash
npm run lint
```

```bash
npm test
```

```bash
npm run format:check
```

Los tres deben terminar sin errores. `npm run format` corrige el formato de forma automática. `npm test` incluye las pruebas de integración, que necesitan PostgreSQL en marcha (`docker compose up -d`).

## 3. Reglas de código

| Regla | Cómo se cumple |
|---|---|
| Sin comentarios en el código fuente | La regla `andes/sin-comentarios` de ESLint los rechaza en JavaScript, y `scripts/verificar-comentarios.js` en HTML, CSS, SQL, YAML y los programas de shell. Las explicaciones van en `docs/`. |
| Nombres descriptivos | Funciones y variables dicen qué hacen o qué contienen. Lo que pertenece al dominio se nombra en español. |
| Carpetas técnicas en inglés | Se conservan los nombres de la estructura acordada, como `frontend`, `backend` o `tests`. |
| Funciones pequeñas | Una función hace una cosa. Si necesita una explicación, se divide o se renombra. |
| Separación de responsabilidades | Las páginas no calculan indicadores, los componentes no cargan datos y las utilidades de `nucleo/` no tocan la interfaz. |
| Colores solo en `tokens.css` | Ningún otro archivo declara un color. |
| Sin dependencias de internet en el navegador | Las bibliotecas se copian a `frontend/public/vendor/` con `npm install`. |
| Capas del backend | Las rutas declaran validación y permiso, los controladores traducen, los servicios deciden y solo los repositorios escriben SQL. Ver [ARCHITECTURE.md](ARCHITECTURE.md). |
| SQL parametrizado | Ningún valor de la solicitud se concatena en una consulta. Si un nombre de columna depende de la solicitud, sale de una lista fija. |
| Toda entrada se valida | Cada ruta declara un esquema Zod estricto para sus parámetros, su consulta y su cuerpo. |
| Toda ruta privada declara su permiso | Con `exigirPermiso`. Una página privada nueva se agrega también a `PERMISO_POR_PAGINA` en `middlewares/paginasPrivadas.js`, o responde 404. |

## 4. Reglas de datos

- Toda cifra cita una fuente de `database/seeds/oficial/fuentes.json`. Una prueba automática rechaza las cifras sin fuente, y la base de datos rechaza las cifras oficiales atribuidas a una fuente simulada.
- Las cifras de entidades o fechas distintas no se suman ni se promedian.
- Un dato simulado nunca reemplaza una cifra oficial y nunca se mezcla con ella en un mismo indicador.
- Un valor ausente se guarda como ausente, no como cero.
- No se publican datos de personas ni de viviendas individuales.
- Un campo que identifica a una persona o un predio se marca con `seudonimizar: true` en la definición YAML. Nunca se guarda en claro, ni en las filas rechazadas ni en los mensajes de error.

El [diccionario de datos](DATA_DICTIONARY.md) describe cada archivo, y la [guía de la interfaz](FRONTEND.md) explica cómo agregar un indicador, una gráfica o una página.

## 5. Cambios en la base de datos

- Una migración aplicada no se edita. Cada cambio es una pareja nueva de archivos en `database/migrations/`, con el número siguiente: `NNNN_descripcion.up.sql` y `NNNN_descripcion.down.sql`.
- La migración de bajada deja la base de datos exactamente como estaba. Antes de entregarla se comprueba la secuencia completa: `npm run db:reset`.
- Una tabla nueva declara en la misma migración qué puede hacer cada cuenta. Lo que no se concede expresamente queda negado.
- Si una cifra oficial cambia, se corrige su semilla en `database/seeds/oficial/` y se vuelve a ejecutar `npm run db:seed`.

## 6. Pruebas

| Carpeta | Qué prueba |
|---|---|
| `tests/unit/algoritmos/` | Los siete algoritmos y sus estructuras de datos, con pruebas de propiedades de fast-check |
| `tests/unit/backend/` | Métricas, configuración, validación, errores, protección de páginas, servicios de estadísticas, indicadores clave y registros, supresión de celdas, pesos de la priorización, nombre seguro de los archivos subidos y el contrato OpenAPI frente a las rutas del servidor |
| `tests/unit/frontend/` | Formato, cálculo de indicadores, indicadores clave, comparación, archivos CSV, clasificación del mapa, utilidades territoriales, navegación privada, pesos del laboratorio, escape de HTML, contraste de los colores y cliente de la API |
| `tests/unit/interfaz/` | Construcción del DOM, tablas, figuras, sellos, tarjetas de indicadores clave, constructores de gráficas, buscador de municipios, modo de datos y carga del contexto. Corren con happy-dom, un DOM simulado. |
| `tests/unit/etl/` | Afectación por municipio, lectores de CSV y JSON, validación de campos, reglas de negocio, seudónimos y ocultamiento, definiciones YAML y mensajes de carga |
| `tests/unit/analitica/` | Las funciones del experimento de duplicación, el lector de medidas DAX y el generador de gráficas |
| `tests/unit/generador/` | Reproducibilidad y coherencia de los datos simulados y del generador de registros con su manifiesto |
| `tests/unit/datos/` | Integridad de las semillas: fuentes, sumas, códigos y fechas |
| `tests/integration/` | La API, la sesión, los permisos y la base de datos, contra PostgreSQL real |

Las pruebas de integración crean la base de datos `andes_pruebas` desde cero en cada ejecución, con las migraciones y semillas reales, y nunca tocan la base de datos de desarrollo. Las pruebas que modifican datos los restauran al terminar.

Las pruebas que cargan archivos crean su propia base de datos con `prepararBaseAislada('sufijo')` de `tests/integration/apoyo.js`, para que sus registros no cambien los conteos de las demás. Los archivos de prueba con errores conocidos van en `tests/fixtures/etl/`, y los archivos subidos durante una prueba van a `tests/fixtures/cargas-temporales/`, que no se versiona y la prueba borra al terminar.

`npm run test:unitarias` corre los proyectos `unitarias` e `interfaz`, sin base de datos. `npm run test:cobertura` corre todo y falla si la cobertura baja de 70 % en el código medido o de 90 % en `backend/src/algorithms/` (RNF-13); el informe queda en `coverage/`. Las pantallas que construyen páginas completas, los programas de línea de comandos y las descargas de internet están fuera de la medición y se revisan en el navegador o a mano. Ver [VERIFICACION.md](VERIFICACION.md).

Una ruta nueva de la API también va en [`docs/openapi.yml`](openapi.yml): `openapi.test.js` falla si el contrato y el servidor no tienen exactamente las mismas rutas, y `contrato.test.js` compara las respuestas públicas con su esquema.

Para medir el rendimiento:

| Comando | Qué mide |
|---|---|
| `npm run medir:algoritmos` | El experimento de duplicación de los siete algoritmos, en unos dos minutos. Ver [ALGORITHMS.md](ALGORITHMS.md#cómo-se-midió). |
| `npm run medir:etl` | El ETL con un millón de filas en la base de datos aislada `andes_medicion`. Ver [ETL.md](ETL.md#12-rendimiento). |
| `npm run medir:api` | El percentil 95 de cada ruta pública con un millón de registros, en la base aislada `andes_medicion_api`. Ver [RENDIMIENTO.md](RENDIMIENTO.md). |
| `npm run medir:consultas` | Los planes de consulta con y sin índices, con `EXPLAIN ANALYZE`, sobre esa misma base |
| `npm run medir:graficas` | Dibuja las gráficas de `docs/graficas/` a partir de los resultados |

Antes de medir conviene cerrar otros programas y conectar el equipo a la corriente.

Cada prueba nueva cubre tres clases de casos: el normal, los extremos, como listas vacías o ceros, y los datos incorrectos, como textos donde se esperan números o fechas imposibles.

## 7. Documentación

- Toda decisión, explicación o cambio de diseño se documenta en `docs/`.
- Si un cambio afecta una cifra publicada, se actualiza también [FUENTES_VERIFICADAS.md](FUENTES_VERIFICADAS.md).
