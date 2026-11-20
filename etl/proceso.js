import { stat } from 'node:fs/promises';
import path from 'node:path';
import { aplicarAgregados } from './cargadores/agregados.js';
import { copiarFilas } from './cargadores/copia.js';
import { crearDetectorDeDuplicados } from './cargadores/duplicados.js';
import { destinoPersonas } from './destinos/personas.js';
import { destinoReportes } from './destinos/reportes.js';
import { destinoViviendas } from './destinos/viviendas.js';
import { leerArchivo } from './extractores/archivo.js';
import { calcularHuella, rutaRelativa } from './nucleo/archivos.js';
import { iniciarMedicion } from './nucleo/medicion.js';
import { crearValidador } from './transformadores/campos.js';
import { crearEvaluadorDeReglas } from './transformadores/reglas.js';
import { crearOcultadorDeFilas, crearSeudonimizador } from './transformadores/seudonimos.js';

export const DESTINOS = Object.freeze({
  personas: destinoPersonas,
  viviendas: destinoViviendas,
  reportes: destinoReportes,
});

const CLASE_DE_CANDADO = 20_260_810;
const COLUMNAS_RECHAZADAS = ['ejecucion_id', 'numero_fila', 'errores', 'fila_cruda'];

export class ErrorDeCarga extends Error {
  constructor(codigo, mensaje) {
    super(mensaje);
    this.name = 'ErrorDeCarga';
    this.codigo = codigo;
  }
}

function fechaDeHoy() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
}

async function prepararContexto(cliente, definicion, configuracion) {
  const eventos = await cliente.query('SELECT id, fecha FROM nucleo.eventos_sismicos WHERE codigo = $1', [
    definicion.evento,
  ]);
  const fuentes = await cliente.query(
    'SELECT id, origen, fecha_consulta FROM nucleo.fuentes_datos WHERE id = $1',
    [definicion.fuente],
  );
  const municipios = await cliente.query('SELECT codigo FROM nucleo.municipios');
  const [evento] = eventos.rows;
  const [fuente] = fuentes.rows;
  if (!evento) {
    throw new ErrorDeCarga('EVENTO_INEXISTENTE', `No existe el evento ${definicion.evento}.`);
  }
  if (!fuente) {
    throw new ErrorDeCarga('FUENTE_INEXISTENTE', `No existe la fuente ${definicion.fuente}.`);
  }
  if (fuente.origen !== definicion.origen) {
    throw new ErrorDeCarga(
      'ORIGEN_INCOHERENTE',
      `La definición declara origen ${definicion.origen}, pero la fuente ${fuente.id} es ${fuente.origen}.`,
    );
  }
  const necesitaSeudonimos = definicion.campos.some(({ seudonimizar }) => seudonimizar);
  const hoy = fechaDeHoy();
  return {
    eventoId: evento.id,
    municipios: new Set(municipios.rows.map(({ codigo }) => codigo)),
    referenciasDeFecha: { evento: evento.fecha, hoy, consulta: fuente.fecha_consulta ?? hoy },
    seudonimo: necesitaSeudonimos ? crearSeudonimizador(configuracion.seudonimos?.secreto) : null,
  };
}

async function registrarConjunto(cliente, definicion) {
  await cliente.query(
    `INSERT INTO nucleo.conjuntos_datos (id, nombre, descripcion, fuente_id, destino, version_esquema)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (id) DO UPDATE SET nombre = EXCLUDED.nombre, descripcion = EXCLUDED.descripcion,
       fuente_id = EXCLUDED.fuente_id, destino = EXCLUDED.destino, version_esquema = EXCLUDED.version_esquema`,
    [
      definicion.id,
      definicion.nombre,
      definicion.descripcion,
      definicion.fuente,
      definicion.destino,
      definicion.version_esquema,
    ],
  );
}

