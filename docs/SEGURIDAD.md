# Revisión de seguridad

Revisión de la fase 6, hecha el 19 de noviembre de 2026 sobre la versión 0.6.0. Cubre el código del servidor, el portal, el entorno privado, la base de datos y las dependencias. No es una auditoría externa ni una prueba de penetración: es una revisión de código guiada por los requisitos RNF-04, RNF-05 y RNF-06, con pruebas automáticas para cada control que se pudo automatizar.

## Contenido

1. [Controles](#1-controles)
2. [Hallazgos de esta revisión](#2-hallazgos-de-esta-revisión)
3. [Riesgos que se aceptan](#3-riesgos-que-se-aceptan)
4. [Antes de un despliegue real](#4-antes-de-un-despliegue-real)
5. [Cómo repetir la revisión](#5-cómo-repetir-la-revisión)

## 1. Controles

| Tema | Control | Dónde | Cómo se verifica |
|---|---|---|---|
| Contraseñas | Argon2id. Un usuario inexistente también paga una verificación contra un hash ficticio, para que el tiempo de respuesta no revele qué correos existen. | `services/sesion.js` | `tests/integration/sesion.test.js`, `usuarios.test.js` |
| Sesiones | Cookie `andes.sid` con `HttpOnly`, `SameSite=Strict` y `Secure` en producción. Se regenera al iniciar sesión, se destruye al cerrarla y vence por inactividad. Se guarda en PostgreSQL. | `middlewares/sesion.js`, `controllers/sesion.js` | `sesion.test.js`, `proxy.test.js` |
| Intentos de acceso | 10 intentos fallidos por IP cada 15 minutos. Cada intento queda en `seguridad.registro_accesos`. | `middlewares/limites.js` | `sesion.test.js` |
| Autorización | Cada ruta privada exige un permiso. Las páginas privadas exigen sesión y permiso en el servidor; la interfaz solo oculta lo que el rol no puede usar. | `middlewares/autenticacion.js`, `middlewares/paginasPrivadas.js` | `autorizacion.test.js`, con cada ruta y cada rol |
| Validación | Cada parámetro, consulta y cuerpo pasa por un esquema Zod estricto antes de llegar al controlador. Los campos desconocidos se rechazan. | `models/esquemas.js`, `middlewares/validacion.js` | Pruebas de cada ruta e intentos de inyección |
| SQL | Todos los valores van como parámetros. Las 30 interpolaciones que hay en el código solo insertan constantes o identificadores tomados de listas cerradas, como los nombres de las vistas `bi`, validados con una expresión regular. | Repositorios, ETL | Revisión con un script que lista cada plantilla SQL con `${…}`. Intentos de inyección en `administracion.test.js`, `ingenieria.test.js` e `inteligencia.test.js`. |
| Cuentas de la base de datos | Cuatro cuentas de privilegio mínimo: la API pública solo lee vistas de `analitica`, la privada no puede borrar ni alterar la auditoría y Power BI solo lee `bi`, en transacciones de solo lectura y con 5 conexiones como máximo. | Migraciones 0002, 0005, 0007, 0008 y 0009 | `privilegios.test.js`, `inteligencia.test.js` |
| Falsificación de solicitudes | `SameSite=Strict` y, en cada método que modifica datos, el encabezado `Origin` debe coincidir con el servidor. | `middlewares/seguridad.js` | `tests/unit/backend/seguridad.test.js`, `sesion.test.js` |
| Inyección de HTML | La interfaz construye el DOM con `textContent`; no hay `innerHTML` en el código propio. Los textos que entran en las ventanas de información de las gráficas, que ECharts muestra como HTML, se escapan. La política de seguridad de contenido solo permite scripts propios y bloquea los atributos de evento. | `nucleo/dom.js`, `nucleo/html.js`, `graficas/opciones.js` | `tests/unit/frontend/html.test.js`; la política, en `servidor.test.js` |
| Encabezados | Helmet: política de seguridad de contenido, `X-Content-Type-Options`, `Referrer-Policy`, `frame-ancestors 'self'` y HSTS en producción. | `middlewares/seguridad.js` | `servidor.test.js`; HSTS en `proxy.test.js` |
| Subidas | Un archivo por solicitud, hasta 250 MB, con nombre aleatorio en `data/uploads/`, extensión y conjunto validados, y borrado si la solicitud falla. El ETL corre en otro proceso. | `middlewares/archivos.js` | `cargas.test.js` |
| Privacidad | Documentos y predios como seudónimos HMAC-SHA256. Filas rechazadas con los identificadores ocultos. El portal no publica celdas de registros con menos de 10, ni las que permitirían despejarlas. | ETL, `services/publicables.js` | `etl.test.js`, `inteligencia.test.js` (RNF-06) |
| Auditoría | Bitácora encadenada con hash que la API no puede modificar. El panel de ingeniería recalcula la cadena. | Migración 0002 | `privilegios.test.js`, `ingenieria.test.js` |
| Errores | Las respuestas de error siguen `application/problem+json` y nunca incluyen la pila ni el texto de una excepción de la base de datos. | `middlewares/errores.js` | `errores.test.js` |
| Límite de solicitudes | 300 solicitudes por minuto e IP en toda la API. | `middlewares/limites.js` | `servidor.test.js` |
| Secretos | Solo en `.env`, que no se versiona. El servidor valida al arrancar que existan y que tengan la longitud mínima. | `config/entorno.js` | `configuracion.test.js` |
| Red | PostgreSQL solo escucha en `127.0.0.1`. | `docker-compose.yml` | Revisión |
| Dependencias | Versiones exactas y archivo de bloqueo. `npm audit` sin hallazgos. | `package.json` | `npm audit` |

## 2. Hallazgos de esta revisión

| # | Hallazgo | Severidad | Corrección | Prueba |
|---|---|---|---|---|
| S1 | El servidor no confiaba en ningún proxy. Detrás de un proxy con TLS, en producción la cookie `Secure` no se emitía, así que nadie podía iniciar sesión, y el límite de solicitudes contaba a todos los usuarios como una sola IP. | Alta para un despliegue real | Nueva variable `PROXIES_DE_CONFIANZA`, con 0 por defecto, que se pasa a `trust proxy` | `tests/integration/proxy.test.js` demuestra las dos situaciones |
| S2 | Las ventanas de información de cuatro gráficas insertaban nombres de categorías en HTML sin escaparlos. Los nombres vienen de catálogos y de los reportes del DANE, no de los usuarios, y la política de contenido ya bloqueaba la ejecución de scripts, pero un nombre manipulado en la fuente podía alterar el contenido. | Baja | `escaparHtml` en esas cuatro ventanas | `tests/unit/frontend/html.test.js` |
| S3 | `npm audit` reportaba 3 hallazgos moderados en producción (`glob` y `minimatch`, a través de node-pg-migrate) y 3 en desarrollo (`minimatch`, a través de ESLint). Ninguno era explotable: los patrones son fijos y node-pg-migrate solo corre al migrar. | Moderada según npm, baja en la práctica | `overrides` que fijan `glob` 14.0.6 y `minimatch` 11.0.9, las versiones corregidas. Las migraciones y ESLint se comprobaron después. | `npm audit`: 0 vulnerabilidades |
| S4 | Un indicador clave podía publicar una celda que la tabla de registros ocultaba como complemento (hallado en la fase 5). | Media | Una sola fuente de celdas protegidas | `inteligencia.test.js` |

## 3. Riesgos que se aceptan

- **`style-src 'unsafe-inline'`.** ECharts y Leaflet escriben estilos en línea. Los scripts siguen limitados a los del propio sitio.
- **Sin TLS ni SSL en desarrollo.** El servidor y PostgreSQL corren en el mismo equipo y la base solo escucha en `127.0.0.1`.
- **Sin segundo factor de autenticación.** Es un proyecto académico con cuentas de demostración. Un despliegue real debería agregarlo para los roles de administración e ingeniería.
- **Supresión de celdas heurística.** Protege cada partición y cada fila o columna de un cruce, pero no contra un atacante que combine muchas tablas con programación lineal. Ver [ALGORITHMS.md](ALGORITHMS.md#supresión-de-celdas-pequeñas).
- **El modelo en estrella tiene celdas de una persona.** Solo lo lee la cuenta privada de Power BI. Con datos reales habría que engrosar su granularidad. Ver [POWERBI.md](POWERBI.md#10-privacidad).
- **La clave de Power BI vive en `.env`.** Como las demás claves de la base de datos.

## 4. Antes de un despliegue real

1. Poner `NODE_ENV=production` y servir solo por HTTPS, detrás de un proxy, con `PROXIES_DE_CONFIANZA` igual al número de proxies.
2. Generar secretos nuevos y largos para todas las claves de `.env`, y no crear los usuarios de demostración.
3. Activar SSL en PostgreSQL si no corre en el mismo equipo, y cambiar `BD_HOST`.
4. Programar copias de seguridad de la base de datos, incluida la auditoría.
5. Revisar `npm audit` y actualizar dependencias antes de cada entrega.
6. Agregar un segundo factor para los roles con permisos de escritura.

## 5. Cómo repetir la revisión

```bash
npm audit
```

```bash
npm test
```

La lista de plantillas SQL con valores interpolados se obtiene recorriendo `backend/`, `etl/`, `database/` y `analytics/` en busca de cadenas con `${` que contengan palabras clave de SQL; cada resultado debe ser una constante o un identificador validado.
