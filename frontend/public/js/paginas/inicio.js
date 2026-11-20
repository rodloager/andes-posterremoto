import { crearFigura } from '../componentes/figura.js';
import { rejillaDeKpi } from '../componentes/kpi.js';
import { ENCUADRE_CON_REPORTE, crearMapa } from '../componentes/mapa.js';
import { cargar } from '../nucleo/datos.js';
import { crear } from '../nucleo/dom.js';
import { separarKpi } from '../nucleo/kpi.js';
import { graficas, indicadores, iniciarPagina, nota, seccion } from '../nucleo/pagina.js';
import { cargarTerritorio, origenTerritorial, valoresPorCodigo } from '../nucleo/territorio.js';
import { evolucionDeVivienda } from './bloques.js';

const PRINCIPALES = ['personas_afectadas', 'fallecidos', 'viviendas_destruidas', 'viviendas_afectadas'];
const SECUNDARIOS = [
  'heridos',
  'personas_desplazadas',
  'viviendas_aseguradas',
  'viviendas_no_aseguradas',
  'infraestructura_afectada',
  'perdidas_economicas',
  'presupuesto_recuperacion',
  'avance_recuperacion',
];
const RELACIONADOS = [
  'desaparecidos',
  'rescatados',
  'municipios_afectados',
  'reclamaciones_seguros',
  'costo_reconstruccion',
];

function mapaDeViviendas(contexto, territorio, limites, evento) {
  const mapa = crearMapa({
    entidades: limites,
    valores: valoresPorCodigo(territorio.departamentos, 'viviendasDestruidas'),
    titulo: 'Viviendas destruidas',
    encuadrar: ENCUADRE_CON_REPORTE,
    epicentro: { ...evento.coordenadas, etiqueta: 'Epicentro según el USGS' },
    alSeleccionar: (codigo) => window.location.assign(`/mapa?departamento=${codigo}`),
  });
  return crearFigura(
    {
      pregunta: '¿Dónde se concentran las viviendas destruidas?',
      descripcion: 'Selecciona un departamento para ver el detalle de sus municipios.',
      origen: origenTerritorial(contexto.fuente('dane-afectaciones'), territorio.meta),
    },
    mapa,
  );
}

function comparacionDelEvento(contexto, evento) {
  const parametros = evento.parametros.map(({ nombre, valores }) =>
    crear(
      'div',
      {},
      crear('dt', { texto: nombre }),
      valores.map(({ fuente, valor }) =>
        crear('dd', {}, valor, crear('span', { texto: contexto.fuente(fuente).entidad })),
      ),
    ),
  );
  return crear('div', { clase: 'panel' }, crear('dl', { clase: 'comparacion-fuentes' }, parametros));
}

function normasDelEvento(evento) {
  const filas = evento.normas.map(({ nombre, contenido }) =>
    crear('li', {}, crear('strong', { texto: `${nombre}. ` }), contenido),
  );
  return crear(
    'div',
    { clase: 'panel' },
    crear('h3', { texto: 'Normas del evento' }),
    crear('ul', { clase: 'mb-0' }, filas),
  );
}

function indicadoresClave(contexto, { kpi }) {
  const { oficiales, simulados } = separarKpi(kpi);
  const opciones = { buscarFuente: contexto.fuente };
  const conSimulados = contexto.demostracion && simulados.length > 0;
  return seccion(
    {
      titulo: 'Indicadores clave',
      descripcion:
        'Proporciones que ANDES calcula con las cifras oficiales para dimensionar el sismo. No son cifras publicadas por las entidades: cada tarjeta dice de qué fuente sale cada parte.',
    },
    rejillaDeKpi(oficiales, opciones),
    conSimulados ? crear('h3', { clase: 'seccion-subtitulo', texto: 'Con los registros simulados' }) : null,
    conSimulados ? rejillaDeKpi(simulados, opciones) : null,
  );
}

iniciarPagina(async (contexto) => {
  const [territorio, limites, evento, kpi] = await Promise.all([
    cargarTerritorio(),
    cargar('geo/departamentos'),
    cargar('oficial/evento'),
    cargar('oficial/kpi'),
  ]);
  return [
    seccion(
      { titulo: 'Lo esencial' },
      indicadores(contexto, PRINCIPALES, { principal: true }),
      graficas(mapaDeViviendas(contexto, territorio, limites, evento), evolucionDeVivienda(contexto)),
      nota(
        'El mapa y la serie usan fuentes distintas. El mapa suma reportes municipales de agosto. La serie usa los balances nacionales, que llegan hasta octubre. Por eso sus totales no coinciden.',
      ),
    ),
    indicadoresClave(contexto, kpi),
    seccion(
      {
        titulo: 'Otros indicadores nacionales',
        descripcion:
          'Cuando ninguna entidad publica una cifra, el indicador lo dice. No se muestra un cero ni un valor supuesto.',
      },
      indicadores(contexto, SECUNDARIOS),
    ),
    seccion({ titulo: 'Datos relacionados' }, indicadores(contexto, RELACIONADOS)),
    seccion(
      {
        titulo: 'El sismo según cada fuente',
        descripcion:
          'Las dos entidades difieren en la profundidad. El portal muestra ambos valores con su fuente y no los promedia.',
      },
      graficas(comparacionDelEvento(contexto, evento), normasDelEvento(evento)),
    ),
  ];
});
