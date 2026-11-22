# Verificación de los requisitos

Estado de cada requisito de la [propuesta técnica](PROPUESTA_TECNICA.md) al cierre de la fase 6, el 19 de noviembre de 2026, con la evidencia que lo respalda. «Cumple» significa que hay una prueba automática, una medición repetible o una revisión documentada. Lo que no se pudo verificar se dice.

## Contenido

1. [Resumen](#1-resumen)
2. [Requisitos no funcionales](#2-requisitos-no-funcionales)
3. [Requisitos funcionales](#3-requisitos-funcionales)
4. [Pendientes y decisiones abiertas](#4-pendientes-y-decisiones-abiertas)

## 1. Resumen

| Grupo | Cumple | Parcial | Pendiente |
|---|---:|---:|---:|
| No funcionales (19) | 17 | 2 | 0 |
| Funcionales (39) | 34 | 3 | 2 |

Pruebas al cierre: 1.126 en 64 archivos, todas en verde. Cobertura del código medido: 93,8 % de líneas, 87,8 % de ramas y 93,9 % de funciones.

## 2. Requisitos no funcionales

| ID | Requisito | Estado | Evidencia |
|---|---|---|---|
| RNF-01 | p95 de 300 ms o menos con un millón de registros | Cumple | `npm run medir:api`: entre 0,1 y 63,8 ms en las 12 rutas públicas con 984.939 personas y 50.000 viviendas. La primera medición encontró tres rutas por encima del límite y se corrigió una vista. Ver [RENDIMIENTO.md](RENDIMIENTO.md#2-api-pública-con-un-millón-de-registros). |
| RNF-02 | ETL de 10.000 filas por segundo o más y menos de 300 MB | Cumple | `npm run medir:etl`: 14.576 filas por segundo y 259,6 MB con un millón de filas. |
| RNF-03 | Ningún algoritmo de recorrido completo supera O(n log n) | Cumple | `npm run medir:algoritmos`: 13 de 13 experimentos dentro de su rango. Ver [ALGORITHMS.md](ALGORITHMS.md#resumen-de-resultados). |
| RNF-04 | Argon2id y SQL parametrizado | Cumple | Revisión de las 30 plantillas SQL con valores interpolados: solo constantes o identificadores validados. Intentos de inyección en `administracion.test.js`, `ingenieria.test.js` e `inteligencia.test.js`. Ver [SEGURIDAD.md](SEGURIDAD.md). |
| RNF-05 | Sin acceso privado sin sesión y rol | Cumple | `autorizacion.test.js` prueba cada ruta privada con cada rol y sin sesión; también las páginas privadas. |
| RNF-06 | Ningún dato personal ni celda de menos de 10 en el portal | Cumple | `inteligencia.test.js` recorre cada número de las rutas de registros y de indicadores clave: ninguno entre 1 y 9, y ninguna partición o cruce con una sola celda oculta. `contrato.test.js` comprueba que ninguna respuesta pública trae campos de datos personales. Las cifras oficiales se reproducen como las publica cada entidad; la regla de 10 se aplica a lo que se calcula con registros individuales. |
| RNF-07 | Fuente, fecha de corte y origen en cada indicador | Cumple | Restricciones `NOT NULL` en la base de datos y `contrato.test.js`, que revisa cada punto de las series, cada partida económica, el reporte de seguros y cada parte de los indicadores clave oficiales. |
| RNF-08 | Un error en un lote no deja datos a medias | Cumple | Transacción por lote y reanudación desde la última fila confirmada, probadas en `etl.test.js`. |
| RNF-09 | Lenguaje claro, glosario y tres clics como máximo | Cumple | Glosario de 10 términos en la página de metodología. Cualquier indicador está a dos clics: el menú y la página del módulo. Revisión manual. |
| RNF-10 | WCAG 2.1 AA | Cumple en lo verificado | `contraste.test.js`: 17 pares de colores de texto con 4,5:1 o más. En las 15 páginas: cada gráfica con datos tiene su tabla, cada control tiene nombre accesible, un solo `h1`, enlace para saltar al contenido y foco visible. No se hizo una prueba con lector de pantalla, y la herramienta de automatización no puede abrir el menú nativo de un selector. |
| RNF-11 | Funciona entre 360 y 1.920 píxeles | Cumple | Las 11 páginas públicas y las 4 privadas, sin desplazamiento horizontal a 360 y a 1.920 píxeles. |
| RNF-12 | Capas separadas y sin comentarios | Cumple | ESLint con la regla propia `andes/sin-comentarios` y `scripts/verificar-comentarios.js` para HTML, CSS, SQL, YAML, DAX y shell. |
| RNF-13 | Cobertura de 90 % en algoritmos y 70 % en el resto | Cumple | `npm run test:cobertura`, que falla por debajo de los umbrales: algoritmos 98,0 % de líneas y 95,0 % de ramas; el resto del código medido, 93,8 % de líneas. Las líneas sin medir (programas de línea de comandos, descargas de internet y pantallas que se revisan en el navegador) son 1.239; contándolas como no cubiertas, el proyecto completo queda en 73 % de líneas. |
| RNF-14 | macOS, Windows y Linux | Parcial | Node.js 24, Docker Compose y scripts escritos en Node, sin comandos propios de un sistema. Solo se ejecutó en macOS. |
| RNF-15 | Documentación en Markdown y contrato en YAML | Cumple | Los documentos de `docs/` y [`docs/openapi.yml`](openapi.yml). `openapi.test.js` comprueba que el contrato tiene exactamente las 37 rutas del servidor y `contrato.test.js`, que las 14 respuestas públicas cumplen su esquema. |
| RNF-16 | Registro estructurado con duración | Cumple | pino y pino-http en JSON, y métricas por ruta en el panel de ingeniería. |
| RNF-17 | JSON, CSV y conexión con Power BI | Parcial | JSON en la API, CSV en las descargas del portal y en la exportación del modelo. La conexión desde Power BI Desktop no se comprobó: necesita Windows (decisión B7). |
| RNF-18 | Formato de Colombia | Cumple | `formato.test.js`: números, pesos y fechas con `es-CO` y la zona horaria `America/Bogota`. |
| RNF-19 | Funciona sin internet | Cumple | Ninguna de las 15 páginas pide recursos a otro sitio: bibliotecas, fuente tipográfica y geometrías salen del propio servidor. |

## 3. Requisitos funcionales

| ID | Requisito | Estado | Dónde |
|---|---|---|---|
| RF-01 | Dashboard con los doce indicadores generales | Cumple | Panorama nacional. Los que no tienen cifra oficial dicen «Información no disponible». |
| RF-02 | Valor, unidad, descripción, fuente, fecha de corte, variación y sello | Cumple | Componente `andes-indicador` |
| RF-03 | «Información no disponible» sin cifra oficial | Cumple | Todas las páginas |
| RF-04 | Modo oficial y modo de demostración | Cumple | Selector de la cabecera |
| RF-05 | Segmentación de la población | Cumple | Página de población, con los registros de la base desde la fase 5 |
| RF-06 | Cuatro variables independientes de vivienda | Cumple | Página de vivienda y cruces |
| RF-07 | Las nueve preguntas de vivienda | Cumple | Tabla de la página de vivienda |
| RF-08 | Mapa con ficha de cada territorio | Cumple | Página del mapa |
| RF-09 | Filtros y búsqueda de municipios con autocompletado | Cumple | Mapa: indicador, departamento y municipio, con buscador sobre el trie del algoritmo 5 (fase 6). El periodo se compara entre los cortes de los indicadores nacionales en `/comparar`; el reporte municipal tiene un solo corte. |
| RF-10 | Computadores, tabletas y celulares | Cumple | Ver RNF-11 |
| RF-11 | Daños, pérdidas, costos y recursos | Cumple | Página de economía |
| RF-12 | Infraestructura afectada | Cumple | Página de infraestructura |
| RF-13 | Indicadores de salud | Cumple | Página de salud, con datos simulados donde no hay fuente |
| RF-14 | Indicadores de educación | Cumple | Página de educación |
| RF-15 | Suministros y albergues | Cumple | Página de logística, con datos simulados |
| RF-16 | Metodología, fuentes, glosario y descargas en CSV y JSON | Cumple | Página de metodología. El CSV de indicadores y de municipios llegó en la fase 6. |
| RF-17 | Importar CSV y JSON por lotes | Cumple | ETL y entorno privado |
| RF-18 | Conjuntos definidos en YAML | Cumple | `etl/definiciones/` |
| RF-19 | Validar y guardar las filas rechazadas | Cumple | `staging.filas_rechazadas` |
| RF-20 | Duplicados exactos y probables con revisión | Cumple | Página de calidad |
| RF-21 | Procedencia de cada dato | Cumple | Fuente, carga, fecha de captura y nivel en cada registro |
| RF-22 | Serie histórica por fecha de corte | Cumple | `analitica.valores_indicador` |
| RF-23 | Reimportar no duplica | Cumple | Huella SHA-256, probada en `etl.test.js` y `reportes.test.js` |
| RF-24 | Extraer datos de datos.gov.co con paginación | Parcial | Hay un extractor paginado del servicio geográfico del DANE. No hay extractor de datos.gov.co: el conjunto de emergencias de la UNGRD solo llega a 2025, y las mediciones de contratación de SECOP se consultaron a mano y están en las semillas. |
| RF-25 | Autenticación y autorización por rol | Cumple | Ver RNF-05 |
| RF-26 | Consultar registros con filtros y paginación | Cumple | Página de administración |
| RF-27 | Gestionar conjuntos y fuentes | Cumple | Página de administración, con edición auditada de las fuentes |
| RF-28 | Reporte de calidad | Cumple | Página de calidad |
| RF-29 | Panel de ingeniería | Cumple | Página de ingeniería |
| RF-30 | Auditoría y registro de accesos | Cumple | Auditoría encadenada con hash |
| RF-31 | Priorización con pesos configurables | Cumple | Laboratorio de priorización (fase 5) |
| RF-32 | Editar registros con historial | Pendiente | Un registro solo cambia por una decisión sobre duplicados, que queda en la auditoría. No hay edición manual. |
| RF-33 | Administrar usuarios y roles | Parcial | `npm run usuarios:crear` crea y actualiza usuarios con Argon2id; los roles y permisos están en `config/roles.yml`. No hay pantalla. |
| RF-34 | Siete algoritmos con pruebas | Cumple | `backend/src/algorithms/` |
| RF-35 | Vistas en estrella y rol de Power BI | Cumple | Esquema `bi` y `powerbi_lector` |
| RF-36 | Medir los algoritmos con tamaños crecientes | Cumple | Ver RNF-03 |
| RF-37 | Exportar el modelo en estrella a CSV | Cumple | `npm run bi:exportar` |
| RF-38 | Informe de Power BI con medidas DAX | Parcial | 40 medidas DAX revisadas contra el modelo, consulta para crearlas y guía de conexión. Falta el archivo `.pbix` (decisión B7). |
| RF-39 | Agregación con Apache Spark | Pendiente | Prioridad baja. La propuesta (sección 9.3) explica por qué Spark no hace falta con este volumen. |

## 4. Pendientes y decisiones abiertas

- **B7, Power BI.** Sin un equipo con Windows no hay archivo `.pbix` ni conexión comprobada (RF-38 y RNF-17). Las opciones están en [POWERBI.md](POWERBI.md#11-limitaciones-y-decisiones-pendientes).
- **B6, calendario.** Sigue abierta: hace falta la fecha de entrega y el número de integrantes.
- **B8, carpeta definitiva y repositorio.** La carpeta y el repositorio Git local quedaron listos el 19 de noviembre de 2026, con el primer commit. Falta decidir si se publica en un repositorio remoto.
- **RF-32 y RF-33.** Edición manual de registros y pantalla de usuarios, de prioridad media.
- **RF-24 y RF-39.** Extractor de datos.gov.co y prueba con Spark, de prioridad media y baja.
- **RNF-14.** Ejecutar la instalación y las pruebas en Windows y en Linux.
