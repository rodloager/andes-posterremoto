import {
  SIN_DATO,
  formatearCantidad,
  formatearFecha,
  formatearNumero,
  formatearPorcentaje,
  formatearValor,
} from '../nucleo/formato.js';
import { escaparHtml } from '../nucleo/html.js';
import { tema } from './tema.js';

const BILLON = 1e12;
const MILLON = 1e6;
const MIL = 1e3;
const ANCHO_ETIQUETA = 150;
const MARGEN_DERECHO = 20;
const ANCHO_POR_CARACTER = 7;

const EJE = {
  axisLine: { lineStyle: { color: tema.borde } },
  axisTick: { show: false },
  axisLabel: { color: tema.textoSecundario, fontSize: 12 },
  splitLine: { lineStyle: { color: tema.borde, type: 'dashed' } },
};

const LEYENDA = {
  bottom: 0,
  icon: 'roundRect',
  itemWidth: 12,
  itemHeight: 12,
  textStyle: { color: tema.texto, fontSize: 12 },
};

function base(opcion) {
  return {
    color: tema.series,
    textStyle: { fontFamily: tema.fuente, color: tema.texto },
    animationDuration: 250,
    ...opcion,
  };
}

function rejilla(conLeyenda, margenDerecho = MARGEN_DERECHO) {
  return { left: 8, right: margenDerecho, top: 16, bottom: conLeyenda ? 36 : 8, containLabel: true };
}

function margenParaEtiquetas(textos) {
  const masLargo = Math.max(...textos.map((texto) => texto.length));
  return MARGEN_DERECHO + masLargo * ANCHO_POR_CARACTER;
}

function abreviar(valor) {
  const magnitud = Math.abs(valor);
  if (magnitud >= BILLON) {
    return `${formatearNumero(valor / BILLON)} bill.`;
  }
  if (magnitud >= MILLON) {
    return `${formatearNumero(valor / MILLON)} mill.`;
  }
  if (magnitud >= 10 * MIL) {
    return `${formatearNumero(valor / MIL)} mil`;
  }
  return formatearNumero(valor);
}

function ejeDeValores(formatear = abreviar) {
  return {
    type: 'value',
    splitNumber: 4,
    ...EJE,
    axisLabel: { ...EJE.axisLabel, hideOverlap: true, formatter: formatear },
  };
}

const sumar = (valores) => valores.reduce((total, valor) => total + valor, 0);
const textoDe = (unidad) => (valor) => formatearValor(valor, unidad).texto;
const participacion = (valor, total) =>
  valor === null || valor === undefined
    ? SIN_DATO
    : formatearPorcentaje(total === 0 ? 0 : (valor / total) * 100);

function tablaDeSeries(encabezado, categorias, series, formatear) {
  return {
    columnas: [{ nombre: encabezado }, ...series.map(({ nombre }) => ({ nombre, numerica: true }))],
    filas: categorias.map((categoria, posicion) => [
      categoria,
      ...series.map(({ valores }) => formatear(valores[posicion])),
    ]),
  };
}

export function barras({
  categorias,
  series,
  unidad = '',
  apiladas = false,
  colorPorCategoria = false,
  colores,
  encabezado,
}) {
  const formatear = textoDe(unidad);
  const variasSeries = series.length > 1;
  const margen = variasSeries ? MARGEN_DERECHO : margenParaEtiquetas(series[0].valores.map(formatear));
  return {
    opcion: base({
      color: colores ?? tema.series,
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: formatear },
      legend: variasSeries ? LEYENDA : undefined,
      grid: rejilla(variasSeries, margen),
      xAxis: ejeDeValores(),
      yAxis: {
        type: 'category',
        data: categorias,
        inverse: true,
        ...EJE,
        axisLabel: { ...EJE.axisLabel, width: ANCHO_ETIQUETA, overflow: 'break' },
      },
      series: series.map(({ nombre, valores }) => ({
        name: nombre,
        type: 'bar',
        stack: apiladas ? 'total' : undefined,
        colorBy: colorPorCategoria ? 'data' : 'series',
        data: valores,
        barMaxWidth: 26,
        label: {
          show: !variasSeries,
          position: 'right',
          color: tema.texto,
          formatter: ({ value }) => formatear(value),
        },
      })),
    }),
    tabla: tablaDeSeries(encabezado ?? 'Categoría', categorias, series, formatear),
  };
}

