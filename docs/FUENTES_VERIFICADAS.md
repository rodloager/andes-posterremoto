# Fuentes y hechos verificados

Fecha de consulta: 9 de noviembre de 2026. Este archivo registra lo que se comprobó en esa fecha y cómo se comprobó. Es el respaldo de las cifras citadas en la [propuesta técnica](PROPUESTA_TECNICA.md).

Niveles usados:

| Nivel | Significado |
|---|---|
| A | Fuente primaria leída directamente: API, conjunto de datos o documento de la entidad. |
| B | Cifra oficial leída en un tercero que cita a la entidad. |
| C | Cálculo propio a partir de datos oficiales. |
| P | Pendiente. Apareció en resultados de búsqueda, pero no se abrió la fuente. No se usa en la propuesta. |

## 1. El evento

El proyecto corresponde a un sismo real: 10 de agosto de 2026, magnitud 7,4, epicentro en San José del Palmar (Chocó).

| Parámetro | Servicio Geológico Colombiano | USGS |
|---|---|---|
| Hora | 07:34 hora local | 12:34:28 UTC |
| Magnitud | 7,4 | 7,4 Mww |
| Profundidad | 103 km | 116,1 km |
| Epicentro | San José del Palmar, Chocó | 4,8601 N y 76,2558 O, a 4 km de San José del Palmar |
| Otros datos | Más de 20.000 reportes de sismo sentido desde más de 1.200 centros poblados | Alerta PAGER roja, intensidad máxima 8,2, evento `us6000tjl2` |

