import { VARIABLES, extraerFechaReporte } from '../transformadores/afectaciones.js';

const INSERTAR_REPORTES = `
  INSERT INTO nucleo.reportes_municipales (ejecucion_id, evento_id, municipio_codigo, fecha_reporte, alertas)
  SELECT $1, $2, x.municipio, x.fecha, x.alertas
  FROM jsonb_to_recordset($3::jsonb) AS x(municipio char(5), fecha date, alertas text[])
  ON CONFLICT (ejecucion_id, municipio_codigo) DO NOTHING
  RETURNING id, municipio_codigo`;

const INSERTAR_VALORES = `
  INSERT INTO nucleo.valores_reporte_municipal (reporte_id, variable_codigo, valor)
  SELECT x.reporte, x.variable, x.valor
  FROM jsonb_to_recordset($1::jsonb) AS x(reporte bigint, variable text, valor numeric)`;

export const destinoReportes = Object.freeze({
  nombre: 'reportes',
  tablaDeRegistros: 'nucleo.reportes_municipales',
  reemplazaLaCargaAnterior: true,

  derivar(valores, { referenciasDeFecha }) {
    const { fecha, esValida } = extraerFechaReporte(valores.bitacora, {
      desde: referenciasDeFecha.evento,
      hasta: referenciasDeFecha.consulta,
    });
    return { ...valores, fecha_reporte: fecha, fecha_reporte_valida: esValida };
  },

  omitir(valores) {
    return !VARIABLES.some(({ codigo }) => valores[codigo] > 0);
  },

  crearPreparador() {
    return function preparar(valores) {
      const cifras = Object.fromEntries(
        VARIABLES.filter(({ codigo }) => valores[codigo] !== null && valores[codigo] !== undefined).map(
          ({ codigo }) => [codigo, valores[codigo]],
        ),
      );
      return { registro: { municipio: valores.municipio, fecha: valores.fecha_reporte, valores: cifras } };
    };
  },

  async cargarLote(cliente, { ejecucionId, eventoId, filas }) {
    const reportes = filas.map(({ registro, alertas }) => ({
      municipio: registro.municipio,
      fecha: registro.fecha,
      alertas,
    }));
    const { rows } = await cliente.query(INSERTAR_REPORTES, [
      ejecucionId,
      eventoId,
      JSON.stringify(reportes),
    ]);
    const porMunicipio = new Map(rows.map(({ id, municipio_codigo: municipio }) => [municipio, id]));
    const valores = filas.flatMap(({ registro }) =>
      porMunicipio.has(registro.municipio)
        ? Object.entries(registro.valores).map(([variable, valor]) => ({
            reporte: porMunicipio.get(registro.municipio),
            variable,
            valor,
          }))
        : [],
    );
    if (valores.length > 0) {
      await cliente.query(INSERTAR_VALORES, [JSON.stringify(valores)]);
    }
    const numeroPorMunicipio = new Map(filas.map(({ numero, registro }) => [registro.municipio, numero]));
    return rows.map(({ id, municipio_codigo: municipio }) => ({
      id,
      numero_fila: numeroPorMunicipio.get(municipio),
    }));
  },

  duplicados: null,
});
