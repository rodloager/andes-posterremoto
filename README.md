# ANDES — Analítica Nacional de Datos para Emergencias Sísmicas

Plataforma de Big Data e Inteligencia de Negocios para la gestión de información posterremoto en Colombia. Proyecto académico de la asignatura Análisis de Algoritmos, centrado en el sismo de magnitud 7,4 del 10 de agosto de 2026, con epicentro en San José del Palmar (Chocó).

> ANDES no es un sistema oficial y no reemplaza los canales de la Unidad Nacional para la Gestión del Riesgo de Desastres (UNGRD).

## Estado

| Fase | Contenido | Estado |
|---|---|---|
| 1. Planeación y arquitectura | Propuesta técnica y registro de fuentes | Terminada y aprobada |
| 2. Diseño de interfaz | Portal público, componentes, mapa y maqueta del entorno privado | Terminada |
| 3. Backend | PostgreSQL, API REST, autenticación y roles | Terminada |
| 4. Procesamiento de datos | ETL de CSV y JSON, los siete algoritmos y las consultas estadísticas | Terminada |
| 5. Inteligencia de negocios | Indicadores clave, visualizaciones conectadas a los registros, comparación, modelo en estrella, Power BI y laboratorio de priorización | Terminada. El informe `.pbix` espera la decisión B7. |
| 6. Calidad y documentación | Mediciones con un millón de registros, optimización de consultas, revisión de seguridad, cobertura, contrato OpenAPI y verificación de cada requisito | Terminada. 17 de 19 requisitos no funcionales cumplen; 2 son parciales. |

### Qué funciona hoy

- **Portal público** con once páginas: panorama nacional, población, vivienda, economía, infraestructura, salud, educación, logística, mapa, comparación y metodología.
- **Cifras oficiales reales**, cada una con su entidad, su fecha de corte y su nivel de confiabilidad.
- **Afectación por municipio** descargada del servicio geográfico del DANE: 498 municipios con reporte en 16 departamentos.
- **Mapa interactivo** con los límites oficiales del DANE, por departamento y por municipio, y un buscador de municipios con autocompletado.
- **Dos modos de consulta.** El modo de datos oficiales muestra «Información no disponible» donde no hay cifra. El modo de demostración agrega datos simulados, marcados como tales en cada tarjeta y gráfica.
- **Base de datos PostgreSQL** con tres esquemas, migraciones versionadas y tres cuentas de privilegio mínimo.
- **API REST**: el portal lee las cifras oficiales de la API, que solo puede consultar vistas de lectura.
- **Entorno privado con sesión**: administración de datos, calidad de datos, laboratorio de priorización y panel de ingeniería, con cuatro roles y siete permisos.
- **Auditoría encadenada con hash** y registro de cada intento de acceso.
- **Importación de archivos CSV, JSON y JSON Lines** desde el entorno privado. Cada fila se valida, las rechazadas se guardan con su motivo y el avance se ve en la pantalla. Un millón de filas se cargan a más de 14.000 filas por segundo.
- **Documentos seudonimizados** con HMAC-SHA256. El número de documento nunca se guarda, ni siquiera en las filas rechazadas.
- **Detección de duplicados** exactos y probables, con una cola de revisión en la que una persona decide si dos registros son el mismo.
- **Los siete algoritmos** del proyecto, probados y medidos con un experimento de duplicación: clasificación, agregación, duplicados, priorización, búsqueda, tendencias y aseguramiento.
- **Consultas estadísticas** de población y aseguramiento por territorio, priorización de municipios con su desglose y búsqueda de municipios por nombre.
- **Trece indicadores clave** definidos en `config/kpi.yml`: ocho con cifras oficiales, con su calificador, sus fuentes y su variación entre cortes, y cinco con los registros simulados.
- **Visualizaciones conectadas a la base de datos**: en modo de demostración, las páginas de población y vivienda leen los registros cargados por el ETL, no archivos fijos.
- **Ninguna cifra pública calculada con los registros reúne menos de 10 de ellos.** Las celdas pequeñas se ocultan y, cuando hace falta, también una segunda celda para que la primera no se pueda despejar con una resta. Una prueba automática lo comprueba.
- **Comparación** de dos departamentos lado a lado, ranking por variable y cambio de los balances nacionales entre cortes.
- **Laboratorio de priorización** en el entorno privado: pesos ajustables, aporte de cada criterio al puntaje y cambio de puesto frente a los pesos configurados.
- **Modelo en estrella para Power BI** en el esquema `bi`, con una cuenta de solo lectura, 40 medidas DAX y exportación a CSV. Ver [POWERBI.md](docs/POWERBI.md).
- **Rápido con un millón de registros**: el percentil 95 de las rutas públicas está entre 0,1 y 64 ms, lejos del límite de 300 ms. Ver [RENDIMIENTO.md](docs/RENDIMIENTO.md).
- **Verificado**: 1.126 pruebas, cobertura de 94 % en el código medido, contrato OpenAPI comprobado contra el servidor y una matriz con la evidencia de cada requisito. Ver [VERIFICACION.md](docs/VERIFICACION.md).

