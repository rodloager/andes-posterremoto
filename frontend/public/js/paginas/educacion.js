import { lineas } from '../graficas/opciones.js';
import { graficaSimulada, graficas, indicadores, iniciarPagina, nota, seccion } from '../nucleo/pagina.js';
import { cargarTerritorio } from '../nucleo/territorio.js';
import { barrasPorDepartamento, puntosSemanales } from './bloques.js';

const INDICADORES_OFICIALES = [
  'estudiantes_afectados',
  'centros_educativos_afectados',
  'sedes_dano_grave',
  'instituciones_suspendidas',
  'recursos_educacion',
];
const INDICADORES_SIN_FUENTE = ['instituciones_destruidas', 'docentes_afectados', 'estudiantes_desplazados'];

function reapertura(datos) {
  return graficaSimulada(datos, {
    pregunta: '¿A qué ritmo reabren las sedes cerradas?',
    muestra: () => 'Valores simulados',
    construir: ({ evolucion }) =>
      lineas({
        series: [
          { nombre: 'Sedes cerradas', puntos: puntosSemanales(evolucion.fechas, evolucion.cerradas) },
          { nombre: 'Sedes reabiertas', puntos: puntosSemanales(evolucion.fechas, evolucion.reabiertas) },
        ],
      }),
  });
}

iniciarPagina(async (contexto) => {
  const [territorio, datos] = await Promise.all([cargarTerritorio(), contexto.simulado('educacion')]);
  return [
    seccion(
      { titulo: 'Sedes y estudiantes afectados' },
      indicadores(contexto, INDICADORES_OFICIALES),
      nota(
        'El balance del Ministerio de Educación es preliminar, del 16 de agosto. La nota que lo cita no deja claro si las sedes con daño grave y las suspensiones corresponden a colegios o a educación superior.',
        { alerta: true },
      ),
      graficas(
        barrasPorDepartamento(contexto, territorio, {
          pregunta: '¿En qué departamentos hay más centros educativos afectados?',
          variables: ['centrosEducativos'],
        }),
        reapertura(datos),
      ),
    ),
    seccion(
      {
        titulo: 'Sin fuente oficial',
        descripcion:
          'No se localizaron cifras públicas de instituciones destruidas, docentes ni estudiantes desplazados.',
      },
      indicadores(contexto, INDICADORES_SIN_FUENTE),
    ),
  ];
});
