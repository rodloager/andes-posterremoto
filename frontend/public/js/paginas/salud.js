import { barras, circular, lineas } from '../graficas/opciones.js';
import { graficaSimulada, graficas, indicadores, iniciarPagina, nota, seccion } from '../nucleo/pagina.js';
import { cargarTerritorio } from '../nucleo/territorio.js';
import { barrasPorDepartamento, nombres, puntosSemanales } from './bloques.js';

const INDICADORES_OFICIALES = ['heridos', 'fallecidos', 'desaparecidos', 'centros_salud_afectados'];
const INDICADORES_DE_ATENCION = [
  'personas_atendidas',
  'personas_hospitalizadas',
  'atencion_psicologica',
  'personal_medico_disponible',
];
const INDICADORES_DE_CAPACIDAD = [
  'hospitales_operativos',
  'hospitales_fuera_servicio',
  'capacidad_hospitalaria_afectada',
  'disponibilidad_medicamentos',
];
const MUESTRA = 'Valores simulados';
const muestra = () => MUESTRA;

function operacionHospitalaria(datos) {
  return graficaSimulada(datos, {
    pregunta: '¿Cuántos hospitales siguen operando?',
    muestra,
    construir: ({ hospitales }) =>
      circular({
        categorias: hospitales.map(({ estado }) => estado),
        valores: hospitales.map(({ cantidad }) => cantidad),
        unidad: 'hospitales',
        encabezado: 'Estado de operación',
      }),
  });
}

function evolucionDeLaAtencion(datos) {
  return graficaSimulada(datos, {
    pregunta: '¿Cómo evoluciona la atención en salud?',
    muestra,
    construir: ({ evolucion }) =>
      lineas({
        series: [
          { nombre: 'Personas atendidas', puntos: puntosSemanales(evolucion.fechas, evolucion.atendidas) },
          {
            nombre: 'Personas hospitalizadas',
            puntos: puntosSemanales(evolucion.fechas, evolucion.hospitalizadas),
          },
        ],
      }),
  });
}

function necesidadesSanitarias(datos) {
  return graficaSimulada(datos, {
    pregunta: '¿Qué necesidades sanitarias tiene la población?',
    muestra,
    construir: ({ necesidades }) =>
      barras({
        categorias: nombres(necesidades),
        series: [{ nombre: 'Personas', valores: necesidades.map(({ personas }) => personas) }],
        encabezado: 'Necesidad',
      }),
  });
}

iniciarPagina(async (contexto) => {
  const [territorio, datos] = await Promise.all([cargarTerritorio(), contexto.simulado('salud')]);
  return [
    seccion(
      { titulo: 'Personas heridas y fallecidas' },
      indicadores(contexto, INDICADORES_OFICIALES),
      graficas(
        barrasPorDepartamento(contexto, territorio, {
          pregunta: '¿En qué departamentos hay más personas heridas y fallecidas?',
          variables: ['heridos', 'fallecidos'],
        }),
        barrasPorDepartamento(contexto, territorio, {
          pregunta: '¿Dónde hay más centros de salud afectados?',
          variables: ['centrosSalud'],
        }),
      ),
      nota(
        'El desglose por departamento suma reportes municipales de agosto. Por eso sus totales son menores que los del balance nacional de octubre.',
      ),
    ),
    seccion(
      {
        titulo: 'Atención en salud',
        descripcion: 'No se localizó un balance público de personas atendidas ni hospitalizadas.',
      },
      indicadores(contexto, INDICADORES_DE_ATENCION),
      graficas(evolucionDeLaAtencion(datos), necesidadesSanitarias(datos)),
    ),
    seccion(
      {
        titulo: 'Capacidad hospitalaria',
        descripcion:
          'El Ministerio de Salud publica el catálogo de sedes, pero no su estado de operación después del sismo.',
      },
      indicadores(contexto, INDICADORES_DE_CAPACIDAD),
      graficas(operacionHospitalaria(datos)),
    ),
  ];
});