### Qué falta

- El archivo `.pbix` de Power BI necesita un equipo con Windows (decisión B7); las medidas, la conexión y la exportación ya están listas.
- Cuatro requisitos funcionales de prioridad media o baja: la edición manual de registros (RF-32), una pantalla de usuarios (RF-33), un extractor de datos.gov.co (RF-24) y la prueba con Spark (RF-39).
- Ejecutar la instalación y las pruebas en Windows y en Linux.

El detalle está en [VERIFICACION.md](docs/VERIFICACION.md#4-pendientes-y-decisiones-abiertas).

## Requisitos

| Herramienta | Versión | Para qué |
|---|---|---|
| Node.js | 24 o superior | Servidor, programas de datos y pruebas |
| npm | La que trae Node.js | Dependencias y comandos |
| Visual Studio Code | Cualquiera reciente | Editor recomendado |
| Docker Desktop | 29 o superior | PostgreSQL 18 sin instalación manual |

## Instalación y ejecución

1. Obtén el proyecto: copia esta carpeta o, cuando exista el repositorio, clónalo.
2. Instala las dependencias. El mismo comando copia las bibliotecas del navegador a `frontend/public/vendor/`, de modo que el portal funciona sin internet.

   ```bash
   npm install
   ```

3. Crea tu archivo de configuración a partir del ejemplo. En Windows, usa `Copy-Item .env.example .env` en PowerShell.

   ```bash
   cp .env.example .env
   ```

4. Reemplaza en `.env` cada valor que empieza por `cambia-`. Este comando genera un valor aleatorio adecuado; ejecútalo una vez por cada clave y por cada secreto:

   ```bash
   node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
   ```

5. Abre Docker Desktop y levanta PostgreSQL. La primera vez descarga la imagen y crea las cuentas de la base de datos.

   ```bash
   docker compose up -d
   ```

6. Crea las tablas y carga los datos.

   ```bash
   npm run db:migrate
   ```

   ```bash
   npm run db:seed
   ```

   Para el modo de demostración, carga además registros simulados. Tarda menos de un minuto.

   ```bash
   npm run datos:demostracion
   ```

7. Inicia el servidor de desarrollo. Se reinicia solo cuando cambias el código del servidor.

   ```bash
   npm run dev
   ```

8. Abre <http://localhost:3000>. El entorno privado está en <http://localhost:3000/privado/>.

### Usuarios de demostración

`npm run db:seed` crea cuatro cuentas, una por rol, cuando el entorno no es de producción. Todas usan como contraseña el valor de `CLAVE_USUARIOS_DEMO` de tu archivo `.env`.

| Correo | Rol | Ve |
|---|---|---|
| `analisis@andes.test` | Analista | Administración y calidad de datos, en modo de lectura, y el laboratorio de priorización |
| `datos@andes.test` | Administrador de datos | Administración y calidad de datos. Puede editar las fuentes, importar archivos y decidir sobre los duplicados. |
| `ingenieria@andes.test` | Ingeniero | Las tres secciones, incluidos la auditoría y el registro de accesos |
| `superadministrador@andes.test` | Superadministrador | Todo |

Para crear una cuenta real, con una contraseña aleatoria que se muestra una sola vez:

```bash
npm run usuarios:crear -- --correo persona@entidad.gov.co --nombre "Nombre Apellido" --rol analista
```

### Configuración

La configuración se lee de variables de entorno. El servidor las valida al arrancar y se detiene con un mensaje claro si falta alguna. El archivo `.env` no se versiona.

| Variable | Valor por defecto | Descripción |
|---|---|---|
| `PUERTO` | 3000 | Puerto del servidor |
| `BD_HOST` | 127.0.0.1 | Servidor de PostgreSQL |
| `BD_PUERTO` | 5433 | Puerto de PostgreSQL. No es el 5432, para no chocar con otra instalación. |
| `BD_NOMBRE` | andes | Nombre de la base de datos |
| `BD_PROPIETARIO_CLAVE` | | Clave de la cuenta dueña del esquema. La usan Docker, las migraciones y las semillas. |
| `BD_APP_CLAVE` | | Clave de la cuenta de la API privada |
| `BD_LECTOR_CLAVE` | | Clave de la cuenta de solo lectura de la API pública |
| `SESION_SECRETO` | | Firma las cookies de sesión. Mínimo 32 caracteres. |
| `CLAVE_USUARIOS_DEMO` | | Contraseña de los usuarios de demostración. Mínimo 12 caracteres. |
| `PROXIES_DE_CONFIANZA` | 0 | Número de proxies delante del servidor. Detrás de un proxy con HTTPS, 1. Ver [SEGURIDAD.md](docs/SEGURIDAD.md#4-antes-de-un-despliegue-real). |
| `BD_POWERBI_CLAVE` | | Clave de la cuenta de solo lectura de Power BI. Mínimo 16 caracteres. Opcional: solo la usan `npm run bi:cuenta` y `npm run bi:exportar`. |
| `SEUDONIMO_SECRETO` | | Secreto del HMAC con el que se seudonimizan los documentos. Mínimo 32 caracteres. Sin él, el ETL no carga datos con documentos. **Si cambia, los seudónimos nuevos no coinciden con los anteriores** y la detección de duplicados exactos deja de funcionar entre cargas. |

### Problemas frecuentes

| Síntoma | Causa y solución |
|---|---|
| El servidor no arranca y dice «La configuración del entorno no es válida» | Falta una variable en `.env` o tiene un formato inválido. El mensaje nombra la variable. |
| El portal muestra un error de carga y `/api/v1/estado` informa la base de datos como no disponible | PostgreSQL no está en marcha. Abre Docker Desktop y ejecuta `docker compose up -d`. |
| `password authentication failed` después de cambiar las claves en `.env` | Las cuentas se crean con las claves que había la primera vez que se levantó el contenedor. Borra el volumen con `docker compose down --volumes` y repite los pasos 5 y 6. Se pierden los datos, que la semilla vuelve a cargar, y también la auditoría. |
| `docker compose up` dice que el puerto está ocupado | Otro programa usa el 5433. Cambia `BD_PUERTO` en `.env`. |
| Las pruebas de integración fallan con `ECONNREFUSED` | PostgreSQL no está en marcha. Las pruebas unitarias funcionan sin él: `npm run test:unitarias`. |
| Una carga queda «En cola» y no avanza | El servidor no lanzó el trabajador del ETL porque falta `BD_PROPIETARIO_CLAVE` o `SEUDONIMO_SECRETO` en `.env`. Complétalos y reinicia el servidor, o procesa la cola a mano con `npm run etl -- trabajar`. |

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Inicia el servidor y lo reinicia al cambiar el código |
| `npm start` | Inicia el servidor |
| `npm test` | Ejecuta todas las pruebas automáticas. Las de integración necesitan PostgreSQL en marcha. |
| `npm run test:unitarias` | Ejecuta solo las pruebas que no usan la base de datos |
| `npm run test:integracion` | Crea la base de datos `andes_pruebas` desde cero y prueba la API contra ella |
| `npm run test:cobertura` | Ejecuta todas las pruebas con cobertura y falla si baja de los umbrales de RNF-13. El informe queda en `coverage/`. |
| `npm run db:migrate` | Aplica las migraciones pendientes |
| `npm run db:rollback` | Revierte la última migración |
| `npm run db:seed` | Vuelve a cargar los datos y los usuarios de demostración |
| `npm run db:reset` | Revierte todas las migraciones, las aplica de nuevo y siembra |
| `npm run usuarios:crear` | Crea o actualiza un usuario con una contraseña aleatoria |
| `npm run lint` | Revisa el código y verifica que no tenga comentarios |
| `npm run format` | Aplica el formato del proyecto |
| `npm run format:check` | Comprueba el formato sin modificar archivos |
| `npm run datos:afectaciones` | Descarga la afectación por municipio del servicio del DANE |
| `npm run datos:limites` | Descarga los límites de departamentos y municipios del DANE |
| `npm run datos:simular` | Regenera los datos simulados de demostración |
| `npm run datos:registros -- --tipo personas --cantidad 100000` | Genera registros simulados con defectos conocidos para el ETL, con su manifiesto |
| `npm run etl -- conjuntos` | Lista los conjuntos de datos que el ETL sabe cargar |
| `npm run etl -- cargar --conjunto personas-simuladas --archivo ruta.csv` | Carga un archivo sin pasar por la cola |
| `npm run etl -- trabajar` | Procesa las cargas en cola |
| `npm run etl -- reagregar` | Recalcula las estadísticas agregadas desde los registros |
| `npm run datos:demostracion` | Genera y carga 50.000 personas y 50.000 viviendas simuladas para el modo de demostración |
| `npm run bi:cuenta` | Activa la cuenta de Power BI con la clave de `BD_POWERBI_CLAVE` y comprueba que lee el modelo |
| `npm run bi:exportar` | Exporta las 21 vistas del modelo en estrella a CSV, con su manifiesto y la consulta de medidas DAX |
| `npm run medir:algoritmos` | Mide los siete algoritmos con un experimento de duplicación |
| `npm run medir:etl` | Mide el ETL con un millón de filas en una base de datos aislada |
| `npm run medir:api` | Mide el percentil 95 de cada ruta pública con un millón de registros |
| `npm run medir:consultas` | Compara los planes de consulta con y sin índices sobre esa misma base |
| `npm run medir:graficas` | Dibuja las gráficas de `docs/graficas/` con los resultados de las mediciones |
| `npm run vendor` | Vuelve a copiar las bibliotecas del navegador |

Los comandos `datos:afectaciones` y `datos:limites` necesitan internet. El primero guarda además una copia sin procesar en `data/raw/`, con la fecha de la descarga.

## Estructura

| Carpeta | Contenido |
|---|---|
| `frontend/public/` | Portal ciudadano: páginas, estilos, componentes, límites del mapa y datos simulados |
| `frontend/private/` | Entorno privado: acceso, administración, calidad de datos e ingeniería |
| `backend/` | Servidor y API: configuración, rutas, controladores, servicios, repositorios, middlewares y algoritmos |
| `database/` | Migraciones, semillas con las cifras oficiales y comandos de la base de datos |
| `config/` | Roles y permisos, criterios y pesos de la priorización, e indicadores clave |
| `etl/` | Definiciones YAML, lectores, validación, carga por lotes, duplicados, agregados, cola y trabajador. También la descarga de los datos del DANE. |
| `data/generador/` | Generador de datos simulados y de registros con defectos conocidos |
| `data/uploads/` | Archivos subidos desde el entorno privado. No se versionan. |
| `analytics/benchmarks/` | Mediciones de los algoritmos y del ETL, con sus resultados |
| `analytics/powerbi/` | Medidas DAX, lector de medidas y exportación del modelo en estrella. Los CSV exportados no se versionan. |
| `data/raw/` | Copias sin procesar de cada descarga y archivos del generador |
| `tests/` | Pruebas unitarias y de integración |
| `scripts/` | Copia de bibliotecas y verificación de comentarios |
| `docs/` | Documentación del proyecto |

## Documentación

| Documento | Contenido |
|---|---|
| [Propuesta técnica](docs/PROPUESTA_TECNICA.md) | Problema, requerimientos, arquitectura, modelo de datos, algoritmos, fuentes, Power BI, plan y riesgos |
| [Fuentes verificadas](docs/FUENTES_VERIFICADAS.md) | Cada fuente y cada cifra consultada, con su enlace, su fecha y cómo se verificó |
| [Interfaz](docs/FRONTEND.md) | Organización del portal, componentes, modos de datos, cómo ampliarlo y verificación |
| [Arquitectura del backend](docs/ARCHITECTURE.md) | Capas, recorrido de una solicitud, sesiones, permisos, protecciones, métricas y verificación |
| [Base de datos](docs/DATABASE.md) | Esquemas, cuentas y privilegios, tablas, vistas, integridad, auditoría y migraciones |
| [API REST](docs/API.md) | Cada ruta con sus parámetros, respuestas y errores |
| [Proceso de carga](docs/ETL.md) | Definiciones, validación, privacidad, carga por lotes, duplicados, agregados, cola y rendimiento |
| [Algoritmos](docs/ALGORITHMS.md) | Los siete algoritmos con sus diez puntos, sus alternativas y sus mediciones |
| [Rendimiento](docs/RENDIMIENTO.md) | La API con un millón de registros, la optimización que encontró la medición, planes de consulta, ETL, algoritmos y gráficas |
| [Seguridad](docs/SEGURIDAD.md) | Controles, hallazgos de la revisión, riesgos aceptados y lista para un despliegue real |
| [Verificación](docs/VERIFICACION.md) | Estado y evidencia de cada requisito funcional y no funcional |
| [Contrato OpenAPI](docs/openapi.yml) | Las 37 rutas de la API en OpenAPI 3.1 |
| [Power BI](docs/POWERBI.md) | Qué se comparte, modelo en estrella, conexión, relaciones, medidas DAX, indicadores clave y privacidad |
| [Diccionario de datos](docs/DATA_DICTIONARY.md) | Estructura de cada archivo de datos, de los registros simulados y reglas de transformación |
| [Guía de contribución](docs/CONTRIBUTING.md) | Flujo de trabajo con Git, reglas de código y pruebas |
| [Registro de cambios](CHANGELOG.md) | Historial de entregas |

## Trabajar en Visual Studio Code

1. Abre esta carpeta en VS Code.
2. Acepta las extensiones recomendadas. Están en `.vscode/extensions.json` e incluyen ESLint, Prettier, Vitest y la vista de diagramas Mermaid.
3. Para leer la documentación con sus diagramas, abre un archivo de `docs/` y pulsa `Cmd+Shift+V` en macOS o `Ctrl+Shift+V` en Windows.
4. Ejecuta los comandos en la terminal integrada, que se abre con `` Ctrl+` ``.

## Reglas del proyecto

- **Ninguna cifra sin fuente.** Todo dato es `OFICIAL`, `ESTIMADO` o `SIMULADO`, y el portal lo indica en cada tarjeta y gráfica.
- **Un vacío no es un cero.** Si la fuente no trae un valor, el portal muestra «Sin dato».
- **Sin datos personales.** El portal solo publica cifras agregadas, y su cuenta de base de datos solo puede leer vistas agregadas. Los documentos se guardan como seudónimos y nunca en claro.
- **Sin comentarios en el código fuente.** La documentación vive en `docs/`. Una regla de ESLint y un programa de verificación lo hacen cumplir.
- **Commits reales y descriptivos**, con los prefijos `feat`, `fix`, `refactor`, `docs` y `test`.
