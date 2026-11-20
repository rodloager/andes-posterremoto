import { barras, circular, lineas, piramide } from '../graficas/opciones.js';
import { SIN_DATO, formatearCantidad, formatearPorcentaje } from '../nucleo/formato.js';
import {
  figuraSimulada,
  graficaSimulada,
  graficas,
  indicadores,
  iniciarPagina,
  muestraDe,
  nota,
  seccion,
} from '../nucleo/pagina.js';
import { crearTabla } from '../nucleo/tabla.js';
import { cargarTerritorio } from '../nucleo/territorio.js';
import { barrasPorDepartamento, nombres, puntosSemanales } from './bloques.js';

const INDICADORES = [
  'personas_afectadas',
  'familias_afectadas',
  'personas_desplazadas',
  'fallecidos',
  'heridos',
  'desaparecidos',
];

const CORTES_DE_EDAD = [
  { nombre: 'Niños menores de 10 años', grupos: [0] },
  { nombre: 'Personas de 10 años en adelante', grupos: [1, 2, 3] },
  { nombre: 'Menores de edad', grupos: [0, 1] },
  { nombre: 'Adultos de 18 años en adelante', grupos: [2, 3] },
  { nombre: 'Adultos mayores, de 60 años en adelante', grupos: [3] },
];

const muestra = (datos) => muestraDe(datos.tamanoMuestra, 'personas');
const personas = (categorias) => categorias.map((categoria) => categoria.personas);

function distribucion(categorias, encabezado) {
  return circular({ categorias: nombres(categorias), valores: personas(categorias), encabezado });
}

function barrasDePersonas(categorias, encabezado) {
  return barras({
    categorias: nombres(categorias),
    series: [{ nombre: 'Personas', valores: personas(categorias) }],
    encabezado,
  });
}

function tablaDeCortes({ gruposEdad, tamanoMuestra }) {
  const filas = CORTES_DE_EDAD.map(({ nombre, grupos }) => {
    const partes = grupos.map((posicion) => gruposEdad[posicion].personas);
    const cantidad = partes.includes(null) ? null : partes.reduce((total, parte) => total + parte, 0);
    const participacion =
      cantidad === null ? SIN_DATO : formatearPorcentaje((cantidad / tamanoMuestra) * 100);
    return [nombre, formatearCantidad(cantidad), participacion];
  });
  return crearTabla({
    titulo: 'Rangos de edad obtenidos al sumar los cuatro grupos base',
    columnas: [
      { nombre: 'Rango' },
      { nombre: 'Personas', numerica: true },
      { nombre: 'Participación', numerica: true },
    ],
    filas,
  });
}

function evolucion({ evolucion: serie }) {
  return lineas({
    series: [{ nombre: 'Personas registradas', puntos: puntosSemanales(serie.fechas, serie.registradas) }],
  });
}

function seccionDeEdad(datos) {
  return seccion(
    {
      titulo: 'Edad',
      descripcion:
        'La población se divide en cuatro grupos que no se solapan. Los demás rangos se obtienen sumándolos.',
    },
    graficas(
      graficaSimulada(datos, {
        pregunta: '¿Cómo se reparte la población afectada por edad?',
        muestra,
        construir: ({ gruposEdad }) => distribucion(gruposEdad, 'Grupo de edad'),
      }),
      graficaSimulada(datos, {
        pregunta: '¿Cuál es la estructura por edad y sexo?',
        muestra,
        construir: (simulados) => piramide(simulados.piramide),
        alto: true,
      }),
      figuraSimulada(datos, {
        pregunta: '¿Cuántas personas hay en cada rango de edad del análisis?',
        muestra,
        construir: tablaDeCortes,
        anchoCompleto: true,
      }),
    ),
  );
}

function seccionDeCondicion(datos) {
  return seccion(
    {
      titulo: 'Condición poblacional',
      descripcion:
        'La población carcelaria es la que está en un establecimiento de reclusión. Las personas privadas de la libertad incluyen además las otras modalidades.',
    },
    graficas(
      graficaSimulada(datos, {
        pregunta: '¿Qué condición institucional tiene la población afectada?',
        muestra,
        construir: ({ condicionInstitucional }) => barrasDePersonas(condicionInstitucional, 'Condición'),
      }),
      graficaSimulada(datos, {
        pregunta: '¿Los hogares afectados son propietarios o arrendatarios?',
        muestra,
        construir: ({ tenencia }) => distribucion(tenencia, 'Tenencia del hogar'),
      }),
      graficaSimulada(datos, {
        pregunta: '¿Cuántas personas son damnificadas y cuántas afectadas?',
        muestra,
        construir: ({ situacion }) => distribucion(situacion, 'Situación'),
      }),
    ),
  );
}

function seccionDeVulnerabilidad(datos) {
  return seccion(
    {
      titulo: 'Vulnerabilidad',
      descripcion:
        'Una persona puede tener varias condiciones a la vez, así que los porcentajes no suman cien. Discapacidad y necesidades especiales se registran por separado.',
    },
    graficas(
      graficaSimulada(datos, {
        pregunta: '¿Cuántas personas requieren atención especial?',
        muestra,
        construir: ({ vulnerabilidad }) => barrasDePersonas(vulnerabilidad, 'Condición de vulnerabilidad'),
        anchoCompleto: true,
        alto: true,
      }),
    ),
  );
}

function seccionDeTerritorio(contexto, territorio, datos) {
  return seccion(
    { titulo: 'Territorio y evolución' },
    graficas(
      barrasPorDepartamento(contexto, territorio, {
        pregunta: '¿En qué departamentos hay más familias afectadas?',
        descripcion: 'Suma de los reportes municipales de cada departamento.',
        variables: ['familias'],
      }),
      graficaSimulada(datos, {
        pregunta: '¿Cuántas personas se registraron cada semana?',
        descripcion: 'Cada punto es la semana en que se capturó el registro, desde el lunes del sismo.',
        muestra,
        construir: evolucion,
      }),
    ),
    nota(
      `El reporte por municipio no siempre trae el número de personas. En ${territorio.meta.alertasDeCalidad.PERSONAS_MENOR_QUE_FAMILIAS} municipios informa menos personas que familias, lo que indica registros incompletos en la fuente.`,
      { alerta: true },
    ),
  );
}

iniciarPagina(async (contexto) => {
  const [territorio, datos] = await Promise.all([cargarTerritorio(), contexto.simulado('poblacion')]);
  return [
    seccion({ titulo: 'Cifras generales' }, indicadores(contexto, INDICADORES)),
    seccionDeEdad(datos),
    seccionDeCondicion(datos),
    seccionDeVulnerabilidad(datos),
    seccionDeTerritorio(contexto, territorio, datos),
  ];
});
