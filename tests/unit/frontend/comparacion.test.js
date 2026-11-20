import { describe, expect, it } from 'vitest';
import {
  clasificar,
  compararCortes,
  compararDepartamentos,
  departamentosIniciales,
  indicadoresConVariosCortes,
  participacion,
} from '../../../frontend/public/js/nucleo/comparacion.js';

const departamento = (codigo, nombre, valores) => ({ codigo, nombre, valores });
const TERRITORIO = {
  variables: [
    { codigo: 'personas', nombre: 'Personas afectadas', unidad: 'personas' },
    { codigo: 'vias', nombre: 'Vías', unidad: 'vías' },
  ],
  nacional: { personas: 1000, vias: 10 },
  departamentos: [
    departamento('05', 'Antioquia', { personas: 500, vias: 4 }),
    departamento('27', 'Chocó', { personas: 300, vias: 4 }),
    departamento('66', 'Risaralda', { personas: 200 }),
    departamento('19', 'Cauca', { personas: 0, vias: 2 }),
  ],
};

describe('ranking de departamentos', () => {
  it('ordena de mayor a menor, comparte el puesto en un empate y omite ceros y vacíos', () => {
    const { ordenados, puestos } = clasificar(TERRITORIO.departamentos, 'vias');
    expect(ordenados.map(({ codigo }) => codigo)).toEqual(['05', '27', '19']);
    expect([...puestos]).toEqual([
      ['05', 1],
      ['27', 1],
      ['19', 3],
    ]);
  });

  it('calcula la participación solo cuando hay total', () => {
    expect(participacion(250, 1000)).toBe(25);
    expect(participacion(null, 1000)).toBeNull();
    expect(participacion(5, 0)).toBeNull();
  });
});

describe('dos departamentos lado a lado', () => {
  it('trae valor, participación y puesto de cada variable', () => {
    const [personas, vias] = compararDepartamentos(TERRITORIO, ['27', '66']);
    expect(personas).toMatchObject({
      nacional: 1000,
      conDato: 3,
      departamentos: [
        { valor: 300, participacion: 30, puesto: 2 },
        { valor: 200, participacion: 20, puesto: 3 },
      ],
    });
    expect(vias.departamentos[1]).toEqual({ valor: null, participacion: null, puesto: null });
  });

  it('respeta los departamentos pedidos y completa con los de más personas', () => {
    expect(departamentosIniciales(TERRITORIO, ['66', '19'])).toEqual(['66', '19']);
    expect(departamentosIniciales(TERRITORIO, ['99', '66', '66'])).toEqual(['66', '05']);
    expect(departamentosIniciales(TERRITORIO, [])).toEqual(['05', '27']);
  });
});

describe('comparación entre cortes', () => {
  const punto = (fechaCorte, valor, fuente = 'f') => ({ fechaCorte, valor, fuente });

  it('compara el primer corte con el último y cuenta los días', () => {
    expect(compararCortes([punto('2026-10-10', 335), punto('2026-08-15', 289)])).toMatchObject({
      primero: { valor: 289 },
      ultimo: { valor: 335 },
      cortes: 2,
      absoluta: 46,
      dias: 56,
    });
  });

  it('necesita dos fechas distintas y toma el mayor valor de una misma fecha', () => {
    expect(compararCortes([punto('2026-08-15', 1), punto('2026-08-15', 2)])).toBeNull();
    expect(
      compararCortes([punto('2026-08-15', 1), punto('2026-08-15', 2), punto('2026-08-20', 4)]),
    ).toMatchObject({
      absoluta: 2,
      relativa: 100,
    });
  });

  it('elige los indicadores que tienen al menos dos cortes', () => {
    const lista = indicadoresConVariosCortes([
      { codigo: 'uno', serie: [punto('2026-08-15', 1)] },
      { codigo: 'dos', serie: [punto('2026-08-15', 0), punto('2026-10-10', 5)] },
    ]);
    expect(lista.map(({ indicador }) => indicador.codigo)).toEqual(['dos']);
    expect(lista[0].relativa).toBeNull();
  });
});
