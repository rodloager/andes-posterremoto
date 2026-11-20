export const GRUPOS_QUINQUENALES = Object.freeze([
  { nombre: '0 a 4', desde: 0, hasta: 4, peso: 7.2 },
  { nombre: '5 a 9', desde: 5, hasta: 9, peso: 7.4 },
  { nombre: '10 a 14', desde: 10, hasta: 14, peso: 7.6 },
  { nombre: '15 a 19', desde: 15, hasta: 19, peso: 7.9 },
  { nombre: '20 a 24', desde: 20, hasta: 24, peso: 8.4 },
  { nombre: '25 a 29', desde: 25, hasta: 29, peso: 8.3 },
  { nombre: '30 a 34', desde: 30, hasta: 34, peso: 7.9 },
  { nombre: '35 a 39', desde: 35, hasta: 39, peso: 7.3 },
  { nombre: '40 a 44', desde: 40, hasta: 44, peso: 6.6 },
  { nombre: '45 a 49', desde: 45, hasta: 49, peso: 6.0 },
  { nombre: '50 a 54', desde: 50, hasta: 54, peso: 5.7 },
  { nombre: '55 a 59', desde: 55, hasta: 59, peso: 5.2 },
  { nombre: '60 a 64', desde: 60, hasta: 64, peso: 4.5 },
  { nombre: '65 a 69', desde: 65, hasta: 69, peso: 3.6 },
  { nombre: '70 a 74', desde: 70, hasta: 74, peso: 2.7 },
  { nombre: '75 a 79', desde: 75, hasta: 79, peso: 1.9 },
  { nombre: '80 o más', desde: 80, hasta: 95, peso: 1.8 },
]);

export const GRUPOS_EDAD = Object.freeze([
  { nombre: '0 a 9 años', desde: 0 },
  { nombre: '10 a 17 años', desde: 10 },
  { nombre: '18 a 59 años', desde: 18 },
  { nombre: '60 años o más', desde: 60 },
]);

export const EDAD_ADULTO_MAYOR = 60;
export const EDAD_MAYORIA = 18;
export const PROBABILIDAD_MUJER = 0.51;

export const CONDICIONES_INSTITUCIONALES = Object.freeze([
  { nombre: 'Civil', peso: 0.975 },
  { nombre: 'Militar', peso: 0.012 },
  { nombre: 'Privada de la libertad en establecimiento de reclusión', peso: 0.009 },
  { nombre: 'Privada de la libertad en otra modalidad', peso: 0.004 },
]);

export const TENENCIAS = Object.freeze([
  { nombre: 'Propietario', peso: 0.42 },
  { nombre: 'Arrendatario', peso: 0.4 },
  { nombre: 'Ocupante con permiso', peso: 0.12 },
  { nombre: 'Otra', peso: 0.04 },
  { nombre: 'Sin dato', peso: 0.02 },
]);

export const SITUACIONES = Object.freeze([
  { nombre: 'Damnificada', peso: 0.62 },
  { nombre: 'Afectada', peso: 0.38 },
]);

export const VULNERABILIDADES_DECLARADAS = Object.freeze([
  { nombre: 'Discapacidad', probabilidad: 0.07 },
  { nombre: 'Necesidades especiales', probabilidad: 0.05 },
  { nombre: 'Movilidad reducida', probabilidad: 0.04 },
  { nombre: 'Vulnerabilidad socioeconómica', probabilidad: 0.35 },
  { nombre: 'Comunidad de atención prioritaria', probabilidad: 0.08 },
]);

export const EMBARAZO = Object.freeze({
  nombre: 'Embarazo',
  edadMinima: 15,
  edadMaxima: 49,
  probabilidad: 0.06,
});

export const ESTADOS_FISICOS = Object.freeze([
  { nombre: 'Sin afectación', peso: 0.18, afectada: false },
  { nombre: 'Afectación leve', peso: 0.3, afectada: true },
  { nombre: 'Afectación moderada', peso: 0.22, afectada: true },
  { nombre: 'Afectación grave', peso: 0.14, afectada: true },
  { nombre: 'Destrucción total', peso: 0.11, afectada: true },
  { nombre: 'Pendiente de evaluación', peso: 0.05, afectada: false },
]);

export const POSICION_DESTRUCCION_TOTAL = 4;

export const OCUPACIONES = Object.freeze([
  { nombre: 'Vivienda propia', peso: 0.44 },
  { nombre: 'Vivienda arrendada', peso: 0.38 },
  { nombre: 'Ocupada por terceros', peso: 0.09 },
  { nombre: 'Desocupada', peso: 0.05 },
  { nombre: 'Otra modalidad', peso: 0.04 },
]);

