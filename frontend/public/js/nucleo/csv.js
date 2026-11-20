const MARCA_DE_ORDEN_DE_BYTES = '\uFEFF';

function celda(valor) {
  if (valor === null || valor === undefined) {
    return '';
  }
  const texto = String(valor);
  return /[",\r\n]/.test(texto) ? `"${texto.replaceAll('"', '""')}"` : texto;
}

export function aCsv(columnas, filas) {
  const lineas = [columnas, ...filas].map((fila) => fila.map(celda).join(','));
  return `${MARCA_DE_ORDEN_DE_BYTES}${lineas.join('\r\n')}\r\n`;
}

export function territorioEnCsv({ variables, municipios }) {
  const codigos = variables.map(({ codigo }) => codigo);
  return aCsv(
    ['codigo_municipio', 'municipio', 'codigo_departamento', 'fecha_reporte', 'alertas', ...codigos],
    municipios.map(({ codigo, nombre, departamento, fechaReporte, alertas, valores }) => [
      codigo,
      nombre,
      departamento,
      fechaReporte,
      alertas.join(' '),
      ...codigos.map((variable) => valores[variable]),
    ]),
  );
}

export function indicadoresEnCsv({ indicadores }) {
  return aCsv(
    ['codigo', 'indicador', 'unidad', 'fecha_corte', 'valor', 'calificador', 'fuente'],
    indicadores.flatMap(({ codigo, nombre, unidad, serie }) =>
      serie.map(({ fechaCorte, valor, calificador, fuente }) => [
        codigo,
        nombre,
        unidad,
        fechaCorte,
        valor,
        calificador,
        fuente,
      ]),
    ),
  );
}
