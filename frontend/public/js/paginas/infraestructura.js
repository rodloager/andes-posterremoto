import { barras } from '../graficas/opciones.js';
import { tema } from '../graficas/tema.js';
import { formatearCantidad, formatearNumero } from '../nucleo/formato.js';
import {
  figura,
  grafica,
  graficaSimulada,
  graficas,
  indicadores,
  iniciarPagina,
  nota,
  seccion,
} from '../nucleo/pagina.js';
import { crearTabla } from '../nucleo/tabla.js';
import { cargarTerritorio, describirPeriodo, origenTerritorial } from '../nucleo/territorio.js';
import { barrasPorDepartamento, nombres } from './bloques.js';

const INDICADORES = [
  'infraestructura_afectada',
  'centros_educativos_afectados',
  'centros_salud_afectados',
  'infraestructura_recuperada',
];
const TIPOS_OFICIALES = [
  'centrosComunitarios',
  'centrosEducativos',
  'vias',
  'centrosSalud',
  'acueductos',
  'puentesVehiculares',
  'puentesPeatonales',
  'aeropuertos',
];
const MUNICIPIOS_EN_LISTA = 10;
const MUESTRA = 'Valores simulados';
const COLORES_DE_DANO = tema.dano.slice(1, 5);

function variablesDe(territorio, codigos) {
  return codigos.map((codigo) => territorio.variables.find((variable) => variable.codigo === codigo));
}

function totalDeInfraestructura(valores) {
  return TIPOS_OFICIALES.reduce((total, codigo) => total + (valores[codigo] ?? 0), 0);
}

function porTipo(contexto, territorio) {
  const tipos = variablesDe(territorio, TIPOS_OFICIALES);
  return grafica({
    pregunta: '¿Qué tipo de infraestructura resultó afectada?',
    descripcion: 'Suma nacional de los reportes municipales.',
    ...barras({
      categorias: nombres(tipos),
      series: [
        { nombre: 'Estructuras afectadas', valores: tipos.map(({ codigo }) => territorio.nacional[codigo]) },
      ],
      encabezado: 'Tipo',
    }),
    origen: origenTerritorial(contexto.fuente('dane-afectaciones'), territorio.meta),
  });
}

function municipiosMasAfectados(contexto, territorio) {
  const departamentos = new Map(territorio.departamentos.map(({ codigo, nombre }) => [codigo, nombre]));
  const filas = territorio.municipios
    .map((municipio) => ({ ...municipio, total: totalDeInfraestructura(municipio.valores) }))
    .sort((a, b) => b.total - a.total)
    .slice(0, MUNICIPIOS_EN_LISTA)
    .map(({ nombre, departamento, valores, total }) => [
      nombre,
      departamentos.get(departamento),
      formatearCantidad(valores.centrosEducativos),
      formatearCantidad(valores.centrosComunitarios),
      formatearCantidad(valores.centrosSalud),
      formatearCantidad(valores.vias),
      formatearNumero(total),
    ]);
  return figura(
    {
      pregunta: '¿En qué municipios hay más infraestructura afectada?',
      origen: origenTerritorial(contexto.fuente('dane-afectaciones'), territorio.meta),
      anchoCompleto: true,
    },
    crearTabla({
      titulo: `Los ${MUNICIPIOS_EN_LISTA} municipios con más estructuras afectadas`,
      columnas: [
        { nombre: 'Municipio' },
        { nombre: 'Departamento' },
        { nombre: 'Centros educativos', numerica: true },
        { nombre: 'Centros comunitarios', numerica: true },
        { nombre: 'Centros de salud', numerica: true },
        { nombre: 'Vías', numerica: true },
        { nombre: 'Total', numerica: true },
      ],
      filas,
    }),
  );
}

function porNivelDeDano(datos) {
  return graficaSimulada(datos, {
    pregunta: '¿Qué nivel de daño tiene cada tipo de infraestructura?',
    muestra: () => MUESTRA,
    construir: ({ tipos, niveles }) =>
      barras({
        categorias: nombres(tipos),
        series: niveles.map((nivel, posicion) => ({
          nombre: nivel,
          valores: tipos.map(({ porNivel }) => porNivel[posicion]),
        })),
        apiladas: true,
        colores: COLORES_DE_DANO,
        encabezado: 'Tipo',
      }),
    alto: true,
    anchoCompleto: true,
  });
}

function recuperacion(datos) {
  return graficaSimulada(datos, {
    pregunta: '¿Cuánta infraestructura afectada se ha recuperado?',
    muestra: () => MUESTRA,
    construir: ({ tipos }) =>
      barras({
        categorias: nombres(tipos),
        series: [
          { nombre: 'Afectadas', valores: tipos.map(({ afectadas }) => afectadas) },
          { nombre: 'Recuperadas', valores: tipos.map(({ recuperadas }) => recuperadas) },
        ],
        colores: [tema.series[5], tema.positivo],
        encabezado: 'Tipo',
      }),
    alto: true,
    anchoCompleto: true,
  });
}

iniciarPagina(async (contexto) => {
  const [territorio, datos] = await Promise.all([cargarTerritorio(), contexto.simulado('infraestructura')]);
  return [
    seccion(
      {
        titulo: 'Infraestructura afectada',
        descripcion: `${describirPeriodo(territorio.meta)}. No incluye redes eléctricas, alcantarillado ni telecomunicaciones, que la fuente no reporta.`,
      },
      indicadores(contexto, INDICADORES),
      graficas(
        porTipo(contexto, territorio),
        barrasPorDepartamento(contexto, territorio, {
          pregunta: '¿En qué departamentos se concentra el daño?',
          variables: ['centrosEducativos', 'centrosComunitarios', 'centrosSalud'],
        }),
        barrasPorDepartamento(contexto, territorio, {
          pregunta: '¿Dónde hay más edificios averiados y colapsados?',
          variables: ['edificiosAveriados', 'edificiosColapsados'],
        }),
        municipiosMasAfectados(contexto, territorio),
      ),
    ),
    seccion(
      {
        titulo: 'Nivel de daño y recuperación',
        descripcion:
          'Ninguna fuente publica el nivel de daño ni el estado de recuperación de cada estructura.',
      },
      graficas(porNivelDeDano(datos), recuperacion(datos)),
      nota(
        'Los tipos de la gráfica simulada siguen la lista del proyecto: vías, puentes, edificaciones públicas, salud, educación, servicios públicos, telecomunicaciones, comercio e industria.',
      ),
    ),
  ];
});
