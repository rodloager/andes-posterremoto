import { mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { crearAgregador } from '../../backend/src/algorithms/agregacion.js';
import {
  CONDICIONES_ASEGURAMIENTO,
  ESTADOS_FISICOS,
  TIPOS_FINANCIACION,
  analizarAseguramiento,
  crearCubo,
} from '../../backend/src/algorithms/aseguramiento.js';
import {
  crearAutocompletado,
  crearAutocompletadoOrdenado,
  crearIndiceInvertido,
} from '../../backend/src/algorithms/busqueda.js';
import { VULNERABILIDADES, clasificarRegistros } from '../../backend/src/algorithms/clasificacion.js';
import { crearComparador, detectarDuplicados } from '../../backend/src/algorithms/duplicados.js';
import { Trie } from '../../backend/src/algorithms/estructuras/trie.js';
import { priorizar, puntuarZonas } from '../../backend/src/algorithms/priorizacion.js';
import { analizarTendencia } from '../../backend/src/algorithms/tendencias.js';
import { normalizarTexto } from '../../backend/src/algorithms/texto.js';
import {
  CONDICIONES_INSTITUCIONALES,
  TENENCIAS,
  crearDimensionesDePersonas,
} from '../../backend/src/models/dimensiones.js';
import { crearGenerador } from '../../data/generador/aleatorio.js';
import { introducirErrorDeDigitacion } from '../../data/generador/registros/defectos.js';
import { APELLIDOS, NOMBRES_DE_HOMBRE, NOMBRES_DE_MUJER } from '../../data/generador/registros/nombres.js';
import { RANGOS, analizarDuplicacion, coincide, medirTiempo, tamanosDuplicados } from './duplicacion.js';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SEMILLA = 20260810;
const MS_POR_DIA = 86_400_000;
const INICIO = Date.parse('2026-08-10T00:00:00Z');
const DIAS_DE_REGISTRO = 90;
const K_PRIORIZACION = 20;
const SUGERENCIAS = 10;
const CONSULTAS_DE_AUTOCOMPLETADO = 5000;
const CONSULTAS_DE_FILTRO = 50;
const TASA_DE_DUPLICADOS = 0.005;
const UMBRAL_DUPLICADO = 0.92;
const UMBRAL_REVISION = 0.8;
const REPETICIONES_CUADRATICAS = 3;
const REPETICIONES_DE_CONSULTAS = 9;
const CALENTAMIENTO_DE_CONSULTAS = 3;
const ESCALA_RAPIDA = 1 / 8;

const { values: opciones } = parseArgs({
  options: {
    repeticiones: { type: 'string', default: '5' },
    rapido: { type: 'boolean', default: false },
  },
});
const repeticiones = Number(opciones.repeticiones);
if (!Number.isInteger(repeticiones) || repeticiones < 1) {
  process.stderr.write('Uso: npm run medir:algoritmos -- [--repeticiones 5] [--rapido]\n');
  process.exit(1);
}
const escala = opciones.rapido ? ESCALA_RAPIDA : 1;
const tamanos = (inicial, cantidad) => tamanosDuplicados(Math.max(2, Math.round(inicial * escala)), cantidad);

const numero = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 });
const escribir = (texto = '') => process.stdout.write(`${texto}\n`);

const generador = crearGenerador(SEMILLA);
const elegir = (lista) => lista[generador.entero(0, lista.length - 1)];
const fecha = (dias) => new Date(INICIO + dias * MS_POR_DIA).toISOString().slice(0, 10);
const FECHAS = Array.from({ length: DIAS_DE_REGISTRO }, (valor, dia) => fecha(dia));

const territorio = JSON.parse(
  await readFile(path.join(raiz, 'database', 'seeds', 'oficial', 'territorio.json'), 'utf8'),
);
const MUNICIPIOS = territorio.municipios.map(({ codigo }) => codigo);
const DEPARTAMENTOS = [...new Set(MUNICIPIOS.map((codigo) => codigo.slice(0, 2)))];
const CONDICIONES = CONDICIONES_INSTITUCIONALES.map(({ codigo }) => codigo);
const CODIGOS_DE_TENENCIA = TENENCIAS.map(({ codigo }) => codigo);
const DECLARABLES = VULNERABILIDADES.filter(({ derivada }) => !derivada).map(({ codigo }) => codigo);
const PREFIJOS_DE_LUGAR = ['SAN', 'SANTA', 'EL', 'LA', 'PUERTO', 'VILLA', 'NUEVA', 'ALTO', 'BAJO', 'LOS'];