async function obtenerEjecucion(
  cliente,
  { definicion, ejecucionId, huella, ruta, nombreArchivo, formato, tamano, usuarioId },
) {
  if (ejecucionId) {
    const { rows } = await cliente.query('SELECT * FROM nucleo.ejecuciones_etl WHERE id = $1', [ejecucionId]);
    const [ejecucion] = rows;
    if (!ejecucion || ejecucion.conjunto_id !== definicion.id || ejecucion.huella_archivo !== huella) {
      throw new ErrorDeCarga(
        'EJECUCION_INCOHERENTE',
        'El archivo en cola no coincide con la carga registrada.',
      );
    }
    await cliente.query(
      `UPDATE nucleo.ejecuciones_etl SET estado = 'EN_CURSO', finalizada_en = NULL, tamano_lote = $2, iniciada_en = now()
       WHERE id = $1`,
      [ejecucion.id, definicion.tamano_lote],
    );
    return { ...ejecucion, reanudada: ejecucion.filas_confirmadas > 0 };
  }
  const { rows: previas } = await cliente.query(
    `SELECT * FROM nucleo.ejecuciones_etl WHERE conjunto_id = $1 AND huella_archivo = $2 ORDER BY id DESC`,
    [definicion.id, huella],
  );
  const terminada = previas.find(({ estado }) => estado === 'TERMINADA');
  if (terminada) {
    throw new ErrorDeCarga('YA_CARGADO', `Este archivo ya se cargó en la ejecución ${terminada.id}.`);
  }
  const pendiente = previas.find(({ estado }) => estado === 'EN_CURSO' || estado === 'FALLIDA');
  if (pendiente) {
    await cliente.query(
      `UPDATE nucleo.ejecuciones_etl SET estado = 'EN_CURSO', finalizada_en = NULL, mensaje = NULL WHERE id = $1`,
      [pendiente.id],
    );
    return { ...pendiente, reanudada: true };
  }
  const { rows } = await cliente.query(
    `INSERT INTO nucleo.ejecuciones_etl
       (conjunto_id, usuario_id, origen_archivo, nombre_archivo, huella_archivo, estado, formato, tamano_bytes, tamano_lote)
     VALUES ($1, $2, $3, $4, $5, 'EN_CURSO', $6, $7, $8)
     RETURNING *`,
    [
      definicion.id,
      usuarioId,
      rutaRelativa(ruta),
      nombreArchivo,
      huella,
      formato,
      tamano,
      definicion.tamano_lote,
    ],
  );
  return { ...rows[0], reanudada: false };
}

async function tomarCandado(cliente, ejecucionId) {
  const { rows } = await cliente.query('SELECT pg_try_advisory_lock($1, $2) AS tomado', [
    CLASE_DE_CANDADO,
    ejecucionId,
  ]);
  return rows[0].tomado;
}

async function soltarCandado(cliente, ejecucionId) {
  await cliente.query('SELECT pg_advisory_unlock($1, $2)', [CLASE_DE_CANDADO, ejecucionId]).catch(() => null);
}

function crearProcesadorDeFilas(definicion, destino, contexto) {
  const validar = crearValidador(definicion, contexto);
  const evaluarReglas = crearEvaluadorDeReglas(definicion.reglas);
  const preparar = destino.crearPreparador();
  const ocultar = crearOcultadorDeFilas(definicion.campos);
  return function procesar(fila) {
    if (fila.error) {
      return { tipo: 'rechazada', errores: [fila.error], crudo: ocultar.estructura(fila.crudo) };
    }
    const { valores, errores } = validar(fila.datos);
    if (errores.length > 0) {
      return { tipo: 'rechazada', errores, crudo: ocultar.fila(fila.datos) };
    }
    const derivados = destino.derivar ? destino.derivar(valores, contexto) : valores;
    if (destino.omitir?.(derivados)) {
      return { tipo: 'omitida' };
    }
    const reglas = evaluarReglas(derivados);
    if (reglas.errores.length > 0) {
      return { tipo: 'rechazada', errores: reglas.errores, crudo: ocultar.fila(fila.datos) };
    }
    const preparado = preparar(derivados, contexto);
    if (preparado.errores) {
      return { tipo: 'rechazada', errores: preparado.errores, crudo: ocultar.fila(fila.datos) };
    }
    return { tipo: 'valida', registro: preparado.registro, alertas: reglas.alertas };
  };
}

function crearLote(numeroInicial) {
  return {
    numero: numeroInicial,
    validas: [],
    rechazadas: [],
    omitidas: 0,
    alertas: 0,
    leidas: 0,
    ultimaFila: 0,
  };
}

