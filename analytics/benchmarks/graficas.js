import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const carpetaDeResultados = path.join(raiz, 'analytics', 'benchmarks', 'resultados');
const carpetaDeGraficas = path.join(raiz, 'docs', 'graficas');

const COLORES = Object.freeze({
  texto: '#2b2f36',
  secundario: '#5b6472',
  rejilla: '#d8dee6',
  fondo: '#ffffff',
  serie: '#1f5fa8',
  oscuro: '#0b2545',
  alterna: '#c2410c',
  cumple: '#1e7b4a',
  noCumple: '#b42318',
});
const FUENTE = "Inter, 'Segoe UI', system-ui, sans-serif";
const numero = (decimales) => new Intl.NumberFormat('es-CO', { maximumFractionDigits: decimales });

export function escapar(texto) {
  return String(texto).replace(/[&<>"']/g, (caracter) => `&#${caracter.charCodeAt(0)};`);
}

function texto(x, y, contenido, { tamano = 12, color = COLORES.texto, ancla = 'start', peso = 400 } = {}) {
  return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-size="${tamano}" fill="${color}" text-anchor="${ancla}" font-weight="${peso}">${escapar(contenido)}</text>`;
}

function documento(ancho, alto, titulo, cuerpo) {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${ancho} ${alto}" width="${ancho}" height="${alto}" role="img" aria-label="${escapar(titulo)}" font-family="${FUENTE}">`,
    `<title>${escapar(titulo)}</title>`,
    `<rect width="${ancho}" height="${alto}" fill="${COLORES.fondo}"/>`,
    texto(24, 34, titulo, { tamano: 17, peso: 600 }),
    ...cuerpo,
    '</svg>',
    '',
  ].join('\n');
}

export function cantidadCorta(valor) {
  if (valor >= 1_000_000) {
    return `${numero(1).format(valor / 1_000_000)} M`;
  }
  return valor >= 1000 ? `${numero(0).format(valor / 1000)} mil` : numero(0).format(valor);
}

export function ajusteLogaritmico(puntos) {
  const xs = puntos.map(({ n }) => Math.log(n));
  const ys = puntos.map(({ ms }) => Math.log(ms));
  const mediaX = xs.reduce((suma, valor) => suma + valor, 0) / xs.length;
  const mediaY = ys.reduce((suma, valor) => suma + valor, 0) / ys.length;
  const covarianza = xs.reduce(
    (suma, valor, posicion) => suma + (valor - mediaX) * (ys[posicion] - mediaY),
    0,
  );
  const varianza = xs.reduce((suma, valor) => suma + (valor - mediaX) ** 2, 0);
  const pendiente = covarianza / varianza;
  return { pendiente, intercepto: mediaY - pendiente * mediaX };
}

function panelDeAlgoritmo(experimento, origenX, origenY) {
  const ancho = 228;
  const alto = 168;
  const margen = { izquierda: 44, derecha: 10, arriba: 56, abajo: 26 };
  const puntos = experimento.puntos;
  const logN = puntos.map(({ n }) => Math.log(n));
  const logMs = puntos.map(({ ms }) => Math.log(ms));
  const [minimoX, maximoX] = [Math.min(...logN), Math.max(...logN)];
  const holgura = 0.15 * (Math.max(...logMs) - Math.min(...logMs) || 1);
  const [minimoY, maximoY] = [Math.min(...logMs) - holgura, Math.max(...logMs) + holgura];
  const escalaX = (valor) =>
    origenX +
    margen.izquierda +
    ((valor - minimoX) / (maximoX - minimoX)) * (ancho - margen.izquierda - margen.derecha);
  const escalaY = (valor) =>
    origenY +
    alto -
    margen.abajo -
    ((valor - minimoY) / (maximoY - minimoY)) * (alto - margen.arriba - margen.abajo);
  const { pendiente, intercepto } = ajusteLogaritmico(puntos);
  const color = experimento.coincide ? COLORES.cumple : COLORES.noCumple;
  const recorrido = puntos.map(
    ({ n, ms }) => `${escalaX(Math.log(n)).toFixed(1)},${escalaY(Math.log(ms)).toFixed(1)}`,
  );
  const recortar = (cadena, maximo) => (cadena.length > maximo ? `${cadena.slice(0, maximo - 1)}…` : cadena);
  const titulo = recortar(`${experimento.algoritmo}. ${experimento.nombre}`, 40);
  const variante = recortar(experimento.variante, 40);
  const [desde, hasta] = experimento.rangoEsperado.map((valor) => numero(2).format(valor));
  return [
    `<g>`,
    `<rect x="${origenX}" y="${origenY}" width="${ancho}" height="${alto}" rx="8" fill="none" stroke="${COLORES.rejilla}"/>`,
    texto(origenX + 10, origenY + 17, titulo, { tamano: 11, peso: 600 }),
    texto(origenX + 10, origenY + 31, variante, { tamano: 10, color: COLORES.secundario }),
    texto(
      origenX + 10,
      origenY + 45,
      `pendiente ${numero(2).format(pendiente)} · esperada ${desde} a ${hasta}`,
      {
        tamano: 10,
        color,
      },
    ),
    `<line x1="${escalaX(minimoX)}" y1="${escalaY(intercepto + pendiente * minimoX)}" x2="${escalaX(maximoX)}" y2="${escalaY(intercepto + pendiente * maximoX)}" stroke="${COLORES.secundario}" stroke-dasharray="4 3"/>`,
    `<polyline points="${recorrido.join(' ')}" fill="none" stroke="${COLORES.serie}" stroke-width="1.5"/>`,
    ...puntos.map(
      ({ n, ms }) =>
        `<circle cx="${escalaX(Math.log(n)).toFixed(1)}" cy="${escalaY(Math.log(ms)).toFixed(1)}" r="2.6" fill="${COLORES.serie}"/>`,
    ),
    texto(origenX + margen.izquierda, origenY + alto - 8, cantidadCorta(puntos[0].n), {
      tamano: 9,
      color: COLORES.secundario,
    }),
    texto(origenX + ancho - margen.derecha, origenY + alto - 8, cantidadCorta(puntos.at(-1).n), {
      tamano: 9,
      color: COLORES.secundario,
      ancla: 'end',
    }),
    texto(origenX + margen.izquierda - 4, escalaY(logMs[0]) + 3, `${numero(1).format(puntos[0].ms)} ms`, {
      tamano: 9,
      color: COLORES.secundario,
      ancla: 'end',
    }),
    texto(
      origenX + margen.izquierda - 4,
      escalaY(logMs.at(-1)) + 3,
      `${numero(0).format(puntos.at(-1).ms)} ms`,
      {
        tamano: 9,
        color: COLORES.secundario,
        ancla: 'end',
      },
    ),
    `</g>`,
  ];
}

export function graficaDeAlgoritmos({ experimentos }) {
  const columnas = 4;
  const filas = Math.ceil(experimentos.length / columnas);
  const ancho = 24 * 2 + columnas * 228 + (columnas - 1) * 12;
  const alto = 70 + filas * 180 + 30;
  const paneles = experimentos.flatMap((experimento, posicion) =>
    panelDeAlgoritmo(
      experimento,
      24 + (posicion % columnas) * 240,
      64 + Math.floor(posicion / columnas) * 180,
    ),
  );
  return documento(
    ancho,
    alto,
    'Experimento de duplicación: tiempo frente a tamaño de la entrada, en escala logarítmica',
    [
      texto(
        24,
        52,
        'Cada panel es un experimento. La línea punteada es el ajuste por mínimos cuadrados; su pendiente estima el exponente.',
        {
          tamano: 11,
          color: COLORES.secundario,
        },
      ),
      ...paneles,
      texto(
        24,
        alto - 12,
        'Verde: el exponente medido cae en el rango esperado. Fuente: analytics/benchmarks/resultados/algoritmos.json.',
        {
          tamano: 10,
          color: COLORES.secundario,
        },
      ),
    ],
  );
}

function barrasHorizontales({ titulo, subtitulo, filas, maximo, umbral, unidad, pie }) {
  const ancho = 960;
  const izquierda = 330;
  const derecha = 90;
  const alturaDeFila = 26;
  const arriba = 70;
  const alto = arriba + filas.length * alturaDeFila + 56;
  const escala = (valor) => izquierda + (valor / maximo) * (ancho - izquierda - derecha);
  const cuerpo = [texto(24, 52, subtitulo, { tamano: 11, color: COLORES.secundario })];
  filas.forEach(({ grupo, etiqueta, valor, textoDelValor, color = COLORES.serie }, posicion) => {
    const y = arriba + posicion * alturaDeFila;
    if (grupo) {
      cuerpo.push(texto(24, y + 17, grupo, { tamano: 12, peso: 600 }));
      return;
    }
    cuerpo.push(texto(izquierda - 10, y + 16, etiqueta, { tamano: 11, ancla: 'end' }));
    cuerpo.push(
      `<rect x="${izquierda}" y="${y + 5}" width="${Math.max(1, escala(valor) - izquierda).toFixed(1)}" height="15" rx="3" fill="${color}"/>`,
    );
    cuerpo.push(
      texto(escala(valor) + 6, y + 16, textoDelValor ?? `${numero(1).format(valor)} ${unidad}`, {
        tamano: 11,
        color: COLORES.secundario,
      }),
    );
  });
  if (umbral) {
    const x = escala(umbral.valor);
    cuerpo.push(
      `<line x1="${x}" y1="${arriba - 6}" x2="${x}" y2="${arriba + filas.length * alturaDeFila + 4}" stroke="${COLORES.noCumple}" stroke-dasharray="5 4"/>`,
      texto(x, arriba - 10, umbral.etiqueta, { tamano: 11, color: COLORES.noCumple, ancla: 'middle' }),
    );
  }
  cuerpo.push(texto(24, alto - 16, pie, { tamano: 10, color: COLORES.secundario }));
  return documento(ancho, alto, titulo, cuerpo);
}

export function graficaDeApi(resultado) {
  const filas = resultado.rutas.map(({ ruta, servidor }) => ({
    etiqueta: ruta.replace('/api/v1', '').replace('/eventos/sismo-2026-08-10', '/eventos/:evento'),
    valor: servidor.p95Ms,
    color: servidor.p95Ms <= resultado.criterio.p95MaximoMs ? COLORES.serie : COLORES.noCumple,
  }));
  return barrasHorizontales({
    titulo: 'Percentil 95 de cada ruta pública con un millón de registros',
    subtitulo: `${numero(0).format(resultado.registros.personas)} personas y ${numero(0).format(resultado.registros.viviendas)} viviendas · ${resultado.carga.solicitudesPorRuta} solicitudes por ruta con ${resultado.carga.concurrencia} clientes simultáneos`,
    filas,
    maximo: resultado.criterio.p95MaximoMs * 1.15,
    umbral: {
      valor: resultado.criterio.p95MaximoMs,
      etiqueta: `Límite de RNF-01: ${resultado.criterio.p95MaximoMs} ms`,
    },
    unidad: 'ms',
    pie: 'Medido en el servidor con el mismo cálculo del panel de ingeniería. Fuente: analytics/benchmarks/resultados/api.json.',
  });
}

export function graficaDeConsultas(resultado) {
  const filas = resultado.resultados.flatMap(({ nombre, variantes }) => [
    { grupo: nombre },
    ...variantes.map(({ etiqueta, ms }, posicion) => ({
      etiqueta,
      valor: Math.log10(ms * 1000) + 1,
      textoDelValor: `${numero(3).format(ms)} ms`,
      color: posicion === 0 ? COLORES.serie : COLORES.alterna,
    })),
  ]);
  return barrasHorizontales({
    titulo: 'Planes de consulta con un millón de personas: la opción elegida frente a la alternativa',
    subtitulo:
      'Mediana del tiempo de ejecución de EXPLAIN ANALYZE en cinco repeticiones. Escala logarítmica.',
    filas,
    maximo: Math.max(...filas.filter(({ grupo }) => !grupo).map(({ valor }) => valor)) * 1.1,
    unidad: '',
    pie: 'Azul: la opción que usa ANDES. Naranja: la alternativa. Fuente: analytics/benchmarks/resultados/consultas.json.',
  });
}

async function leer(nombre) {
  return JSON.parse(await readFile(path.join(carpetaDeResultados, nombre), 'utf8'));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await mkdir(carpetaDeGraficas, { recursive: true });
  const graficas = [
    ['algoritmos.svg', graficaDeAlgoritmos(await leer('algoritmos.json'))],
    ['api.svg', graficaDeApi(await leer('api.json'))],
    ['consultas.svg', graficaDeConsultas(await leer('consultas.json'))],
  ];
  for (const [nombre, contenido] of graficas) {
    await writeFile(path.join(carpetaDeGraficas, nombre), contenido, 'utf8');
    process.stdout.write(`docs/graficas/${nombre}\n`);
  }
}
