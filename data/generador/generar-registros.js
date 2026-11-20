import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { cargarMunicipiosAfectados } from './registros/contexto.js';
import { SIN_DEFECTOS, TASAS_POR_DEFECTO } from './registros/defectos.js';
import { FORMATOS } from './registros/formatos.js';
import { CONJUNTOS_GENERABLES, SEMILLA_DE_REGISTROS, generarArchivo } from './registros/generar.js';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const carpetaPorDefecto = path.join(raiz, 'data', 'raw', 'generador-andes');

const { values: opciones } = parseArgs({
  options: {
    tipo: { type: 'string', default: 'personas' },
    cantidad: { type: 'string', default: '10000' },
    formato: { type: 'string', default: 'csv' },
    semilla: { type: 'string', default: String(SEMILLA_DE_REGISTROS) },
    salida: { type: 'string', default: carpetaPorDefecto },
    'sin-defectos': { type: 'boolean', default: false },
  },
});

const cantidad = Number(opciones.cantidad.replaceAll('_', ''));
const semilla = Number(opciones.semilla);
const tipos = opciones.tipo === 'ambos' ? Object.keys(CONJUNTOS_GENERABLES) : [opciones.tipo];

if (
  !tipos.every((tipo) => CONJUNTOS_GENERABLES[tipo]) ||
  !Object.values(FORMATOS).includes(opciones.formato)
) {
  process.stderr.write(
    'Uso: npm run datos:registros -- --tipo personas|viviendas|ambos --cantidad 100000 --formato csv|jsonl|json [--semilla N] [--sin-defectos]\n',
  );
  process.exit(1);
}
if (!Number.isInteger(cantidad) || cantidad < 1 || !Number.isInteger(semilla)) {
  process.stderr.write('La cantidad y la semilla deben ser enteros positivos.\n');
  process.exit(1);
}

const municipios = await cargarMunicipiosAfectados();
for (const tipo of tipos) {
  const inicio = performance.now();
  const ruta = path.join(opciones.salida, `${tipo}-${cantidad}-s${semilla}.${opciones.formato}`);
  const manifiesto = await generarArchivo({
    tipo,
    cantidad,
    formato: opciones.formato,
    ruta,
    municipios,
    semilla,
    tasas: opciones['sin-defectos'] ? SIN_DEFECTOS : TASAS_POR_DEFECTO,
  });
  const segundos = ((performance.now() - inicio) / 1000).toFixed(1);
  process.stdout.write(
    `${path.relative(raiz, ruta)}: ${manifiesto.filas} filas en ${segundos} s. ` +
      `Rechazables: ${manifiesto.rechazadas.total}. Duplicados exactos: ${manifiesto.duplicadosExactos}. ` +
      `Duplicados probables: ${manifiesto.duplicadosProbables}.\n`,
  );
}
