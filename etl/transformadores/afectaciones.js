import { aEntero, aTitulo } from './texto.js';

export const VARIABLES = Object.freeze([
  { codigo: 'familias', campo: 'Familias', nombre: 'Familias afectadas', unidad: 'familias' },
  { codigo: 'personas', campo: 'Personas', nombre: 'Personas afectadas', unidad: 'personas' },
  { codigo: 'fallecidos', campo: 'Fallecidos', nombre: 'Personas fallecidas', unidad: 'personas' },
  { codigo: 'heridos', campo: 'Heridos', nombre: 'Personas heridas', unidad: 'personas' },
  {
    codigo: 'desaparecidos',
    campo: 'Desapareci',
    nombre: 'Personas desaparecidas',
    unidad: 'personas',
  },
  { codigo: 'rescatados', campo: 'Rescatados', nombre: 'Personas rescatadas', unidad: 'personas' },
  {
    codigo: 'viviendasAveriadas',
    campo: 'Viviendas',
    nombre: 'Viviendas averiadas',
    unidad: 'viviendas',
  },
  {
    codigo: 'viviendasDestruidas',
    campo: 'Viviendas_',
    nombre: 'Viviendas destruidas',
    unidad: 'viviendas',
  },
  {
    codigo: 'edificiosAveriados',
    campo: 'Edificios',
    nombre: 'Edificios averiados',
    unidad: 'edificios',
  },
  {
    codigo: 'edificiosColapsados',
    campo: 'Edificios_',
    nombre: 'Edificios colapsados',
    unidad: 'edificios',
  },
  { codigo: 'centrosSalud', campo: 'Centros_de', nombre: 'Centros de salud', unidad: 'centros' },
  {
    codigo: 'centrosEducativos',
    campo: 'Centros_Ed',
    nombre: 'Centros educativos',
    unidad: 'centros',
  },
  {
    codigo: 'centrosComunitarios',
    campo: 'Centros_Co',
    nombre: 'Centros comunitarios',
    unidad: 'centros',
  },
  { codigo: 'vias', campo: 'Vías', nombre: 'Vías', unidad: 'vías' },
  { codigo: 'aeropuertos', campo: 'Aeropuerto', nombre: 'Aeropuertos', unidad: 'aeropuertos' },
  { codigo: 'acueductos', campo: 'Acueductos', nombre: 'Acueductos', unidad: 'acueductos' },
  {
    codigo: 'puentesVehiculares',
    campo: 'Puente_veh',
    nombre: 'Puentes vehiculares',
    unidad: 'puentes',
  },
  {
    codigo: 'puentesPeatonales',
    campo: 'Puente_pea',
    nombre: 'Puentes peatonales',
    unidad: 'puentes',
  },
]);

export const ALERTA_PERSONAS_MENOR_QUE_FAMILIAS = 'PERSONAS_MENOR_QUE_FAMILIAS';
export const ALERTA_FECHA_REPORTE_INVALIDA = 'FECHA_REPORTE_INVALIDA';

const PATRON_FECHA = /(\d{1,2})\/(\d{1,2})\/(\d{4})/;

function aFechaIso(dia, mes, anio) {
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  const esReal =
    fecha.getUTCFullYear() === anio && fecha.getUTCMonth() === mes - 1 && fecha.getUTCDate() === dia;
  return esReal ? fecha.toISOString().slice(0, 10) : null;
}

export function extraerFechaReporte(bitacora, { desde, hasta }) {
  const coincidencia = PATRON_FECHA.exec(bitacora ?? '');
  if (!coincidencia) {
    return { fecha: null, esValida: true };
  }
  const [, dia, mes, anio] = coincidencia.map(Number);
  const fecha = aFechaIso(dia, mes, anio);
  const enRango = fecha !== null && fecha >= desde && fecha <= hasta;
  return { fecha: enRango ? fecha : null, esValida: enRango };
}

function leerValores(atributos) {
  const valores = {};
  for (const { codigo, campo } of VARIABLES) {
    const valor = aEntero(atributos[campo]);
    if (valor !== null) {
      valores[codigo] = valor;
    }
  }
  return valores;
}

function detectarAlertas(valores, fechaEsValida) {
  const alertas = [];
  const { familias, personas } = valores;
  if (familias > 0 && personas !== undefined && personas < familias) {
    alertas.push(ALERTA_PERSONAS_MENOR_QUE_FAMILIAS);
  }
  if (!fechaEsValida) {
    alertas.push(ALERTA_FECHA_REPORTE_INVALIDA);
  }
  return alertas;
}

export function normalizarMunicipio(atributos, periodo) {
  const valores = leerValores(atributos);
  const { fecha, esValida } = extraerFechaReporte(atributos.Bitacora, periodo);
  return {
    codigo: atributos.mpio_cdpmp,
    nombre: aTitulo(atributos.mpio_cnmbr),
    departamento: atributos.dpto_ccdgo,
    nombreDepartamento: aTitulo(atributos.dpto_cnmbr),
    valores,
    fechaReporte: fecha,
    alertas: detectarAlertas(valores, esValida),
  };
}

export function tieneReporte(municipio) {
  return Object.values(municipio.valores).some((valor) => valor > 0);
}

function sumarValores(acumulado, valores) {
  for (const [codigo, valor] of Object.entries(valores)) {
    acumulado[codigo] = (acumulado[codigo] ?? 0) + valor;
  }
  return acumulado;
}

function fechaMasReciente(actual, candidata) {
  if (candidata === null) {
    return actual;
  }
  return actual === null || candidata > actual ? candidata : actual;
}

export function acumularPorDepartamento(municipios) {
  const departamentos = new Map();
  for (const municipio of municipios) {
    const acumulado = departamentos.get(municipio.departamento) ?? {
      codigo: municipio.departamento,
      nombre: municipio.nombreDepartamento,
      municipiosConReporte: 0,
      valores: {},
      ultimoReporte: null,
    };
    acumulado.municipiosConReporte += 1;
    sumarValores(acumulado.valores, municipio.valores);
    acumulado.ultimoReporte = fechaMasReciente(acumulado.ultimoReporte, municipio.fechaReporte);
    departamentos.set(municipio.departamento, acumulado);
  }
  return [...departamentos.values()].sort((a, b) => a.codigo.localeCompare(b.codigo));
}

export function totalizar(departamentos) {
  return departamentos.reduce((total, departamento) => sumarValores(total, departamento.valores), {});
}

export function resumirPeriodo(municipios) {
  const fechas = municipios
    .map((municipio) => municipio.fechaReporte)
    .filter(Boolean)
    .sort();
  return fechas.length > 0 ? { desde: fechas[0], hasta: fechas.at(-1) } : null;
}