async function confirmarLote(
  cliente,
  { lote, ejecucion, destino, contexto, catalogos, origen, detectar, resumen },
) {
  await cliente.query('BEGIN');
  try {
    const insertadas =
      lote.validas.length > 0
        ? await destino.cargarLote(cliente, {
            ejecucionId: ejecucion.id,
            lote: lote.numero,
            eventoId: contexto.eventoId,
            origen,
            filas: lote.validas,
            catalogos,
          })
        : [];
    const duplicados = lote.validas.length - insertadas.length;
    const revision = detectar
      ? await detectar(cliente, { ejecucionId: ejecucion.id, ids: insertadas.map(({ id }) => id) })
      : { enRevision: 0, comparaciones: 0 };
    await copiarFilas(
      cliente,
      'staging.filas_rechazadas',
      COLUMNAS_RECHAZADAS,
      lote.rechazadas.map(({ numero, errores, crudo }) => [
        ejecucion.id,
        numero,
        JSON.stringify(errores),
        JSON.stringify(crudo ?? {}),
      ]),
    );
    await cliente.query(
      `UPDATE nucleo.ejecuciones_etl
       SET filas_leidas = filas_leidas + $2, filas_validas = filas_validas + $3, filas_rechazadas = filas_rechazadas + $4,
           duplicados = duplicados + $5, en_revision = en_revision + $6, alertas = alertas + $7, filas_confirmadas = $8
       WHERE id = $1`,
      [
        ejecucion.id,
        lote.leidas,
        lote.validas.length,
        lote.rechazadas.length,
        duplicados,
        revision.enRevision,
        lote.alertas,
        lote.ultimaFila,
      ],
    );
    await cliente.query('COMMIT');
    resumen.leidas += lote.leidas;
    resumen.validas += lote.validas.length;
    resumen.rechazadas += lote.rechazadas.length;
    resumen.omitidas += lote.omitidas;
    resumen.duplicados += duplicados;
    resumen.enRevision += revision.enRevision;
    resumen.comparaciones += revision.comparaciones;
    resumen.alertas += lote.alertas;
    resumen.lotes += 1;
  } catch (error) {
    await cliente.query('ROLLBACK').catch(() => null);
    throw error;
  }
}

const formatoDeNumero = new Intl.NumberFormat('es-CO');
const contar = (cantidad, singular, plural) =>
  `${formatoDeNumero.format(cantidad)} ${cantidad === 1 ? singular : plural}`;

export function describir(resumen) {
  const partes = [
    contar(resumen.leidas, 'fila leída', 'filas leídas'),
    contar(resumen.validas, 'válida', 'válidas'),
    contar(resumen.rechazadas, 'rechazada', 'rechazadas'),
    contar(resumen.duplicados, 'duplicado exacto descartado', 'duplicados exactos descartados'),
    contar(
      resumen.enRevision,
      'registro en revisión por posible duplicado',
      'registros en revisión por posible duplicado',
    ),
  ];
  if (resumen.omitidas > 0) {
    partes.push(contar(resumen.omitidas, 'sin reporte', 'sin reporte'));
  }
  return `${partes.join(', ')}.`;
}

