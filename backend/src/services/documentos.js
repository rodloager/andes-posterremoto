import { MARCAS, analizarTendencia } from '../algorithms/tendencias.js';
export function comoFuente(fila) {
  return {
    id: fila.id,
    entidad: fila.entidad,
    sigla: fila.sigla,
    nombre: fila.nombre,
    origen: fila.origen,
    nivel: fila.nivel,
    tipoAcceso: fila.tipo_acceso,
    enlace: fila.enlace,
    leidoEn: fila.leido_en,
    fechaPublicacion: fila.fecha_publicacion,
    fechaConsulta: fila.fecha_consulta,
    cobertura: fila.cobertura,
    variables: fila.variables,
    limitaciones: fila.limitaciones,
    uso: fila.uso,
  };
}

function agruparParametros(parametros) {
  const grupos = new Map();
  for (const { parametro, fuente_id: fuente, valor } of parametros) {
    const grupo = grupos.get(parametro) ?? { nombre: parametro, valores: [] };
    grupo.valores.push({ fuente, valor });
    grupos.set(parametro, grupo);
  }
  return [...grupos.values()];
}

export function comoEvento(fila, parametros, normas) {
  return {
    codigo: fila.codigo,
    nombre: fila.nombre,
    fecha: fila.fecha,
    epicentro: {
      municipio: fila.municipio,
      departamento: fila.departamento,
      codigoMunicipio: fila.codigo_municipio,
    },
    parametros: agruparParametros(parametros),
    coordenadas: { latitud: fila.latitud, longitud: fila.longitud, fuente: fila.fuente_coordenadas },
    normas,
  };
}

function comoPunto(fila) {
  return {
    fechaCorte: fila.fecha_corte,
    valor: fila.valor,
    calificador: fila.calificador,
    nota: fila.nota,
    fuente: fila.fuente_id,
  };
}

function describirTendencia(serie, esAcumulado) {
  const porFecha = new Map();
  for (const { fechaCorte, valor } of serie) {
    porFecha.set(fechaCorte, Math.max(porFecha.get(fechaCorte) ?? 0, valor));
  }
  const puntos = [...porFecha]
    .map(([fecha, valor]) => ({ fecha, valor }))
    .sort((uno, otro) => uno.fecha.localeCompare(otro.fecha));
  const { tendencia, pendiente, cortes } = analizarTendencia(puntos, { esAcumulado });
  return {
    clasificacion: tendencia,
    cambioDiario: pendiente,
    fechas: puntos.length,
    revisionesALaBaja: cortes
      .filter(({ marcas }) => marcas.includes(MARCAS.revision))
      .map(({ fecha }) => fecha),
  };
}

export function comoIndicadores(catalogo, valores) {
  const series = new Map();
  for (const fila of valores) {
    const serie = series.get(fila.indicador_codigo) ?? [];
    serie.push(comoPunto(fila));
    series.set(fila.indicador_codigo, serie);
  }
  return catalogo.map((fila) => ({
    codigo: fila.codigo,
    nombre: fila.nombre,
    descripcion: fila.descripcion,
    unidad: fila.unidad,
    esAcumulado: fila.es_acumulado,
    esDerivado: fila.es_derivado,
    motivoSinDato: fila.motivo_sin_dato,
    serie: series.get(fila.codigo) ?? [],
    tendencia: describirTendencia(series.get(fila.codigo) ?? [], fila.es_acumulado),
  }));
}

function indexarValores(filas, clave) {
  const indice = new Map();
  for (const fila of filas) {
    const valores = indice.get(fila[clave]) ?? {};
    valores[fila.variable_codigo] = fila.valor;
    indice.set(fila[clave], valores);
  }
  return indice;
}

export function comoTerritorio({ carga, alertas, variables, agregados, resumen, reportes, valores }) {
  const nacional = agregados.filter((fila) => fila.nivel === 'NACIONAL');
  const departamentales = agregados.filter((fila) => fila.nivel === 'DEPARTAMENTO');
  const valoresPorDepartamento = indexarValores(departamentales, 'departamento_codigo');
  const valoresPorMunicipio = indexarValores(valores, 'municipio_codigo');
  return {
    meta: {
      origen: 'OFICIAL',
      nivel: 'A',
      fuente: carga?.fuente_id ?? null,
      consultadoEn: carga?.fecha_consulta ?? null,
      periodoReportes: carga ? { desde: carga.desde, hasta: carga.hasta } : null,
      municipiosEnLaCapa: carga?.filas_leidas ?? 0,
      municipiosConReporte: carga?.municipios_con_reporte ?? 0,
      departamentosConReporte: carga?.departamentos_con_reporte ?? 0,
      alertasDeCalidad: Object.fromEntries(alertas.map(({ alerta, municipios }) => [alerta, municipios])),
    },
    variables,
    nacional: Object.fromEntries(nacional.map((fila) => [fila.variable_codigo, fila.valor])),
    departamentos: resumen.map((fila) => ({
      codigo: fila.departamento_codigo,
      nombre: fila.departamento,
      municipiosConReporte: fila.municipios_con_reporte,
      valores: valoresPorDepartamento.get(fila.departamento_codigo) ?? {},
      ultimoReporte: fila.ultimo_reporte,
    })),
    municipios: reportes.map((fila) => ({
      codigo: fila.municipio_codigo,
      nombre: fila.municipio,
      departamento: fila.departamento_codigo,
      valores: valoresPorMunicipio.get(fila.municipio_codigo) ?? {},
      fechaReporte: fila.fecha_reporte,
      alertas: fila.alertas,
    })),
  };
}

export function comoSeguros(porDepartamento, porRamo, nota) {
  const [referencia] = porDepartamento;
  return {
    meta: { fuente: referencia?.fuente_id ?? null, fechaCorte: referencia?.fecha_corte ?? null, nota },
    porDepartamento: porDepartamento.map((fila) => ({
      codigo: fila.departamento_codigo,
      nombre: fila.departamento,
      siniestros: fila.siniestros,
      pagos: fila.pagos,
      valorEstimado: fila.valor_estimado,
    })),
    porRamo: porRamo.map(({ ramo, reclamaciones, reserva }) => ({ nombre: ramo, reclamaciones, reserva })),
  };
}

function comoPartida(fila) {
  return {
    concepto: fila.concepto,
    valor: fila.valor,
    calificador: fila.calificador,
    fechaCorte: fila.fecha_corte,
    fuente: fila.fuente_id,
  };
}

export function comoEconomia(partidas, mediciones, nota) {
  const delTipo = (tipo) => partidas.filter((fila) => fila.tipo === tipo);
  const destino = delTipo('DESTINO_FONDO');
  const [referencia] = destino;
  return {
    meta: { nota },
    costos: delTipo('COSTO').map(comoPartida),
    recursos: delTipo('RECURSO').map(comoPartida),
    destinoFondo: {
      fechaCorte: referencia?.fecha_corte ?? null,
      fuente: referencia?.fuente_id ?? null,
      total: destino.reduce((total, fila) => total + fila.valor, 0),
      rubros: destino.map(({ concepto, valor, calificador }) => ({ concepto, valor, calificador })),
    },
    contratacion: mediciones.map((fila) => ({
      concepto: fila.concepto,
      contratos: fila.contratos,
      valor: fila.valor,
      contratacionDirecta: fila.contratacion_directa,
      periodo: fila.periodo,
      fuente: fila.fuente_id,
    })),
  };
}
