import { estado } from './pagina-privada.js';

const ESTADOS_DE_CARGA = Object.freeze({
  EN_COLA: ['En cola', 'atencion'],
  TERMINADA: ['Terminada', 'correcto'],
  EN_CURSO: ['En curso', 'atencion'],
  FALLIDA: ['Fallida', 'error'],
});

export const ALERTAS = Object.freeze({
  PERSONAS_MENOR_QUE_FAMILIAS: 'Menos personas que familias',
  FECHA_REPORTE_INVALIDA: 'Fecha de reporte imposible',
  EMBARAZO_SEXO_MASCULINO: 'Embarazo declarado con sexo masculino',
  EMBARAZO_EDAD_IMPROBABLE: 'Embarazo con edad improbable',
  HIPOTECA_SIN_SEGURO: 'Hipoteca o leasing sin seguro',
  COSTO_SUPERIOR_AL_AVALUO: 'Costo mayor que el avalúo',
  EVALUACION_SIN_FECHA: 'Evaluación sin fecha',
});

export const ALERTAS_DEL_REPORTE_MUNICIPAL = Object.freeze([
  'PERSONAS_MENOR_QUE_FAMILIAS',
  'FECHA_REPORTE_INVALIDA',
]);

export const ERRORES_DE_FILA = Object.freeze({
  OBLIGATORIO: 'Campo obligatorio vacío',
  TIPO: 'Tipo de dato incorrecto',
  RANGO: 'Fuera del rango permitido',
  FORMATO: 'Formato incorrecto',
  LONGITUD: 'Texto demasiado largo',
  VALOR_NO_PERMITIDO: 'Valor no permitido',
  MUNICIPIO_INEXISTENTE: 'Municipio inexistente',
  FECHA_INVALIDA: 'Fecha inexistente',
  COLUMNAS: 'Columnas de más o de menos',
  JSON_INVALIDO: 'JSON mal formado',
  JSON_NO_OBJETO: 'El registro no es un objeto',
  RECLAMACION_SIN_POLIZA: 'Reclamación sin póliza',
  VALOR_APROBADO_INCOHERENTE: 'Valor aprobado incoherente',
});

export const MOTIVOS_DE_DUPLICADO = Object.freeze({
  CLAVE_NATURAL: 'Coincidencia exacta',
  SIMILITUD: 'Parecido alto',
});

export const CAMPOS_DE_COMPARACION = Object.freeze({
  nombre: 'Nombre',
  sexo: 'Sexo',
  numeros: 'Números de la dirección',
  texto: 'Texto de la dirección',
  zona: 'Zona',
});

const ESTADOS_DE_PAR = Object.freeze({
  PENDIENTE: ['Por revisar', 'atencion'],
  FUSIONADO: ['Mismo registro', 'correcto'],
  DISTINTO: ['Distintos', 'correcto'],
  RESUELTO: ['Resuelto en otro par', 'correcto'],
});

export function estadoDePar(codigo) {
  const [texto, tipo] = ESTADOS_DE_PAR[codigo] ?? [codigo, 'atencion'];
  return estado(texto, tipo);
}

export const MOTIVOS_DE_ACCESO = Object.freeze({
  INICIO_SESION: 'Inicio de sesión',
  CIERRE_SESION: 'Cierre de sesión',
  CREDENCIALES_INVALIDAS: 'Credenciales inválidas',
  USUARIO_INACTIVO: 'Usuario inactivo',
});

export const ACCIONES = Object.freeze({
  CREAR: 'Creación',
  ACTUALIZAR: 'Actualización',
  ELIMINAR: 'Eliminación',
});

export function estadoDeCarga(codigo) {
  const [texto, tipo] = ESTADOS_DE_CARGA[codigo] ?? [codigo, 'atencion'];
  return estado(texto, tipo);
}

export function describirAlertas(alertas) {
  return alertas.length === 0 ? 'Ninguna' : alertas.map((alerta) => ALERTAS[alerta] ?? alerta).join(' · ');
}

const LONGITUD_MAXIMA = 90;

function recortar(texto) {
  return texto.length > LONGITUD_MAXIMA ? `${texto.slice(0, LONGITUD_MAXIMA - 1)}…` : texto;
}

export function resumirCambios(valores) {
  if (!valores) {
    return 'Sin datos';
  }
  return Object.entries(valores)
    .map(([campo, valor]) => `${campo}: ${recortar(String(valor))}`)
    .join(' · ');
}
