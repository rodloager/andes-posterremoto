import { rm } from 'node:fs/promises';
import path from 'node:path';
import { formatoPorExtension } from '../../../etl/extractores/archivo.js';
import { esErrorDeEstructura } from '../../../etl/extractores/errores.js';
import { calcularHuella, raiz } from '../../../etl/nucleo/archivos.js';
import { ErrorDeDefinicion, leerDefinicion, listarDefiniciones } from '../../../etl/nucleo/definiciones.js';
import { crearOcultadorDeFilas } from '../../../etl/transformadores/seudonimos.js';
import { ErrorHttp, noEncontrado } from '../utils/errores.js';
import { paginar } from './paginacion.js';

const PRIMER_CARACTER_VISIBLE = 32;
const CARACTER_DE_BORRADO = 127;

const esVisible = (caracter) => {
  const codigo = caracter.codePointAt(0);
  return codigo >= PRIMER_CARACTER_VISIBLE && codigo !== CARACTER_DE_BORRADO;
};
const LONGITUD_MAXIMA_DEL_NOMBRE = 255;

export function nombreSeguro(nombreOriginal) {
  const limpio = [...path.basename(String(nombreOriginal ?? ''))].filter(esVisible).join('').trim();
  return (limpio || 'archivo').slice(0, LONGITUD_MAXIMA_DEL_NOMBRE);
}

export function comoCarga(fila) {
  return {
    id: fila.id,
    conjunto: fila.conjunto_id,
    nombreArchivo: fila.nombre_archivo,
    formato: fila.formato,
    tamanoBytes: fila.tamano_bytes,
    huellaArchivo: fila.huella_archivo,
    estado: fila.estado,
    encoladaEn: fila.encolada_en,
    iniciadaEn: fila.iniciada_en,
    finalizadaEn: fila.finalizada_en,
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

function enElOrdenDeLaDefinicion(contenido, campos) {
  if (!contenido || typeof contenido !== 'object' || Array.isArray(contenido)) {
    return contenido;
  }
  const posiciones = new Map(
    campos.map((campo, posicion) => [(campo.origen ?? campo.nombre).trim().toLowerCase(), posicion]),
  );
  const posicionDe = (clave) => posiciones.get(clave.trim().toLowerCase()) ?? campos.length;
  return Object.fromEntries(
    Object.entries(contenido).sort(([una], [otra]) => posicionDe(una) - posicionDe(otra)),
  );
}

async function descartar(ruta) {
  await rm(ruta, { force: true });
}

export function crearServicioCargas({ repositorio, lanzarTrabajador = () => false }) {
  async function definicionDe(conjunto) {
    try {
      return await leerDefinicion(conjunto);
    } catch (error) {
      if (error instanceof ErrorDeDefinicion) {
        throw noEncontrado(`No existe el conjunto de datos ${conjunto}.`);
      }
      throw error;
    }
  }

  return {
    async importables() {
      const definiciones = await listarDefiniciones();
      return {
        conjuntos: definiciones.map(({ id, nombre, origen, destino, formatos }) => ({
          id,
          nombre,
          origen,
          destino,
          formatos,
        })),
      };
    },

    async registrar({ conjunto, archivo, usuario }) {
      try {
        const definicion = await definicionDe(conjunto);
        if (!(await repositorio.existeConjunto(conjunto))) {
          throw noEncontrado(
            `El conjunto ${conjunto} no está registrado en la base de datos. Ejecute npm run db:seed.`,
          );
        }
        const formato = formatoPorExtension(archivo.originalname);
        if (!formato || !definicion.formatos.includes(formato)) {
          throw new ErrorHttp(
            400,
            'FORMATO_NO_ADMITIDO',
            `El conjunto ${conjunto} acepta archivos ${definicion.formatos.map((nombre) => nombre.toUpperCase()).join(', ')}.`,
          );
        }
        const huella = await calcularHuella(archivo.path);
        const [previa] = await repositorio.previasDelArchivo(conjunto, huella);
        if (previa) {
          throw new ErrorHttp(
            409,
            previa.estado === 'TERMINADA' ? 'YA_CARGADO' : 'EN_PROCESO',
            previa.estado === 'TERMINADA'
              ? `Este archivo ya se cargó en la ejecución ${previa.id}.`
              : `Este archivo ya está en la cola, en la ejecución ${previa.id}.`,
            { ejecucion: previa.id },
          );
        }
        const fila = await repositorio.encolar({
          conjunto,
          usuarioId: usuario.id,
          rutaGuardada: path.relative(raiz, archivo.path).split(path.sep).join('/'),
          nombreArchivo: nombreSeguro(archivo.originalname),
          huella,
          formato,
          tamano: archivo.size,
        });
        const trabajadorActivo = lanzarTrabajador();
        return { carga: comoCarga(fila), trabajadorActivo };
      } catch (error) {
        await descartar(archivo.path);
        throw error;
      }
    },

    async carga(id) {
      const fila = await repositorio.ejecucion(id);
      if (!fila) {
        throw noEncontrado(`No existe la carga ${id}.`);
      }
      return { carga: comoCarga(fila) };
    },

    async rechazos(id, { despues, limite }) {
      const fila = await repositorio.ejecucion(id);
      if (!fila) {
        throw noEncontrado(`No existe la carga ${id}.`);
      }
      const definicion = await definicionDe(fila.conjunto_id).catch(() => null);
      const campos = definicion?.campos ?? [];
      const ocultar = crearOcultadorDeFilas(campos);
      const filas = await repositorio.rechazos({ ejecucionId: id, despues, limite });
      return paginar(
        filas.map(({ numero_fila: numero, errores, fila_cruda: filaCruda }) => {
          const estructural = errores.some(({ codigo }) => esErrorDeEstructura(codigo));
          return {
            fila: numero,
            errores: errores.map(ocultar.error),
            estructural,
            contenido: estructural
              ? ocultar.estructura(filaCruda)
              : enElOrdenDeLaDefinicion(ocultar.fila(filaCruda), campos),
          };
        }),
        limite,
        (rechazo) => rechazo.fila,
      );
    },

    async resumenDeRegistros() {
      const [motivos, pendientes] = await Promise.all([
        repositorio.rechazosPorMotivo(),
        repositorio.duplicadosPendientes(),
      ]);
      return {
        rechazosPorMotivo: motivos.map(({ conjunto_id: conjunto, codigo, campo, filas }) => ({
          conjunto,
          codigo,
          campo,
          filas,
        })),
        duplicadosPendientes: Object.fromEntries(
          ['personas', 'viviendas'].map((destino) => {
            const fila = pendientes.find((elemento) => elemento.destino === destino);
            return [destino, { pares: fila?.pares ?? 0, registros: fila?.registros ?? 0 }];
          }),
        ),
      };
    },
  };
}