- Servicio Geológico Colombiano, nivel A: [nota del 14 de agosto de 2026](https://www2.sgc.gov.co/Noticias/Paginas/Sismo-de-magnitud-7-4-el-SGC-resolvio-las-preguntas-mas-frecuentes-para-entender-el-evento.aspx).
- USGS, nivel A: [API de eventos](https://earthquake.usgs.gov/fdsnws/event/1/) y [página del evento](https://earthquake.usgs.gov/earthquakes/eventpage/us6000tjl2).
- Las dos entidades difieren en la profundidad. La plataforma guarda cada valor con su fuente y no los promedia.

## 2. Normas del evento

Leídas en el texto de la [Resolución UNGRD 0765 del 26 de agosto de 2026](https://normograma.mintic.gov.co/mintic/compilacion/docs/resolucion_ungrd_0765_2026.htm). La resolución es nivel A. Los decretos que cita son nivel B.

| Norma | Contenido | Nivel |
|---|---|---|
| Decreto 1171 del 11 de agosto de 2026 | Declara la situación de desastre de carácter nacional. | B |
| Decreto 1261 del 19 de agosto de 2026 | Declara el estado de emergencia económica, social y ecológica por treinta días. | B |
| Resolución UNGRD 0765 del 26 de agosto de 2026 | Regula el apoyo económico temporal para solución de vivienda de los damnificados directos. | A |
| Decreto legislativo 1379 de 2026 | Base del Fondo Milagro, según El Nuevo Siglo. | B |
| Decreto 1422 de 2026 | Permite sumar aportes de varias entidades para financiar una solución de vivienda, según Infobae. | B |

Datos de la resolución que importan para el modelo de información:

- El Registro Único de Damnificados lo elabora cada municipio y lo consolida la UNGRD.
- La UNGRD cruza la base con la Registraduría para validar la identidad.
- Los cortes del registro fueron el 24 de agosto y el 4 de septiembre de 2026.
- El tratamiento de datos personales se rige por la Ley 1581 de 2012 y la Ley 1266 de 2008.
- La resolución no enumera los campos del registro. Solo exige indicar si la vivienda está destruida o no es habitable.

Leyes generales, verificadas por su título en el Gestor Normativo de Función Pública (nivel A): [Ley 1523 de 2012](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=47141), [Ley 1581 de 2012](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=49981) y [Ley 1712 de 2014](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=56882).

## 3. Balances de la UNGRD

No se encontró un conjunto de datos abierto con estas cifras. Se leyeron en medios que citan a la UNGRD (nivel B).

| Corte | Fallecidos | Heridos | Desaparecidos | Viviendas destruidas | Viviendas averiadas | Leído en |
|---|---|---|---|---|---|---|
| Nota del 15/08/2026 | 294, y luego 289 | Sin dato | Sin dato | 14.705 | 81.536 | [Semana](https://www.semana.com/amp/nacion/articulo/ungrd-se-pronuncia-frente-a-cifras-diversas-de-sus-balances-por-el-terremoto-esto-lo-explica/202603/) |
| 10/10/2026, 6:30 a. m. | 335 | 4.516 | 103 | 36.478 | 207.889 | [La FM](https://www.lafm.com.co/sociedad/terremoto-colombia-dos-menses-ultimo-balance-ungrd-octubre-10-413627) |

Otros datos de esos balances:

- Nota del 15/08/2026: 66 edificios colapsados, 234 centros de salud, 2.535 centros educativos, 3.782 centros comunitarios, 308 vías, 62 acueductos, 44 puentes vehiculares, 5 puentes peatonales y 5 aeropuertos afectados.
- Corte del 10/10/2026: 364 personas rescatadas, 500 municipios y 16 departamentos afectados. El Registro Único de Damnificados tenía 305.791 familias y 489.862 personas, cifras que el reporte llama preliminares.
- El Nuevo Siglo repite el 8 de noviembre de 2026 las cifras de 335 fallecidos, 4.516 heridos, 103 desaparecidos, 305.791 familias, 500 municipios y 16 departamentos.
- La cifra de fallecidos bajó de 294 a 289 porque la UNGRD cotejó los reportes iniciales, muchos de ellos verbales, con Fiscalía, Medicina Legal y organismos de socorro, para no contar dos veces a una misma víctima. Es un caso real del problema que resuelve el algoritmo de detección de duplicados.

El [portal de la UNGRD](https://portal.gestiondelriesgo.gov.co/) se consultó directamente (nivel A). Su página principal enlaza la respuesta a solicitudes derivadas de la emergencia por el sismo y la ayuda económica por situación de desastre nacional. No enlaza boletines, tableros ni datos abiertos del sismo.

## 4. Disponibilidad pública de los datos

- El tablero de la UNGRD «Evaluación Situacional de Daños» dejó de estar disponible hacia el 12 de agosto de 2026. Desde entonces la información oficial circula en boletines y declaraciones. Nivel B: [LatAm Journalism Review, 19 de agosto de 2026](https://latamjournalismreview.org/es/articles/el-terremoto-de-colombia-pone-a-prueba-la-transparencia-del-nuevo-gobierno/).
- El conjunto [Emergencias UNGRD V2](https://www.datos.gov.co/Ambiente-y-Desarrollo-Sostenible/Emergencias-UNGRD-V2/2343-nuqp) se consultó por la API de datos.gov.co (nivel A). Tiene 6.506 filas, todas de 2025, y ninguna del terremoto de 2026. Su frecuencia de actualización declarada es anual y su licencia es CC BY 4.0. En 2025 registra 41 eventos de tipo sismo.
- Ese conjunto tiene 61 columnas por municipio y evento: fallecidos, heridos, desaparecidos, personas, familias, viviendas destruidas y averiadas, vías, puentes, acueducto, alcantarillado, centros de salud, educativos y comunitarios, y las ayudas entregadas, como kits, agua, carpas y subsidios de arriendo.
- Problemas de calidad observados en la muestra: valores monetarios como texto (`"$    - 0"`), el marcador `"No Registra"` en lugar de un nulo, coordenadas en `"0"`, código DIVIPOLA en una columna numérica y etiquetas de columna con erratas. Son casos reales para las reglas de limpieza del ETL.

### Corrección del 11 de noviembre de 2026: sí hay datos por municipio

La versión del 9 de noviembre afirmaba que no existían datos oficiales del terremoto por municipio. Es incorrecto. Al buscar los límites para el mapa apareció un servicio geográfico del DANE con la afectación por municipio (nivel A):

- Servicio: <https://geoportal.dane.gov.co/mparcgis/rest/services/Afectaciones/Serv_AfectacionesUNGRD/MapServer>
- Contenido: 1.122 municipios, de los cuales 498 tienen reporte, en 16 departamentos. Coincide con los 500 municipios y 16 departamentos que informa la UNGRD.
- Variables: familias, personas, fallecidos, heridos, desaparecidos, rescatados, viviendas y edificios averiados y destruidos, centros de salud, educativos y comunitarios, vías, acueductos, puentes y aeropuertos.
- Totales al sumar los municipios: 329 fallecidos, 2.945 heridos, 18.127 viviendas destruidas, 69.843 viviendas averiadas, 372 centros de salud y 3.726 centros educativos.
- Fecha: el servicio no declara fecha de corte. Las bitácoras de sus registros están fechadas entre el 11 y el 22 de agosto de 2026, así que sus totales son anteriores a los balances de octubre y no deben mezclarse con ellos.
- Calidad: no tiene metadatos ni licencia declarada. Los números vienen como texto, 13 municipios reportan menos personas que familias y 27 bitácoras traen una fecha imposible (año 2027).
- Límites: los polígonos de departamentos y municipios salen del servicio `Divipola/Serv_DIVIPOLA_MGN_2025` del mismo geoportal.

Los datos ya están descargados y normalizados en `frontend/public/datos/oficial/territorio.json` y `frontend/public/datos/geo/`, con los programas de `etl/tareas/`.

La misma carpeta del geoportal tiene otros servicios con puntos georreferenciados y direcciones. El proyecto solo leyó sus nombres de campo. No descargó sus registros ni los usa, por privacidad.

La corrección ya está en la versión 0.2 de la propuesta técnica. Queda pendiente confirmar con el DANE o la UNGRD que el uso académico de este servicio es apropiado.

Consecuencia para el diseño: hay datos oficiales por municipio hasta el 22 de agosto de 2026, pero no por persona ni por vivienda. La plataforma carga las cifras oficiales con su fuente y su fecha, y marca como `SIMULADO` todo registro de demostración.

## 5. Seguros

Fasecolda, [reporte número 4 del 8 de septiembre de 2026](https://www.fasecolda.com/wp-content/uploads/Comunicado-No.-06-f617.pdf), con corte al 7 de septiembre. El PDF se leyó directamente (nivel A).

| Indicador | Valor |
|---|---|
| Reclamaciones recibidas | 68.270 |
| Valor asegurado asociado a los siniestros | $3,7 billones |
| Indemnizaciones pagadas | $95.076 millones |
| Alcance | 451 municipios de 31 departamentos |
| Primer balance de la emergencia | 10.465 reclamaciones |

| Departamento | Siniestros | Pagos en millones de pesos | Valor estimado a pagar |
|---|---|---|---|
| Valle del Cauca | 28.201 | 46.220 | $1,35 billones |
| Risaralda | 14.755 | 26.337 | $1,30 billones |
| Quindío | 8.158 | 12.446 | $256 mil millones |
| Caldas | 3.998 | 4.677 | $220 mil millones |
| Antioquia | 5.847 | 660 | $106 mil millones |

| Ramo | Reclamaciones | Reserva |
|---|---|---|
| Terremoto, que incluye hogar e incendio | 63.786 | $3,34 billones |
| Automóviles | 1.219 | $22,9 mil millones |
| Riesgos laborales | 1.113 | $16,6 mil millones |
| Lucro cesante | 5 | $33,9 mil millones |

Sobre la obligación de asegurar las viviendas hipotecadas (nivel B): el numeral 1 del artículo 101 del Estatuto Orgánico del Sistema Financiero exige seguro de incendio y terremoto para los inmuebles hipotecados a favor de entidades vigiladas. Lo resumen una guía de Fasecolda y conceptos de la Superintendencia Financiera. Falta leer el texto vigente del artículo.

## 6. Reconstrucción y recursos

Todas son cifras de nivel B. Difieren entre sí porque provienen de entidades y fechas distintas.

| Fuente original | Fecha | Cifras | Leído en |
|---|---|---|---|
| Ministerio de Vivienda | 23/10/2026 | Reconstrucción: $54 billones. Vivienda: $19,7 billones. 16 departamentos y 498 municipios. Más de 203.000 viviendas afectadas y más de 51.700 destruidas. Más de 4.700 viviendas reconstruidas. Aporte inicial de la Nación para vivienda: $1,7 billones. | [Infobae](https://www.infobae.com/colombia/2026/10/24/la-reconstruccion-en-colombia-tras-el-terremoto-de-magnitud-74-costara-54-billones-segun-el-ministerio-de-vivienda-una-cifra-alarmante/) |
| Plan de Acción Específico | Nota del 08/11/2026 | Recuperación: $58,29 billones. Brecha de financiación: $50,08 billones. 255.079 viviendas afectadas y 51.778 destruidas. | [El Nuevo Siglo](https://www.elnuevosiglo.com.co/nacion/terremoto-congreso-urge-corte-de-cuentas-sobre-plan-de-respuesta-gubernamental) |
| Presidencia, sobre el Fondo Milagro | Noviembre de 2026 | Cerca de un billón de pesos públicos movilizados. Primer desembolso de $624.656 millones. Destino detallado de $386.600 millones: más de $332.000 millones para 7.385 viviendas, $50.000 millones para demoliciones y $4.600 millones para 920 apoyos a comerciantes. | [El Colombiano](https://www.elcolombiano.com/colombia/fondo-milagro-gobierno-detalla-recursos-reconstruccion-terremoto-IA43341922) |
| Transparencia por Colombia | 11/08 al 12/10/2026 | 768 contratos vinculados al sismo en SECOP I y II, por unos $201.800 millones. El 82 % por contratación directa. | El Nuevo Siglo, mismo enlace |

Consulta propia a la API de SECOP II el 9 de noviembre de 2026 (nivel C): 463 contratos firmados desde el 10 de agosto de 2026 cuyo objeto contiene «sismo» o «terremoto», por $122.830.606.663. De ellos, 436 son de contratación directa. La búsqueda es por palabras y solo cubre SECOP II, así que no es comparable de forma directa con la cifra de Transparencia por Colombia.

## 7. Educación

Ministerio de Educación, primer balance, leído en [Infobae el 16 de agosto de 2026](https://www.infobae.com/colombia/2026/08/16/terremoto-del-10-de-agosto-114855-estudiantes-quedaron-afectados-por-danos-en-sedes-educativas-91-colegios-suspendieron-actividades/) (nivel B): 243 reportes de afectación, 54 sedes con daños estructurales graves, 91 instituciones con actividades suspendidas, 114.855 estudiantes afectados y 117 instituciones de educación superior. La nota no deja claro si las sedes y las suspensiones corresponden a colegios o a educación superior, así que estas cifras deben contrastarse con el ministerio antes de cargarlas.

## 8. Conjuntos de datos en datos.gov.co

Verificados con la API de catálogo y con una consulta de conteo a cada conjunto (nivel A).

| Identificador | Conjunto | Entidad | Tamaño | Última actualización |
|---|---|---|---|---|
| `2343-nuqp` | Emergencias UNGRD V2 | UNGRD | 6.506 filas y 61 columnas | 2026-11-06 |
| `jbjy-vk9h` | SECOP II - Contratos Electrónicos | Agencia Nacional de Contratación Pública | 5.687.362 filas y 95 columnas | 2026-11-09 |
| `c36g-9fc2` | Registro Especial de Prestadores y Sedes de Servicios de Salud | Ministerio de Salud | 76.821 filas y 22 columnas | 2026-04-17 |
| `cfw5-qzt5` | MEN_ESTABLECIMIENTOS_EDUCATIVOS_PREESCOLAR_BÁSICA_Y_MEDIA | Ministerio de Educación | 606.206 filas y 24 columnas | 2026-09-03 |
| `ux6v-gpit` | Población Intramural a Cargo del INPEC por Códigos DIVIPOLA | INPEC | 7.333 filas y 15 columnas | 2026-11-09 |
| `58aq-7nep` | Población Privada de la Libertad por Rango de Edades, Sexo y Situación Jurídica | INPEC | Sin contar | 2026-11-09 |
| `ie7y-asdn` | Red Vial | INVÍAS | Sin contar | 2026-10-19 |
| `v3tn-7h59` | Resultados encuesta entidades Terremoto | Ministerio TIC | 409 filas | 2026-09-08 |

Acceso: `https://www.datos.gov.co/resource/<identificador>.json`, con paginación mediante `$limit` y `$offset` ([documentación](https://dev.socrata.com/docs/endpoints.html)).

## 9. Enlaces institucionales

Respondieron correctamente el 9 de noviembre de 2026:

- UNGRD: <https://portal.gestiondelriesgo.gov.co/>
- DANE, DIVIPOLA: <https://geoportal.dane.gov.co/geovisores/territorio/consulta-divipola-division-politico-administrativa-de-colombia/>
- DANE, datos geoestadísticos: <https://geoportal.dane.gov.co/servicios/descarga-y-metadatos/datos-geoestadisticos/>
- DANE, censo de 2018: <https://www.dane.gov.co/index.php/estadisticas-por-tema/demografia-y-poblacion/censo-nacional-de-poblacion-y-vivenda-2018>
- DANE, microdatos del censo de 2018: <https://microdatos.dane.gov.co/index.php/catalog/643>
- DANE, proyecciones de población: <https://www.dane.gov.co/index.php/estadisticas-por-tema/demografia-y-poblacion/proyecciones-de-poblacion>
- Servicio Geológico Colombiano, sismos: <https://www.sgc.gov.co/sismos>
- Servicio Geológico Colombiano, Sismo Sentido: <https://sismosentido.sgc.gov.co/>
- Servicio Geológico Colombiano, amenaza sísmica: <https://amenazasismica.sgc.gov.co/>
- Ministerio de Salud, REPS: <https://prestadores.minsalud.gov.co/habilitacion/>
- Ministerio de Educación, SINEB: <https://sineb.mineducacion.gov.co/bcol/app>
- Departamento Nacional de Planeación, TerriData: <https://terridata.dnp.gov.co/>
- Unidad para las Víctimas: <https://datospaz.unidadvictimas.gov.co/>
- IGAC, Colombia en Mapas: <https://www.colombiaenmapas.gov.co/>
- IDEAM: <https://www.ideam.gov.co/>
- Fasecolda: <https://www.fasecolda.com/>

No respondieron: el catálogo `bdrsnc.sgc.gov.co` del Servicio Geológico (sin respuesta), la ruta de tableros estadísticos del INPEC (error 404) y Medicina Legal (error 403 a consultas automáticas).

Nueva comprobación del 17 de noviembre de 2026: de los 38 enlaces externos de la documentación respondieron 37. El portal de la Unidad para las Víctimas no contestó en 45 segundos.

## 10. Entorno y versiones

Equipo de desarrollo, revisado el 9 de noviembre de 2026:

| Herramienta | Estado |
|---|---|
| Node.js | 24.15.0 |
| npm | 11.13.0 |
| Git | 2.39.5 |
| Visual Studio Code | Instalado en la carpeta Descargas, sin el comando `code` en la terminal |
| PostgreSQL y MySQL | No instalados |
| Docker | 29.4.1 instalado, con el servicio detenido |

Versiones vigentes en sus fuentes oficiales:

| Tecnología | Dato verificado | Fuente |
|---|---|---|
| Node.js | 24.22.2 y 26.13.0 son las versiones LTS vigentes. | nodejs.org |
| PostgreSQL | La versión 18 es la actual, con soporte hasta noviembre de 2030. | postgresql.org |
| Power BI Desktop | Requiere Windows 10 o Windows Server 2016, o posteriores. | [Microsoft Learn](https://learn.microsoft.com/en-us/power-bi/fundamentals/desktop-get-the-desktop), actualizado el 09/10/2026 |
| Conector de PostgreSQL para Power BI | Incluido en Power BI Desktop desde diciembre de 2019. Admite los modos Importar y DirectQuery. | [Microsoft Learn](https://learn.microsoft.com/en-us/power-query/connectors/postgresql) |

Bibliotecas en npm y versión de Node.js que exigen. Todas son compatibles con Node.js 24.

| Paquete | Versión | Node.js requerido |
|---|---|---|
| express | 5.3.0 | 18 o superior |
| pg | 8.23.1 | 16 o superior |
| pg-copy-streams | 7.0.0 | Sin restricción declarada |
| node-pg-migrate | 9.0.0 | 20.11 o superior |
| zod | 4.6.7 | Sin restricción declarada |
| argon2 | 0.45.2 | 16.17 o superior |
| bcrypt | 6.0.0 | 18 o superior |
| express-session | 1.19.0 | Sin restricción práctica |
| connect-pg-simple | 10.0.0 | 18.18, 20.9 o 22 en adelante |
| helmet | 8.3.0 | 18 o superior |
| express-rate-limit | 8.7.3 | 16 o superior |
| multer | 2.5.0 | 10.16 o superior |
| csv-parse | 7.0.3 | Sin restricción declarada |
| stream-json | 3.8.0 | Sin restricción declarada |
| yaml | 2.9.1 | 14.6 o superior |
| pino | 10.4.0 | Sin restricción declarada |
| echarts | 6.1.0 | No aplica, se ejecuta en el navegador |
| leaflet | 1.9.4 | No aplica, se ejecuta en el navegador |
| bootstrap | 5.3.8 | No aplica, se ejecuta en el navegador |
| topojson-client | 3.1.0 | No aplica, se ejecuta en el navegador |
| mapshaper | 0.7.101 | 20.11 o superior |
| vitest | 5.1.0 | 22.12, 24 o 26 en adelante |
| supertest | 7.3.2 | 14.18 o superior |
| fast-check | 4.10.2 | 12.17 o superior |
| eslint | 10.14.0 | 20.19, 22.13 o 24 en adelante |
| prettier | 3.9.10 | 14 o superior |

Las trece extensiones de `.vscode/extensions.json` se comprobaron en el Marketplace de Visual Studio Code. Todas existen con ese identificador.

## 11. Pendiente de verificar

- La página de la Presidencia con el resumen del 7 de septiembre de 2026. No se pudo leer su contenido.
- Un balance oficial de salud: hospitales afectados y fuera de servicio.
- La afectación de establecimientos de reclusión. Solo se vieron titulares sobre traslados de internos desde Manizales y Pereira.
- La afectación de población e instalaciones militares. No se encontró información.
- Las cifras de fallecidos por municipio de Medicina Legal.
- Los balances intermedios de la UNGRD entre el 16 de agosto y el 9 de octubre de 2026.
- Los reportes de Fasecolda posteriores al 7 de septiembre y el porcentaje de viviendas aseguradas por departamento.
- Si el tablero de la UNGRD volvió a estar disponible.
- El texto vigente del artículo 101 del Estatuto Orgánico del Sistema Financiero.
