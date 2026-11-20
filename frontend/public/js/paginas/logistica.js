import { barras, lineas } from '../graficas/opciones.js';
import { tema } from '../graficas/tema.js';
import { graficaSimulada, graficas, indicadores, iniciarPagina, nota, seccion } from '../nucleo/pagina.js';
import { nombres, puntosSemanales } from './bloques.js';

const INDICADORES_DE_SUMINISTRO = [
  'alimentos_distribuidos',
  'agua_suministrada',
  'medicamentos_entregados',
  'kits_emergencia',
  'recursos_pendientes_entrega',
];
const INDICADORES_DE_ALOJAMIENTO = ['albergues_disponibles', 'capacidad_alojamiento', 'personas_alojadas'];
const INDICADORES_DE_OPERACION = ['centros_distribucion', 'transporte_humanitario'];
const muestra = () => 'Valores simulados';

const porcentaje = (parte, total) => (parte / total) * 100;

function coberturaPorSuministro(datos) {
  return graficaSimulada(datos, {
    pregunta: '¿Cuánto de lo requerido se ha entregado?',
    descripcion:
      'Cada suministro tiene su propia unidad, así que se compara como porcentaje de lo requerido.',
    muestra,
    construir: ({ suministros }) => {
      const pendiente = ({ requerido, entregado, inventario }) =>
        Math.max(0, requerido - entregado - inventario);
      const serie = (nombre, cantidad) => ({
        nombre,
        valores: suministros.map((suministro) => porcentaje(cantidad(suministro), suministro.requerido)),
      });
      return barras({
        categorias: nombres(suministros),
        series: [
          serie('Entregado', ({ entregado }) => entregado),
          serie('En inventario', ({ inventario }) => inventario),
          serie('Pendiente', pendiente),
        ],
        unidad: '%',
        apiladas: true,
        colores: [tema.positivo, tema.series[2], tema.alerta],
        encabezado: 'Suministro',
      });
    },
  });
}

function ocupacionDeAlbergues(datos) {
  return graficaSimulada(datos, {
    pregunta: '¿Cómo evoluciona la ocupación de los albergues?',
    muestra,
    construir: ({ evolucionAlojamiento: serie }) =>
      lineas({
        series: [
          { nombre: 'Capacidad', puntos: puntosSemanales(serie.fechas, serie.capacidad) },
          { nombre: 'Personas alojadas', puntos: puntosSemanales(serie.fechas, serie.alojadas) },
        ],
      }),
  });
}

function transportePorMedio(datos) {
  return graficaSimulada(datos, {
    pregunta: '¿Por qué medio se transporta la ayuda?',
    muestra,
    construir: ({ transporte }) =>
      barras({
        categorias: transporte.map(({ medio }) => medio),
        series: [{ nombre: 'Viajes', valores: transporte.map(({ viajes }) => viajes) }],
        encabezado: 'Medio de transporte',
      }),
  });
}

iniciarPagina(async (contexto) => {
  const datos = await contexto.simulado('logistica');
  return [
    seccion(
      { titulo: 'Suministros' },
      nota(
        'No hay datos estructurados de 2026 sobre ayudas entregadas. El reporte anual de emergencias de la UNGRD trae estas columnas y se integrará cuando se publique la vigencia 2026.',
      ),
      indicadores(contexto, INDICADORES_DE_SUMINISTRO),
      graficas(coberturaPorSuministro(datos)),
    ),
    seccion(
      { titulo: 'Albergues' },
      indicadores(contexto, INDICADORES_DE_ALOJAMIENTO),
      graficas(ocupacionDeAlbergues(datos)),
    ),
    seccion(
      { titulo: 'Operación' },
      indicadores(contexto, INDICADORES_DE_OPERACION),
      graficas(transportePorMedio(datos)),
    ),
  ];
});
