import { noEncontrado } from '../utils/errores.js';
import { paginar } from './paginacion.js';

export const ENTIDADES_DE_DATOS = Object.freeze(['fuente', 'carga', 'persona', 'vivienda']);

const REGLAS = Object.freeze([
  {
    codigo: 'PERSONAS_MENOR_QUE_FAMILIAS',
    campo: 'personas_menor_que_familias',
    descripcion: 'El municipio informa menos personas que familias.',
    accion: 'Se conserva el valor de la fuente y el registro queda marcado como inconsistente.',
  },
  {
    codigo: 'FECHA_REPORTE_INVALIDA',
    campo: 'fecha_invalida',
    descripcion: 'La bitácora trae una fecha anterior al sismo o posterior a la consulta.',
    accion: 'El registro queda sin fecha de reporte y con una alerta.',
  },
  {
    codigo: 'SIN_FECHA_DE_REPORTE',
    campo: 'sin_fecha_en_bitacora',
    descripcion: 'La bitácora no trae ninguna fecha.',
    accion: 'El registro se carga sin fecha de reporte.',
  },
]);

const porId = (fila) => fila.id;

function comoEjecucion(fila) {
  return {
    id: fila.id,
    conjunto: fila.conjunto_id,
    origenArchivo: fila.origen_archivo,
    nombreArchivo: fila.nombre_archivo,
    huellaArchivo: fila.huella_archivo,
    formato: fila.formato,
    tamanoBytes: fila.tamano_bytes,
    encoladaEn: fila.encolada_en,
    iniciadaEn: fila.iniciada_en,
    finalizadaEn: fila.finalizada_en,
    estado: fila.estado,
    filasLeidas: fila.filas_leidas,
    filasValidas: fila.filas_validas,
    filasRechazadas: fila.filas_rechazadas,
    duplicados: fila.duplicados,
    enRevision: fila.en_revision,
    alertas: fila.alertas,
    filasConfirmadas: fila.filas_confirmadas,
    duracionMs: fila.duracion_ms,
    memoriaMaximaMb: fila.memoria_maxima_mb === null ? null : Number(fila.memoria_maxima_mb),
    mensaje: fila.mensaje,
  };
}

function comoConjunto(fila) {
  return {
    id: fila.id,
    nombre: fila.nombre,
    descripcion: fila.descripcion,
    destino: fila.destino,
    fuente: {
      id: fila.fuente_id,
      nombre: fila.sigla ?? fila.entidad,
      origen: fila.origen,
      nivel: fila.nivel,
    },
    ultimaCarga: fila.ejecucion_id
      ? {
          id: fila.ejecucion_id,
          estado: fila.estado,
          finalizadaEn: fila.finalizada_en,
          filasLeidas: fila.filas_leidas,
        }
      : null,
    registros: fila.registros ?? 0,
  };
}

function comoRegistro(fila) {
  return {
    municipio: fila.municipio_codigo,
    nombre: fila.municipio,
    departamento: fila.departamento_codigo,
    nombreDepartamento: fila.departamento,
    fechaReporte: fila.fecha_reporte,
    alertas: fila.alertas,
    carga: fila.ejecucion_id,
    valores: fila.valores,
  };
}

export function comoCambio(fila) {
  return {
    id: fila.id,
    accion: fila.accion,
    entidad: fila.entidad,
    entidadId: fila.entidad_id,
    antes: fila.antes,
    despues: fila.despues,
    ocurridoEn: fila.ocurrido_en,
    usuario: fila.usuario ? { nombre: fila.usuario, correo: fila.correo } : null,
  };
}

function comoFuenteEditada(fila) {
  return {
    id: fila.id,
    nombre: fila.sigla ?? fila.entidad,
    fechaConsulta: fila.fecha_consulta,
    cobertura: fila.cobertura,
    variables: fila.variables,
    limitaciones: fila.limitaciones,
    actualizadoEn: fila.actualizado_en,
  };
}

function describirReglas(resumen) {
  const conteos = { ...resumen, sin_fecha_en_bitacora: resumen.sin_fecha - resumen.fecha_invalida };
  return REGLAS.map(({ codigo, campo, descripcion, accion }) => ({
    codigo,
    descripcion,
    accion,
    municipios: conteos[campo],
  }));
}

function describirVacios(valoresPresentes, municipios) {
  return valoresPresentes
    .map(({ codigo, nombre, con_valor: conValor }) => ({
      variable: codigo,
      nombre,
      sinValor: municipios - conValor,
      proporcion: municipios === 0 ? 0 : (municipios - conValor) / municipios,
    }))
    .sort((una, otra) => otra.sinValor - una.sinValor);
}

export function crearServicioAdministracion(repositorio) {
  return {
    async conjuntos() {
      return { conjuntos: (await repositorio.conjuntos()).map(comoConjunto) };
    },

    async ejecuciones({ despues, limite }) {
      const filas = await repositorio.ejecuciones({ despues, limite });
      return paginar(filas.map(comoEjecucion), limite, porId);
    },

    async registros(filtros) {
      const filas = await repositorio.reportes(filtros);
      return paginar(filas.map(comoRegistro), filtros.limite, (registro) => registro.municipio);
    },

    async calidad() {
      const [resumen, valoresPresentes] = await Promise.all([
        repositorio.resumenDeCalidad(),
        repositorio.valoresPresentes(),
      ]);
      return {
        conjunto: 'dane-afectaciones',
        carga: {
          id: resumen.ejecucion_id,
          filasLeidas: resumen.filas_leidas,
          finalizadaEn: resumen.finalizada_en,
        },
        municipios: resumen.municipios,
        reglas: describirReglas(resumen),
        camposVacios: describirVacios(valoresPresentes, resumen.municipios),
      };
    },

    async actualizarFuente(id, cambios, usuario) {
      const fila = await repositorio.actualizarFuente(id, cambios, usuario.id);
      if (!fila) {
        throw noEncontrado(`No existe la fuente ${id}.`);
      }
      return { fuente: comoFuenteEditada(fila) };
    },

    async historial({ despues, limite }) {
      const filas = await repositorio.auditoria({ despues, limite, entidades: ENTIDADES_DE_DATOS });
      return paginar(filas.map(comoCambio), limite, porId);
    },
  };
}