export const FINANCIACIONES = Object.freeze([
  { nombre: 'Hipotecada', peso: 0.13, probabilidadSeguro: 0.93, exigeSeguro: true },
  { nombre: 'Leasing habitacional', peso: 0.03, probabilidadSeguro: 0.9, exigeSeguro: true },
  { nombre: 'Sin financiación', peso: 0.78, probabilidadSeguro: 0.05, exigeSeguro: false },
  { nombre: 'Pendiente de verificación', peso: 0.06, probabilidadSeguro: 0.15, exigeSeguro: false },
]);

export const ASEGURAMIENTOS = Object.freeze([
  { nombre: 'Asegurada' },
  { nombre: 'No asegurada' },
  { nombre: 'Póliza pendiente de verificación' },
]);

export const POSICION_ASEGURADA = 0;
export const POSICION_NO_ASEGURADA = 1;
export const POSICION_POLIZA_PENDIENTE = 2;
export const PROBABILIDAD_POLIZA_PENDIENTE = 0.08;

export const ESTRATOS = Object.freeze([
  { peso: 0.22, valorBase: 45_000_000 },
  { peso: 0.34, valorBase: 80_000_000 },
  { peso: 0.26, valorBase: 140_000_000 },
  { peso: 0.1, valorBase: 260_000_000 },
  { peso: 0.05, valorBase: 420_000_000 },
  { peso: 0.03, valorBase: 700_000_000 },
]);

export const RECLAMACIONES = Object.freeze({
  probabilidadPresentar: 0.78,
  resoluciones: [
    { nombre: 'aprobada', peso: 0.55 },
    { nombre: 'rechazada', peso: 0.12 },
    { nombre: 'enEstudio', peso: 0.33 },
  ],
  probabilidadPago: 0.45,
});

export const TIPOS_INFRAESTRUCTURA = Object.freeze([
  { nombre: 'Vías nacionales', base: 46 },
  { nombre: 'Carreteras departamentales', base: 118 },
  { nombre: 'Puentes', base: 74 },
  { nombre: 'Edificaciones públicas', base: 310 },
  { nombre: 'Hospitales', base: 38 },
  { nombre: 'Centros de salud', base: 205 },
  { nombre: 'Instituciones educativas', base: 1240 },
  { nombre: 'Redes eléctricas', base: 92 },
  { nombre: 'Redes de acueducto', base: 110 },
  { nombre: 'Redes de alcantarillado', base: 64 },
  { nombre: 'Telecomunicaciones', base: 57 },
  { nombre: 'Infraestructura comercial', base: 860 },
  { nombre: 'Infraestructura industrial', base: 143 },
]);

export const NIVELES_DANO = Object.freeze([
  { nombre: 'Leve', peso: 0.42 },
  { nombre: 'Moderado', peso: 0.3 },
  { nombre: 'Grave', peso: 0.19 },
  { nombre: 'Destrucción', peso: 0.09 },
]);

export const SUMINISTROS = Object.freeze([
  { nombre: 'Alimentos', unidad: 'kits', requerido: 420_000, indicador: 'alimentos_distribuidos' },
  { nombre: 'Agua potable', unidad: 'litros', requerido: 9_600_000, indicador: 'agua_suministrada' },
  { nombre: 'Medicamentos', unidad: 'unidades', requerido: 310_000, indicador: 'medicamentos_entregados' },
  { nombre: 'Kits de emergencia', unidad: 'kits', requerido: 185_000, indicador: 'kits_emergencia' },
]);

export const SECTORES_ECONOMICOS = Object.freeze([
  { nombre: 'Daños materiales', factor: 1.8, indicador: 'danos_materiales' },
  { nombre: 'Comercio', factor: 0.35, indicador: 'perdidas_comerciales' },
  { nombre: 'Sector empresarial', factor: 0.28, indicador: null },
  { nombre: 'Agricultura', factor: 0.12, indicador: 'perdidas_agricolas' },
  { nombre: 'Industria', factor: 0.22, indicador: 'perdidas_industriales' },
]);

export const ORIGENES_RECURSOS = Object.freeze([
  { nombre: 'Recursos públicos', participacion: 0.55, comprometido: 0.62, ejecutado: 0.38 },
  { nombre: 'Recursos privados', participacion: 0.12, comprometido: 0.7, ejecutado: 0.44 },
  { nombre: 'Aseguradoras', participacion: 0.09, comprometido: 0.58, ejecutado: 0.31 },
]);
