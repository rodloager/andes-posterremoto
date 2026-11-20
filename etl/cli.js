import path from 'node:path';
import { parseArgs } from 'node:util';
import { leerEntorno } from '../backend/src/config/entorno.js';
import { recalcularAgregados } from './cargadores/agregados.js';
import { trabajar } from './cola.js';
import { formatoPorExtension } from './extractores/archivo.js';
import { conectarEtl } from './nucleo/conexion.js';
import { leerDefinicion, listarDefiniciones } from './nucleo/definiciones.js';
import { ejecutarCarga } from './proceso.js';

const USO = `Uso:
  npm run etl -- conjuntos
  npm run etl -- cargar --conjunto personas-simuladas --archivo data/raw/generador-andes/personas-10000-s20260810.csv
  npm run etl -- trabajar
  npm run etl -- reagregar [--destino personas|viviendas]
`;

const { values: opciones, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    conjunto: { type: 'string' },
    archivo: { type: 'string' },
    formato: { type: 'string' },
    destino: { type: 'string' },
  },
});

const escribir = (texto) => process.stdout.write(`${texto}\n`);

async function mostrarConjuntos() {
  for (const definicion of await listarDefiniciones()) {
    escribir(
      `${definicion.id}: ${definicion.nombre} (${definicion.origen}, ${definicion.formatos.join(', ')})`,
    );
  }
}

async function cargar(configuracion) {
  if (!opciones.conjunto || !opciones.archivo) {
    process.stderr.write(USO);
    process.exitCode = 1;
    return;
  }
  const ruta = path.resolve(opciones.archivo);
  const formato = opciones.formato ?? formatoPorExtension(ruta);
  const definicion = await leerDefinicion(opciones.conjunto);
  const cliente = await conectarEtl(configuracion);
  try {
    const resultado = await ejecutarCarga({
      cliente,
      definicion,
      ruta,
      formato,
      configuracion,
      alAvanzar: ({ filas }) => process.stdout.write(`\rFilas procesadas: ${filas}`),
    });
    const segundos = resultado.duracionMs / 1000;
    escribir('');
    escribir(
      `Ejecución ${resultado.ejecucion.id}${resultado.reanudada ? ', reanudada,' : ''} terminada en ${segundos.toFixed(1)} s.`,
    );
    escribir(resultado.ejecucion.mensaje);
    escribir(
      `Ritmo: ${Math.round(resultado.resumen.leidas / segundos)} filas por segundo. Memoria máxima: ${resultado.memoriaMaximaMb} MB.`,
    );
  } finally {
    await cliente.end();
  }
}

async function procesarCola(configuracion) {
  const cliente = await conectarEtl(configuracion);
  try {
    const { procesadas, fallidas } = await trabajar({
      cliente,
      configuracion,
      registrar: ({ mensaje }) => escribir(mensaje),
    });
    escribir(`Cargas procesadas: ${procesadas}. Fallidas: ${fallidas}.`);
  } finally {
    await cliente.end();
  }
}

const DESTINOS_AGREGABLES = ['personas', 'viviendas'];

async function reagregar(configuracion) {
  const destinos = opciones.destino ? [opciones.destino] : DESTINOS_AGREGABLES;
  if (destinos.some((destino) => !DESTINOS_AGREGABLES.includes(destino))) {
    process.stderr.write(USO);
    process.exitCode = 1;
    return;
  }
  const cliente = await conectarEtl(configuracion);
  try {
    for (const destino of destinos) {
      const inicio = performance.now();
      const resumen = await recalcularAgregados(cliente, { destino });
      const registros = resumen.reduce((total, grupo) => total + grupo.registros, 0);
      const celdas = resumen.reduce((total, grupo) => total + grupo.celdas, 0);
      escribir(
        `Agregados de ${destino} recalculados en ${((performance.now() - inicio) / 1000).toFixed(1)} s: ${registros} registros vigentes y ${celdas} celdas.`,
      );
    }
  } finally {
    await cliente.end();
  }
}

const [comando] = positionals;
try {
  if (comando === 'conjuntos') {
    await mostrarConjuntos();
  } else if (comando === 'cargar') {
    await cargar(leerEntorno());
  } else if (comando === 'trabajar') {
    await procesarCola(leerEntorno());
  } else if (comando === 'reagregar') {
    await reagregar(leerEntorno());
  } else {
    process.stderr.write(USO);
    process.exitCode = 1;
  }
} catch (error) {
  process.stderr.write(`\n${error.message}\n`);
  process.exitCode = 1;
}