function crearPersona() {
  const sexo = generador.ocurre(0.51) ? 'F' : 'M';
  const nombres = sexo === 'F' ? NOMBRES_DE_MUJER : NOMBRES_DE_HOMBRE;
  return {
    municipio: elegir(MUNICIPIOS),
    edad: generador.entero(0, 100),
    sexo,
    nombre: normalizarTexto(`${elegir(nombres)} ${elegir(APELLIDOS)} ${elegir(APELLIDOS)}`),
    condicion: elegir(CONDICIONES),
    tenencia: generador.ocurre(0.1) ? null : elegir(CODIGOS_DE_TENENCIA),
    situacion: generador.ocurre(0.4) ? 'DAMNIFICADA' : 'AFECTADA',
    condicionSalud: generador.ocurre(0.9) ? 'ILESA' : 'HERIDA',
    vulnerabilidades: generador.ocurre(0.2) ? [elegir(DECLARABLES)] : [],
    capturadoEn: elegir(FECHAS),
  };
}

const todasLasPersonas = [];
const paresInyectados = [];

function personas(cantidad) {
  while (todasLasPersonas.length < cantidad) {
    const persona = crearPersona();
    todasLasPersonas.push(persona);
    if (generador.ocurre(TASA_DE_DUPLICADOS)) {
      paresInyectados.push([todasLasPersonas.length - 1, todasLasPersonas.length]);
      todasLasPersonas.push({ ...persona, nombre: introducirErrorDeDigitacion(persona.nombre, generador) });
    }
  }
  return todasLasPersonas.slice(0, cantidad);
}

const crearZona = (posicion) => ({
  codigo: String(posicion).padStart(7, '0'),
  nombre: `Zona ${posicion}`,
  valores: {
    afectadas: generador.entero(0, 50_000),
    vulnerables: generador.entero(0, 20_000),
    destruidas: generador.ocurre(0.3) ? null : generador.entero(0, 5000),
    suministros: generador.entero(0, 1000),
  },
});

const CRITERIOS = Object.freeze([
  { codigo: 'afectadas', peso: 0.35 },
  { codigo: 'vulnerables', peso: 0.25 },
  { codigo: 'destruidas', peso: 0.25 },
  { codigo: 'suministros', peso: 0.15, masEsMejor: true },
]);

const crearLugar = (posicion) => ({
  codigo: String(posicion),
  nombre: normalizarTexto(`${elegir(PREFIJOS_DE_LUGAR)} ${elegir(APELLIDOS)} ${elegir(NOMBRES_DE_MUJER)}`),
});

const crearFila = () => ({
  departamento: elegir(DEPARTAMENTOS),
  categoria: `C${generador.entero(0, 9)}`,
  periodo: elegir(FECHAS),
});

const crearVivienda = () => ({
  estado: elegir(ESTADOS_FISICOS),
  aseguramiento: elegir(CONDICIONES_ASEGURAMIENTO),
  financiacion: elegir(TIPOS_FINANCIACION),
});

function crearSerie(cantidad) {
  let valor = 0;
  return Array.from({ length: cantidad }, (elemento, dia) => {
    valor += generador.entero(0, 100);
    return { fecha: fecha(dia), valor };
  });
}

function maestro(crear) {
  const elementos = [];
  return (cantidad) => {
    while (elementos.length < cantidad) {
      elementos.push(crear(elementos.length));
    }
    return elementos.slice(0, cantidad);
  };
}

const zonas = maestro(crearZona);
const lugares = maestro(crearLugar);
const filas = maestro(crearFila);
const viviendas = maestro(crearVivienda);