export async function ejecutarCarga({
  cliente,
  definicion,
  ruta,
  formato,
  configuracion,
  ejecucionId = null,
  usuarioId = null,
  nombreArchivo = path.basename(ruta),
  alAvanzar = () => {},
}) {
  const destino = DESTINOS[definicion.destino];
  if (!definicion.formatos.includes(formato)) {
    throw new ErrorDeCarga(
      'FORMATO_NO_ADMITIDO',
      `El conjunto ${definicion.id} no admite el formato ${formato}.`,
    );
  }
  const [huella, { size: tamano }] = await Promise.all([calcularHuella(ruta), stat(ruta)]);
  await registrarConjunto(cliente, definicion);
  const contexto = await prepararContexto(cliente, definicion, configuracion);
  const catalogos = destino.cargarCatalogos ? await destino.cargarCatalogos(cliente) : {};
  const ejecucion = await obtenerEjecucion(cliente, {
    definicion,
    ejecucionId,
    huella,
    ruta,
    nombreArchivo,
    formato,
    tamano,
    usuarioId,
  });
  if (!(await tomarCandado(cliente, ejecucion.id))) {
    throw new ErrorDeCarga('EN_PROCESO', `La ejecución ${ejecucion.id} se está procesando en otra sesión.`);
  }
  const medicion = iniciarMedicion();
  const resumen = {
    leidas: 0,
    validas: 0,
    rechazadas: 0,
    omitidas: 0,
    duplicados: 0,
    enRevision: 0,
    comparaciones: 0,
    alertas: 0,
    lotes: 0,
  };
  const detectar = crearDetectorDeDuplicados(destino, definicion.duplicados);
  const procesar = crearProcesadorDeFilas(definicion, destino, contexto);
  const confirmadas = ejecucion.filas_confirmadas;
  try {
    let lote = crearLote(confirmadas + 1);
    for await (const fila of leerArchivo(ruta, formato)) {
      if (fila.numero <= confirmadas) {
        continue;
      }
      const resultado = procesar(fila);
      lote.leidas += 1;
      lote.ultimaFila = fila.numero;
      if (resultado.tipo === 'valida') {
        lote.validas.push({ numero: fila.numero, registro: resultado.registro, alertas: resultado.alertas });
        lote.alertas += resultado.alertas.length;
      } else if (resultado.tipo === 'rechazada') {
        lote.rechazadas.push({ numero: fila.numero, errores: resultado.errores, crudo: resultado.crudo });
      } else {
        lote.omitidas += 1;
      }
      if (lote.leidas >= definicion.tamano_lote) {
        await confirmarLote(cliente, {
          lote,
          ejecucion,
          destino,
          contexto,
          catalogos,
          origen: definicion.origen,
          detectar,
          resumen,
        });
        alAvanzar({ ejecucionId: ejecucion.id, filas: lote.ultimaFila });
        lote = crearLote(lote.ultimaFila + 1);
      }
    }
    if (lote.leidas > 0) {
      await confirmarLote(cliente, {
        lote,
        ejecucion,
        destino,
        contexto,
        catalogos,
        origen: definicion.origen,
        detectar,
        resumen,
      });
      alAvanzar({ ejecucionId: ejecucion.id, filas: lote.ultimaFila });
    }
    const agregados = ejecucion.agregados_aplicados
      ? { registros: 0, celdas: 0 }
      : await aplicarAgregados(cliente, {
          destino: definicion.destino,
          ejecucionId: ejecucion.id,
          eventoId: contexto.eventoId,
          origen: definicion.origen,
        });
    const duracionMs = (ejecucion.duracion_ms ?? 0) + medicion.milisegundos();
    const memoriaMaximaMb = Math.max(Number(ejecucion.memoria_maxima_mb ?? 0), medicion.memoriaMaximaMb());
    const { rows } = await cliente.query(
      `UPDATE nucleo.ejecuciones_etl
       SET estado = 'TERMINADA', finalizada_en = now(), duracion_ms = $2, memoria_maxima_mb = $3, mensaje = $4
       WHERE id = $1
       RETURNING *`,
      [ejecucion.id, duracionMs, memoriaMaximaMb, describir(resumen)],
    );
    return {
      ejecucion: rows[0],
      resumen,
      agregados,
      reanudada: ejecucion.reanudada,
      duracionMs,
      memoriaMaximaMb,
    };
  } catch (error) {
    await cliente
      .query(
        `UPDATE nucleo.ejecuciones_etl
         SET estado = 'FALLIDA', finalizada_en = now(), mensaje = $2, duracion_ms = coalesce(duracion_ms, 0) + $3,
             memoria_maxima_mb = greatest(coalesce(memoria_maxima_mb, 0), $4)
         WHERE id = $1`,
        [
          ejecucion.id,
          String(error.message).slice(0, 1000),
          medicion.milisegundos(),
          medicion.memoriaMaximaMb(),
        ],
      )
      .catch(() => null);
    throw error;
  } finally {
    medicion.detener();
    await soltarCandado(cliente, ejecucion.id);
  }
}
