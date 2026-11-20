import { crearGenerador } from './aleatorio.js';
import { simularPoblacion } from './poblacion.js';
import {
  simularEconomia,
  simularEducacion,
  simularInfraestructura,
  simularLogistica,
  simularSalud,
} from './sectores.js';
import { simularVivienda } from './vivienda.js';

export const SEMILLA_POR_DEFECTO = 20260810;
export const TAMANO_PERSONAS = 100_000;
export const TAMANO_VIVIENDAS = 50_000;

const FECHA_DEL_SISMO = '2026-08-10';
const SEMANAS = 13;
const DIAS_POR_SEMANA = 7;
const MILISEGUNDOS_POR_DIA = 86_400_000;

const enMiles = (cantidad) => cantidad.toLocaleString('es-CO');
const sumar = (cantidades) => cantidades.reduce((total, cantidad) => total + cantidad, 0);
const promedio = (cantidades) => sumar(cantidades) / cantidades.length;

export function fechasSemanales(inicio, cantidad) {
  const base = Date.parse(`${inicio}T00:00:00Z`);
  return Array.from({ length: cantidad }, (_, semana) =>
    new Date(base + semana * DIAS_POR_SEMANA * MILISEGUNDOS_POR_DIA).toISOString().slice(0, 10),
  );
}

function buscarHospitales(hospitales, estado) {
  return hospitales.find((grupo) => grupo.estado === estado).cantidad;
}

function indicadoresDeEconomia(economia, muestra) {
  const porSector = Object.fromEntries(
    economia.perdidasPorSector
      .filter(({ indicador }) => indicador !== null)
      .map(({ indicador, valor }) => [indicador, { valor, muestra }]),
  );
  return {
    ...porSector,
    perdidas_economicas: { valor: economia.perdidasTotales, muestra },
    recursos_pendientes_desembolso: { valor: economia.pendientesDesembolso, muestra },
    empleos_afectados: { valor: economia.empleosAfectados, muestra },
  };
}

function indicadoresDeSalud(salud, muestra) {
  return {
    personas_hospitalizadas: { valor: salud.evolucion.hospitalizadas.at(-1), muestra },
    personas_atendidas: { valor: salud.evolucion.atendidas.at(-1), muestra },
    hospitales_operativos: { valor: buscarHospitales(salud.hospitales, 'Operativos'), muestra },
    hospitales_fuera_servicio: { valor: buscarHospitales(salud.hospitales, 'Fuera de servicio'), muestra },
    capacidad_hospitalaria_afectada: { valor: salud.capacidadAfectada, muestra },
    disponibilidad_medicamentos: { valor: salud.disponibilidadMedicamentos, muestra },
    atencion_psicologica: { valor: salud.atencionPsicologica, muestra },
    personal_medico_disponible: { valor: salud.personalMedico, muestra },
  };
}

function indicadoresDeEducacion(educacion, muestra) {
  return {
    instituciones_destruidas: { valor: educacion.destruidas, muestra },
    docentes_afectados: { valor: educacion.docentesAfectados, muestra },
    estudiantes_desplazados: { valor: educacion.estudiantesDesplazados, muestra },
  };
}

function indicadoresDeLogistica(logistica, muestra) {
  const porSuministro = Object.fromEntries(
    logistica.suministros.map(({ indicador, entregado }) => [indicador, { valor: entregado, muestra }]),
  );
  return {
    ...porSuministro,
    albergues_disponibles: { valor: logistica.albergues.disponibles, muestra },
    capacidad_alojamiento: { valor: logistica.albergues.capacidad, muestra },
    personas_alojadas: { valor: logistica.albergues.alojadas, muestra },
    centros_distribucion: { valor: logistica.centrosDistribucion, muestra },
    transporte_humanitario: { valor: sumar(logistica.transporte.map(({ viajes }) => viajes)), muestra },
    recursos_pendientes_entrega: { valor: logistica.pendienteEntrega, muestra },
  };
}

function construirIndicadores(modulos) {
  const { economia, infraestructura, salud, educacion, logistica } = modulos;
  const muestraViviendas = `Muestra simulada de ${enMiles(TAMANO_VIVIENDAS)} viviendas`;
  const muestraSectores = 'Valores simulados';
  const avance = promedio([infraestructura.porcentajeRecuperado, educacion.porcentajeReabierto]);
  return {
    ...indicadoresDeEconomia(economia, muestraViviendas),
    infraestructura_recuperada: { valor: infraestructura.porcentajeRecuperado, muestra: muestraSectores },
    avance_recuperacion: { valor: avance, muestra: muestraSectores },
    ...indicadoresDeSalud(salud, muestraSectores),
    ...indicadoresDeEducacion(educacion, muestraSectores),
    ...indicadoresDeLogistica(logistica, muestraSectores),
  };
}

export function generarDemostracion({ semilla = SEMILLA_POR_DEFECTO, departamentos }) {
  const generador = crearGenerador(semilla);
  const fechas = fechasSemanales(FECHA_DEL_SISMO, SEMANAS);
  const poblacion = simularPoblacion(generador, { tamano: TAMANO_PERSONAS, departamentos, fechas });
  const vivienda = simularVivienda(generador, { tamano: TAMANO_VIVIENDAS, departamentos });
  const economia = simularEconomia(generador, { valorDestruidas: vivienda.valorDestruidas });
  const infraestructura = simularInfraestructura(generador);
  const salud = simularSalud(generador, { fechas, atendidas: poblacion.evolucion.atendidas });
  const educacion = simularEducacion(generador, { fechas });
  const logistica = simularLogistica(generador, { fechas, alojadas: poblacion.evolucion.enAlbergue });
  const modulos = { poblacion, vivienda, economia, infraestructura, salud, educacion, logistica };
  return { ...modulos, indicadores: construirIndicadores(modulos) };
}