const comparar = crearComparador({
  campos: [
    { nombre: 'nombre', peso: 0.8, tipo: 'texto' },
    { nombre: 'sexo', peso: 0.2, tipo: 'exacto' },
  ],
  minimo: UMBRAL_REVISION,
});
const claveDeBloque = ({ municipio, edad, nombre }) => `${municipio}|${edad}|${nombre[0]}`;
const detectar = (registros, comparador = comparar) =>
  detectarDuplicados(registros, {
    claveDeBloque,
    comparar: comparador,
    umbralDuplicado: UMBRAL_DUPLICADO,
    umbralRevision: UMBRAL_REVISION,
  });

function compararTodos(registros) {
  let comparaciones = 0;
  let sobreElUmbral = 0;
  for (let uno = 0; uno < registros.length; uno += 1) {
    for (let otro = uno + 1; otro < registros.length; otro += 1) {
      comparaciones += 1;
      if (comparar(registros[uno], registros[otro]).valor >= UMBRAL_REVISION) {
        sobreElUmbral += 1;
      }
    }
  }
  return { comparaciones, sobreElUmbral };
}

function prefijosDe(catalogo) {
  return Array.from({ length: CONSULTAS_DE_AUTOCOMPLETADO }, () => {
    const { nombre } = elegir(catalogo);
    return nombre.slice(0, generador.entero(1, Math.min(8, nombre.length)));
  });
}

const CONSULTAS = Array.from({ length: CONSULTAS_DE_FILTRO }, () => ({
  departamento: elegir(DEPARTAMENTOS),
  categoria: `C${generador.entero(0, 9)}`,
  desde: FECHAS[20],
  hasta: FECHAS[50],
}));

