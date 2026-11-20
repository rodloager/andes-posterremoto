import {
  NIVELES_DANO,
  ORIGENES_RECURSOS,
  SECTORES_ECONOMICOS,
  SUMINISTROS,
  TIPOS_INFRAESTRUCTURA,
} from './catalogos.js';

const sumar = (cantidades) => cantidades.reduce((total, cantidad) => total + cantidad, 0);
const porcentaje = (parte, total) => (total === 0 ? 0 : (parte / total) * 100);

function repartir(total, categorias) {
  const cantidades = categorias.map(({ peso }) => Math.floor(total * peso));
  cantidades[0] += total - sumar(cantidades);
  return cantidades;
}

export function simularEconomia(generador, { valorDestruidas }) {
  const perdidasPorSector = SECTORES_ECONOMICOS.map(({ nombre, factor, indicador }) => ({
    nombre,
    indicador,
    valor: Math.round(generador.variar(valorDestruidas * factor, 0.1)),
  }));
  const perdidasTotales = sumar(perdidasPorSector.map(({ valor }) => valor));
  const recursos = ORIGENES_RECURSOS.map(({ nombre, participacion, comprometido, ejecutado }) => {
    const asignado = Math.round(perdidasTotales * participacion);
    return {
      nombre,
      asignado,
      comprometido: Math.round(asignado * comprometido),
      ejecutado: Math.round(asignado * ejecutado),
    };
  });
  const asignado = sumar(recursos.map((recurso) => recurso.asignado));
  const ejecutado = sumar(recursos.map((recurso) => recurso.ejecutado));
  return {
    perdidasPorSector,
    perdidasTotales,
    recursos,
    recursosAsignados: asignado,
    recursosEjecutados: ejecutado,
    pendientesDesembolso: asignado - ejecutado,
    empleosAfectados: generador.entero(9_000, 14_000),
  };
}

export function simularInfraestructura(generador) {
  const tipos = TIPOS_INFRAESTRUCTURA.map(({ nombre, base }) => {
    const afectadas = Math.round(generador.variar(base, 0.15));
    return {
      nombre,
      afectadas,
      porNivel: repartir(afectadas, NIVELES_DANO),
      recuperadas: Math.round(afectadas * generador.variar(0.34, 0.35)),
    };
  });
  const afectadas = sumar(tipos.map((tipo) => tipo.afectadas));
  const recuperadas = sumar(tipos.map((tipo) => tipo.recuperadas));
  return {
    niveles: NIVELES_DANO.map(({ nombre }) => nombre),
    tipos,
    afectadas,
    recuperadas,
    porcentajeRecuperado: porcentaje(recuperadas, afectadas),
  };
}

export function simularSalud(generador, { fechas, atendidas }) {
  const hospitales = [
    { estado: 'Operativos', cantidad: generador.entero(28, 34) },
    { estado: 'Con operación parcial', cantidad: generador.entero(8, 13) },
    { estado: 'Fuera de servicio', cantidad: generador.entero(4, 8) },
  ];
  const camasInstaladas = generador.entero(5_200, 6_100);
  const camasNoDisponibles = Math.round(camasInstaladas * generador.variar(0.17, 0.2));
  const hospitalizadas = fechas.map((_, semana) =>
    Math.round(generador.variar(1_900 * Math.exp(-0.22 * semana) + 120, 0.05)),
  );
  return {
    hospitales,
    camasInstaladas,
    camasNoDisponibles,
    capacidadAfectada: porcentaje(camasNoDisponibles, camasInstaladas),
    evolucion: { fechas, atendidas, hospitalizadas },
    disponibilidadMedicamentos: generador.variar(71, 0.08),
    atencionPsicologica: generador.entero(11_000, 16_000),
    personalMedico: generador.entero(3_400, 4_200),
    necesidades: [
      { nombre: 'Agua segura', personas: generador.entero(21_000, 27_000) },
      { nombre: 'Saneamiento básico', personas: generador.entero(15_000, 20_000) },
      { nombre: 'Salud mental', personas: generador.entero(11_000, 16_000) },
      { nombre: 'Control de vectores', personas: generador.entero(6_000, 9_000) },
    ],
  };
}

export function simularEducacion(generador, { fechas }) {
  const sedesAfectadas = generador.entero(1_150, 1_350);
  const destruidas = Math.round(sedesAfectadas * generador.variar(0.06, 0.2));
  const cerradasAlInicio = Math.round(sedesAfectadas * generador.variar(0.58, 0.05));
  const cerradas = fechas.map((_, semana) => Math.round(cerradasAlInicio * 0.86 ** semana));
  const reabiertas = cerradas.map((cantidad) => cerradasAlInicio - cantidad);
  return {
    sedesAfectadas,
    destruidas,
    cerradasAlInicio,
    evolucion: { fechas, cerradas, reabiertas },
    estudiantesDesplazados: generador.entero(17_000, 24_000),
    docentesAfectados: generador.entero(5_200, 6_800),
    porcentajeReabierto: porcentaje(reabiertas.at(-1), cerradasAlInicio),
  };
}

export function simularLogistica(generador, { fechas, alojadas }) {
  const suministros = SUMINISTROS.map(({ nombre, unidad, requerido, indicador }) => ({
    nombre,
    unidad,
    indicador,
    requerido,
    entregado: Math.round(requerido * generador.variar(0.64, 0.15)),
    inventario: Math.round(requerido * generador.variar(0.14, 0.3)),
  }));
  const coberturas = suministros.map(({ entregado, requerido }) => porcentaje(entregado, requerido));
  const capacidad = Math.round(Math.max(...alojadas) * generador.variar(1.25, 0.06));
  return {
    suministros,
    pendienteEntrega: 100 - sumar(coberturas) / coberturas.length,
    albergues: {
      disponibles: generador.entero(210, 260),
      capacidad,
      alojadas: alojadas.at(-1),
    },
    evolucionAlojamiento: { fechas, alojadas, capacidad: fechas.map(() => capacidad) },
    centrosDistribucion: generador.entero(38, 52),
    transporte: [
      { medio: 'Terrestre', viajes: generador.entero(2_600, 3_400) },
      { medio: 'Aéreo', viajes: generador.entero(240, 380) },
      { medio: 'Fluvial', viajes: generador.entero(90, 170) },
    ],
  };
}