export function circular({ categorias, valores, unidad = '', encabezado }) {
  const formatear = textoDe(unidad);
  const total = sumar(valores);
  return {
    opcion: base({
      tooltip: {
        trigger: 'item',
        formatter: ({ name, value }) =>
          `${escaparHtml(name)}: ${formatear(value)} (${participacion(value, total)})`,
      },
      legend: LEYENDA,
      series: [
        {
          type: 'pie',
          radius: ['46%', '70%'],
          center: ['50%', '44%'],
          itemStyle: { borderColor: tema.fondo, borderWidth: 2 },
          label: { color: tema.texto, formatter: ({ value }) => participacion(value, total) },
          data: categorias.map((nombre, posicion) => ({ name: nombre, value: valores[posicion] })),
        },
      ],
    }),
    tabla: {
      columnas: [
        { nombre: encabezado ?? 'Categoría' },
        { nombre: unidad || 'Cantidad', numerica: true },
        { nombre: 'Participación', numerica: true },
      ],
      filas: categorias.map((nombre, posicion) => [
        nombre,
        formatear(valores[posicion]),
        participacion(valores[posicion], total),
      ]),
    },
  };
}

export function piramide({ grupos, hombres, mujeres }) {
  const serie = (nombre, valores, color) => ({
    name: nombre,
    type: 'bar',
    stack: 'total',
    data: valores,
    barCategoryGap: '12%',
    itemStyle: { color },
  });
  return {
    opcion: base({
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        valueFormatter: (valor) => (valor === null ? SIN_DATO : formatearNumero(Math.abs(valor))),
      },
      legend: LEYENDA,
      grid: rejilla(true),
      xAxis: ejeDeValores((valor) => abreviar(Math.abs(valor))),
      yAxis: { type: 'category', data: grupos, ...EJE },
      series: [
        serie(
          'Hombres',
          hombres.map((valor) => (valor === null ? null : -valor)),
          tema.series[0],
        ),
        serie('Mujeres', mujeres, tema.series[3]),
      ],
    }),
    tabla: {
      columnas: [
        { nombre: 'Grupo de edad' },
        { nombre: 'Hombres', numerica: true },
        { nombre: 'Mujeres', numerica: true },
      ],
      filas: grupos.map((grupo, posicion) => [
        grupo,
        formatearCantidad(hombres[posicion]),
        formatearCantidad(mujeres[posicion]),
      ]),
    },
  };
}

function descripcionDelPunto(parametros, formatear) {
  const [{ value }] = parametros;
  const encabezado = formatearFecha(value[0]);
  const lineas = parametros.map(({ marker, seriesName, value: punto }) => {
    return `${marker} ${escaparHtml(seriesName)}: <strong>${formatear(punto[1])}</strong>`;
  });
  return [encabezado, ...lineas].join('<br>');
}

export function lineas({ series, unidad = '' }) {
  const formatear = textoDe(unidad);
  const fechas = [...new Set(series.flatMap(({ puntos }) => puntos.map(({ fecha }) => fecha)))].sort();
  const valorEn = (puntos, fecha) => puntos.find((punto) => punto.fecha === fecha)?.valor;
  return {
    opcion: base({
      tooltip: {
        trigger: 'axis',
        formatter: (parametros) => descripcionDelPunto(parametros, formatear),
      },
      legend: series.length > 1 ? LEYENDA : undefined,
      grid: rejilla(series.length > 1),
      xAxis: {
        type: 'time',
        ...EJE,
        splitLine: { show: false },
        axisLabel: {
          ...EJE.axisLabel,
          hideOverlap: true,
          formatter: (marca) => formatearFecha(new Date(marca).toISOString().slice(0, 10)).slice(0, 5),
        },
      },
      yAxis: ejeDeValores(),
      series: series.map(({ nombre, puntos }) => ({
        name: nombre,
        type: 'line',
        symbol: 'circle',
        symbolSize: 7,
        lineStyle: { width: 2.5 },
        data: puntos.map(({ fecha, valor }) => [fecha, valor]),
      })),
    }),
    tabla: {
      columnas: [{ nombre: 'Fecha de corte' }, ...series.map(({ nombre }) => ({ nombre, numerica: true }))],
      filas: fechas.map((fecha) => [
        formatearFecha(fecha),
        ...series.map(({ puntos }) => {
          const valor = valorEn(puntos, fecha);
          return valor === undefined ? 'Sin dato' : formatear(valor);
        }),
      ]),
    },
  };
}