const EXPERIMENTOS = [
  {
    algoritmo: 1,
    nombre: 'Clasificación de registros poblacionales',
    variante: 'Tabla de acceso directo por edad y máscara de bits',
    complejidad: 'O(n)',
    rango: RANGOS.lineal,
    tamanos: tamanos(31_250, 6),
    entrada: personas,
    ejecutar: (registros) =>
      clasificarRegistros(registros, { condiciones: CONDICIONES_INSTITUCIONALES, tenencias: TENENCIAS })
        .clasificados,
  },
  {
    algoritmo: 2,
    nombre: 'Agrupación y agregación de estadísticas',
    variante: 'Una pasada con tabla hash, 11 dimensiones y tres niveles territoriales',
    complejidad: 'O(n · d)',
    rango: RANGOS.lineal,
    tamanos: tamanos(31_250, 6),
    entrada: personas,
    ejecutar: (registros) => {
      const { dimensiones, valor } = crearDimensionesDePersonas();
      const agregador = crearAgregador({ dimensiones, valor });
      for (const registro of registros) {
        agregador.agregar(registro);
      }
      return agregador.resultado();
    },
  },
  {
    algoritmo: 3,
    nombre: 'Detección de duplicados',
    variante: 'Bloqueo por municipio, edad e inicial, y comparación dentro de cada bloque',
    complejidad: 'O(n + Σ b²) ≈ O(n + n²/K)',
    rango: RANGOS.subcuadratico,
    tamanos: tamanos(31_250, 6),
    entrada: personas,
    ejecutar: (registros) => detectar(registros).revision,
    metricas: (registros) => {
      const { comparaciones, bloques } = detectar(registros);
      return { comparaciones, bloques };
    },
  },
  {
    algoritmo: 3,
    nombre: 'Detección de duplicados',
    variante: 'Referencia: comparar todos los pares',
    complejidad: 'O(n²)',
    rango: RANGOS.cuadratico,
    tamanos: tamanos(125, 5),
    repeticiones: REPETICIONES_CUADRATICAS,
    entrada: personas,
    ejecutar: (registros) => compararTodos(registros).sobreElUmbral,
  },
  {
    algoritmo: 4,
    nombre: 'Priorización de atención',
    variante: `Suma ponderada y montículo mínimo de tamaño k = ${K_PRIORIZACION}`,
    complejidad: 'O(m · c + m log k)',
    rango: RANGOS.lineal,
    tamanos: tamanos(31_250, 6),
    entrada: zonas,
    ejecutar: (entrada) => priorizar(entrada, { criterios: CRITERIOS, k: K_PRIORIZACION }),
  },
  {
    algoritmo: 4,
    nombre: 'Priorización de atención',
    variante: 'Referencia: ordenar todas las zonas',
    complejidad: 'O(m · c + m log m)',
    rango: RANGOS.linearitmico,
    tamanos: tamanos(31_250, 6),
    entrada: zonas,
    ejecutar: (entrada) =>
      puntuarZonas(entrada, CRITERIOS)
        .sort((una, otra) => otra.puntaje - una.puntaje || una.codigo.localeCompare(otra.codigo))
        .slice(0, K_PRIORIZACION),
  },
  {
    algoritmo: 5,
    nombre: 'Búsqueda y filtrado',
    variante: `Trie de nombres completos: ${CONSULTAS_DE_AUTOCOMPLETADO} consultas según el tamaño N del catálogo`,
    complejidad: 'O(L + r) por consulta',
    rango: RANGOS.constante,
    tamanos: tamanos(4096, 6),
    repeticiones: REPETICIONES_DE_CONSULTAS,
    calentamiento: CALENTAMIENTO_DE_CONSULTAS,
    entrada: (cantidad) => {
      const catalogo = lugares(cantidad);
      const trie = new Trie();
      for (const lugar of catalogo) {
        trie.insertar(lugar.nombre, lugar);
      }
      return { trie, prefijos: prefijosDe(catalogo) };
    },
    ejecutar: ({ trie, prefijos }) =>
      prefijos.reduce(
        (total, prefijo) => total + trie.buscarPrefijo(normalizarTexto(prefijo), SUGERENCIAS).length,
        0,
      ),
  },
  {
    algoritmo: 5,
    nombre: 'Búsqueda y filtrado',
    variante: `Referencia: arreglo ordenado con búsqueda binaria, ${CONSULTAS_DE_AUTOCOMPLETADO} consultas`,
    complejidad: 'O(L · log N + r) por consulta',
    rango: RANGOS.logaritmico,
    tamanos: tamanos(4096, 6),
    repeticiones: REPETICIONES_DE_CONSULTAS,
    calentamiento: CALENTAMIENTO_DE_CONSULTAS,
    entrada: (cantidad) => {
      const catalogo = lugares(cantidad);
      return { indice: crearAutocompletadoOrdenado(catalogo), prefijos: prefijosDe(catalogo) };
    },
    ejecutar: ({ indice, prefijos }) =>
      prefijos.reduce((total, prefijo) => total + indice.sugerir(prefijo, SUGERENCIAS).length, 0),
  },
  {
    algoritmo: 5,
    nombre: 'Búsqueda y filtrado',
    variante: `Autocompletado de la API: trie de nombres y de palabras interiores, ${CONSULTAS_DE_AUTOCOMPLETADO} consultas`,
    complejidad: 'O(L + r) por consulta',
    rango: RANGOS.constante,
    tamanos: tamanos(4096, 6),
    repeticiones: REPETICIONES_DE_CONSULTAS,
    calentamiento: CALENTAMIENTO_DE_CONSULTAS,
    entrada: (cantidad) => {
      const catalogo = lugares(cantidad);
      return { indice: crearAutocompletado(catalogo), prefijos: prefijosDe(catalogo) };
    },
    ejecutar: ({ indice, prefijos }) =>
      prefijos.reduce((total, prefijo) => total + indice.sugerir(prefijo, SUGERENCIAS).length, 0),
  },
  {
    algoritmo: 5,
    nombre: 'Búsqueda y filtrado',
    variante: `Índice invertido con intersección y periodo por búsqueda binaria, ${CONSULTAS_DE_FILTRO} consultas`,
    complejidad: 'O(k · |lista más corta|) por consulta',
    rango: RANGOS.lineal,
    tamanos: tamanos(31_250, 6),
    entrada: (cantidad) =>
      crearIndiceInvertido(filas(cantidad), { atributos: ['departamento', 'categoria'], periodo: 'periodo' }),
    ejecutar: (indice) =>
      CONSULTAS.reduce(
        (total, { departamento, categoria, desde, hasta }) =>
          total + indice.filtrar({ departamento, categoria }, { desde, hasta }).length,
        0,
      ),
  },
  {
    algoritmo: 5,
    nombre: 'Búsqueda y filtrado',
    variante: `Referencia: recorrido lineal de todas las filas, ${CONSULTAS_DE_FILTRO} consultas`,
    complejidad: 'O(n) por consulta',
    rango: RANGOS.lineal,
    tamanos: tamanos(31_250, 6),
    entrada: filas,
    ejecutar: (entrada) =>
      CONSULTAS.reduce(
        (total, { departamento, categoria, desde, hasta }) =>
          total +
          entrada.filter(
            (fila) =>
              fila.departamento === departamento &&
              fila.categoria === categoria &&
              fila.periodo >= desde &&
              fila.periodo <= hasta,
          ).length,
        0,
      ),
  },
  {
    algoritmo: 6,
    nombre: 'Análisis de tendencias',
    variante: 'Deltas, medias móviles con cola circular, mínimos cuadrados y anomalías',
    complejidad: 'O(n)',
    rango: RANGOS.lineal,
    tamanos: tamanos(16_384, 6),
    entrada: crearSerie,
    ejecutar: (serie) => analizarTendencia(serie, { esAcumulado: true }).cortes,
  },
  {
    algoritmo: 7,
    nombre: 'Análisis del aseguramiento de viviendas',
    variante: 'Cubo en un arreglo plano de 72 celdas y análisis sobre el cubo',
    complejidad: 'O(n + e · a · f)',
    rango: RANGOS.lineal,
    tamanos: tamanos(62_500, 6),
    entrada: viviendas,
    ejecutar: (entrada) => {
      const cubo = crearCubo();
      for (const vivienda of entrada) {
        cubo.agregar(vivienda);
      }
      return analizarAseguramiento(cubo).tabla;
    },
  },
];

