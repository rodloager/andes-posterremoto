import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { listarDefiniciones } from '../etl/nucleo/definiciones.js';
import {
  sembrarAfectacion,
  sembrarConjuntos,
  sembrarEconomia,
  sembrarEvento,
  sembrarFuentes,
  sembrarIndicadores,
  sembrarSeguros,
  sembrarVariablesTerritoriales,
} from './siembra/oficiales.js';
import { sembrarRolesYPermisos, sembrarUsuariosDemo } from './siembra/seguridad.js';
import { sembrarDivisionTerritorial } from './siembra/territorio.js';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const carpetaOficiales = path.join(raiz, 'database', 'seeds', 'oficial');
const carpetaGeo = path.join(raiz, 'frontend', 'public', 'datos', 'geo');
const archivoRoles = path.join(raiz, 'config', 'roles.yml');

const TABLAS_RAIZ_DE_DATOS = [
  'nucleo.departamentos',
  'nucleo.fuentes_datos',
  'nucleo.indicadores',
  'nucleo.variables_territoriales',
];

async function leerOficial(archivo) {
  const ruta = path.join(carpetaOficiales, archivo);
  const contenido = await readFile(ruta);
  return {
    datos: JSON.parse(contenido.toString('utf8')),
    origen: path.relative(raiz, ruta),
    huella: createHash('sha256').update(contenido).digest('hex'),
  };
}

async function leerSemillas() {
  const archivos = ['fuentes', 'evento', 'indicadores', 'territorio', 'seguros', 'economia'];
  const leidos = await Promise.all(archivos.map((nombre) => leerOficial(`${nombre}.json`)));
  return Object.fromEntries(archivos.map((nombre, indice) => [nombre, leidos[indice]]));
}

async function sembrarDatos(cliente, semillas) {
  await cliente.query(`TRUNCATE ${TABLAS_RAIZ_DE_DATOS.join(', ')} RESTART IDENTITY CASCADE`);
  const territorio = await sembrarDivisionTerritorial(cliente, carpetaGeo);
  const fuentes = await sembrarFuentes(cliente, semillas.fuentes.datos.fuentes);
  const variables = await sembrarVariablesTerritoriales(cliente);
  const conjuntos = await sembrarConjuntos(cliente, await listarDefiniciones());
  const eventoId = await sembrarEvento(cliente, semillas.evento.datos);
  const indicadores = await sembrarIndicadores(cliente, eventoId, semillas.indicadores.datos.indicadores);
  const afectacion = await sembrarAfectacion(cliente, eventoId, semillas.territorio.datos, {
    origenArchivo: semillas.territorio.origen,
    huella: semillas.territorio.huella,
  });
  const seguros = await sembrarSeguros(cliente, eventoId, semillas.seguros.datos);
  const economia = await sembrarEconomia(cliente, eventoId, semillas.economia.datos);
  return { ...territorio, fuentes, variables, conjuntos, indicadores, afectacion, seguros, economia };
}

export async function sembrar(cliente, { claveUsuariosDemo = null } = {}) {
  const [semillas, roles] = await Promise.all([leerSemillas(), readFile(archivoRoles, 'utf8').then(parse)]);
  await cliente.query('BEGIN');
  try {
    await sembrarRolesYPermisos(cliente, roles);
    const resumen = await sembrarDatos(cliente, semillas);
    const usuariosDemo = claveUsuariosDemo ? await sembrarUsuariosDemo(cliente, claveUsuariosDemo) : 0;
    await cliente.query('COMMIT');
    return { ...resumen, roles: roles.roles.length, usuariosDemo };
  } catch (error) {
    await cliente.query('ROLLBACK');
    throw error;
  }
}
