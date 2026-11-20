import { cargar } from './datos.js';
import { formatearFecha } from './formato.js';
import { nombreCorto } from './indicadores.js';

const DEPARTAMENTOS_EN_LISTA = 8;

export function cargarTerritorio() {
  return cargar('oficial/territorio');
}

export function valoresPorCodigo(territorios, variable) {
  return new Map(territorios.map(({ codigo, valores }) => [codigo, valores[variable]]));
}

export function compararPor(variable) {
  return (a, b) => (b.valores[variable] ?? -1) - (a.valores[variable] ?? -1);
}

export function ordenarPor(territorios, variable, cantidad = DEPARTAMENTOS_EN_LISTA) {
  return territorios
    .filter(({ valores }) => (valores[variable] ?? 0) > 0)
    .sort(compararPor(variable))
    .slice(0, cantidad);
}

export function describirPeriodo({ periodoReportes }) {
  return `Reportes municipales fechados entre el ${formatearFecha(periodoReportes.desde)} y el ${formatearFecha(periodoReportes.hasta)}`;
}

export function origenTerritorial(fuente, meta) {
  return {
    tipo: fuente.origen,
    nivel: fuente.nivel,
    texto: `Fuente: ${nombreCorto(fuente)}. ${describirPeriodo(meta)}.`,
    enlace: fuente.enlace,
  };
}

export function serieDe(territorios, variable) {
  return territorios.map(({ valores }) => valores[variable] ?? null);
}

export function nombresDe(territorios) {
  return territorios.map(({ nombre }) => nombre);
}