function medirExperimento(experimento) {
  escribir(`Algoritmo ${experimento.algoritmo} · ${experimento.variante} · ${experimento.complejidad}`);
  const puntos = [];
  for (const n of experimento.tamanos) {
    const datos = experimento.entrada(n);
    const tiempo = medirTiempo(() => experimento.ejecutar(datos), {
      repeticiones: experimento.repeticiones ?? repeticiones,
      calentamiento: experimento.calentamiento ?? 1,
    });
    puntos.push({
      n,
      ms: tiempo.mediana,
      minimo: tiempo.minimo,
      maximo: tiempo.maximo,
      ...experimento.metricas?.(datos),
    });
    const anterior = puntos.at(-2);
    const razon = anterior ? numero.format(tiempo.mediana / anterior.ms) : '—';
    escribir(
      `  n = ${numero.format(n).padStart(11)}   mediana ${numero.format(tiempo.mediana).padStart(10)} ms   razón ${razon}`,
    );
  }
  const { razones, exponente } = analizarDuplicacion(puntos);
  const resultado = {
    algoritmo: experimento.algoritmo,
    nombre: experimento.nombre,
    variante: experimento.variante,
    complejidad: experimento.complejidad,
    rangoEsperado: experimento.rango,
    repeticiones: experimento.repeticiones ?? repeticiones,
    calentamiento: experimento.calentamiento ?? 1,
    puntos,
    razones,
    exponente,
    coincide: coincide(exponente, experimento.rango),
  };
  escribir(
    `  exponente estimado ${numero.format(exponente)} (esperado entre ${experimento.rango.join(' y ')}): ${resultado.coincide ? 'coincide' : 'NO coincide'}\n`,
  );
  return resultado;
}

const claveDePar = (uno, otro) => `${Math.min(uno, otro)}|${Math.max(uno, otro)}`;

function resumirDeteccion(marcados, comparaciones, verdaderos) {
  const aciertos = [...marcados].filter((par) => verdaderos.has(par)).length;
  return {
    comparaciones,
    marcados: marcados.size,
    aciertos,
    exhaustividad: verdaderos.size === 0 ? null : aciertos / verdaderos.size,
    precision: marcados.size === 0 ? null : aciertos / marcados.size,
  };
}