export function embudo({ etapas, valores, unidad = '' }) {
  const formatear = textoDe(unidad);
  const [inicial] = valores;
  return {
    opcion: base({
      tooltip: {
        trigger: 'item',
        formatter: ({ name, value }) =>
          `${escaparHtml(name)}: ${formatear(value)} (${participacion(value, inicial)})`,
      },
      series: [
        {
          type: 'funnel',
          sort: 'none',
          left: '6%',
          right: '6%',
          top: 12,
          bottom: 12,
          gap: 3,
          minSize: '18%',
          label: {
            position: 'inside',
            color: tema.fondo,
            fontWeight: 600,
            formatter: ({ name, value }) => `${name}\n${formatear(value)}`,
          },
          itemStyle: { borderWidth: 0 },
          data: etapas.map((nombre, posicion) => ({ name: nombre, value: valores[posicion] })),
        },
      ],
    }),
    tabla: {
      columnas: [
        { nombre: 'Etapa' },
        { nombre: unidad || 'Cantidad', numerica: true },
        { nombre: 'Sobre la primera etapa', numerica: true },
      ],
      filas: etapas.map((nombre, posicion) => [
        nombre,
        formatear(valores[posicion]),
        participacion(valores[posicion], inicial),
      ]),
    },
  };
}

export function matriz({ filas, columnas, valores, encabezado }) {
  const celdas = valores.flatMap((fila, y) => fila.map((valor, x) => [x, y, valor]));
  const maximo = Math.max(0, ...celdas.flatMap(([, , valor]) => (valor === null ? [] : [valor])));
  return {
    opcion: base({
      tooltip: {
        formatter: ({ value: [x, y, valor] }) =>
          `${escaparHtml(filas[y])} · ${escaparHtml(columnas[x])}: <strong>${formatearCantidad(valor)}</strong>`,
      },
      grid: { left: 8, right: 16, top: 8, bottom: 48, containLabel: true },
      xAxis: { type: 'category', data: columnas, ...EJE, splitArea: { show: false } },
      yAxis: {
        type: 'category',
        data: filas,
        inverse: true,
        ...EJE,
        axisLabel: { ...EJE.axisLabel, width: ANCHO_ETIQUETA, overflow: 'break' },
      },
      visualMap: {
        min: 0,
        max: maximo,
        orient: 'horizontal',
        left: 'center',
        bottom: 0,
        itemHeight: 120,
        itemWidth: 10,
        text: [formatearNumero(maximo), '0'],
        textStyle: { color: tema.textoSecundario, fontSize: 11 },
        inRange: { color: [tema.escala[0], tema.escala[2], tema.escala[4]] },
      },
      series: [
        {
          type: 'heatmap',
          data: celdas,
          label: { show: true, color: tema.oscuro, formatter: ({ value }) => formatearCantidad(value[2]) },
          itemStyle: { borderColor: tema.fondo, borderWidth: 2 },
        },
      ],
    }),
    tabla: {
      columnas: [
        { nombre: encabezado ?? 'Categoría' },
        ...columnas.map((nombre) => ({ nombre, numerica: true })),
      ],
      filas: filas.map((nombre, y) => [nombre, ...valores[y].map((valor) => formatearCantidad(valor))]),
    },
  };
}