function evaluarDeteccion(tamano, { exhaustiva }) {
  const registros = personas(tamano);
  const verdaderos = new Set(
    paresInyectados
      .filter(([, copia]) => copia < tamano)
      .map(([original, copia]) => claveDePar(original, copia)),
  );
  const posiciones = new Map(registros.map((registro, posicion) => [registro, posicion]));
  const marcadosConBloques = new Set();
  const deteccion = detectar(registros, (uno, otro) => {
    const resultado = comparar(uno, otro);
    if (resultado.valor >= UMBRAL_REVISION) {
      marcadosConBloques.add(claveDePar(posiciones.get(uno), posiciones.get(otro)));
    }
    return resultado;
  });
  const evaluacion = {
    tamano,
    duplicadosInyectados: verdaderos.size,
    conBloques: resumirDeteccion(marcadosConBloques, deteccion.comparaciones, verdaderos),
  };
  if (exhaustiva) {
    const marcadosExhaustivos = new Set();
    for (let uno = 0; uno < registros.length; uno += 1) {
      for (let otro = uno + 1; otro < registros.length; otro += 1) {
        if (comparar(registros[uno], registros[otro]).valor >= UMBRAL_REVISION) {
          marcadosExhaustivos.add(claveDePar(uno, otro));
        }
      }
    }
    evaluacion.todosLosPares = resumirDeteccion(marcadosExhaustivos, (tamano * (tamano - 1)) / 2, verdaderos);
  }
  return evaluacion;
}

function describirDeteccion(nombre, { comparaciones, marcados, aciertos, exhaustividad, precision }) {
  const porcentaje = (valor) => (valor === null ? 'sin dato' : `${numero.format(valor * 100)} %`);
  return `  ${nombre}: ${numero.format(comparaciones)} comparaciones, ${numero.format(marcados)} pares marcados, ${aciertos} duplicados reales encontrados (exhaustividad ${porcentaje(exhaustividad)}, precisión ${porcentaje(precision)})`;
}

const inicio = performance.now();
escribir(
  `Experimento de duplicación: ${repeticiones} repeticiones por tamaño, mediana, una vuelta de calentamiento${globalThis.gc ? ' y recolección de basura antes de cada medición' : ''}.\n`,
);
const experimentos = EXPERIMENTOS.map(medirExperimento);
const duplicados = [
  evaluarDeteccion(Math.max(...tamanos(125, 5)), { exhaustiva: true }),
  evaluarDeteccion(Math.max(...tamanos(31_250, 6)), { exhaustiva: false }),
];
for (const evaluacion of duplicados) {
  escribir(
    `Calidad de la detección con ${numero.format(evaluacion.tamano)} registros y ${evaluacion.duplicadosInyectados} duplicados inyectados:`,
  );
  escribir(describirDeteccion('con bloques', evaluacion.conBloques));
  if (evaluacion.todosLosPares) {
    escribir(describirDeteccion('todos los pares', evaluacion.todosLosPares));
  }
}

const [procesador] = os.cpus();
const resultado = {
  generadoEn: new Date().toISOString(),
  duracionS: Number(((performance.now() - inicio) / 1000).toFixed(1)),
  equipo: {
    procesador: procesador?.model ?? null,
    nucleos: os.cpus().length,
    memoriaGb: Math.round(os.totalmem() / 2 ** 30),
    sistema: `${os.type()} ${os.release()}`,
    node: process.version,
  },
  metodo: {
    semilla: SEMILLA,
    repeticiones,
    calentamiento: 1,
    estadistico: 'mediana',
    recoleccionExplicita: typeof globalThis.gc === 'function',
    escala: opciones.rapido ? 'rápida' : 'completa',
  },
  experimentos,
  duplicados,
};

const carpeta = path.join(raiz, 'analytics', 'benchmarks', 'resultados');
const archivo = path.join(carpeta, opciones.rapido ? 'algoritmos-rapido.json' : 'algoritmos.json');
await mkdir(carpeta, { recursive: true });
await writeFile(archivo, `${JSON.stringify(resultado, null, 2)}\n`, 'utf8');
const fuera = experimentos.filter(({ coincide: dentro }) => !dentro).length;
escribir(
  `\n${experimentos.length - fuera} de ${experimentos.length} experimentos coinciden con la complejidad esperada. Resultado en ${path.relative(raiz, archivo)} (${resultado.duracionS} s).`,
);
