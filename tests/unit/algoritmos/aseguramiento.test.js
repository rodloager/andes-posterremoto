import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  CONDICIONES_ASEGURAMIENTO,
  ESTADOS_FISICOS,
  TIPOS_FINANCIACION,
  analizarAseguramiento,
  crearCubo,
  embudoDeReclamaciones,
} from '../../../backend/src/algorithms/aseguramiento.js';

function repetir(cantidad, estado, aseguramiento, financiacion) {
  return Array.from({ length: cantidad }, () => ({ estado, aseguramiento, financiacion }));
}

const VIVIENDAS = [
  ...repetir(3, 'DESTRUCCION_TOTAL', 'ASEGURADA', 'HIPOTECA'),
  ...repetir(1, 'DESTRUCCION_TOTAL', 'NO_ASEGURADA', 'SIN_FINANCIACION'),
  ...repetir(2, 'AFECTACION_LEVE', 'NO_ASEGURADA', 'HIPOTECA'),
  ...repetir(1, 'AFECTACION_LEVE', 'PENDIENTE_VERIFICACION', 'LEASING'),
  ...repetir(1, 'SIN_AFECTACION', 'NO_ASEGURADA', 'LEASING'),
  ...repetir(2, 'AFECTACION_GRAVE', 'ASEGURADA', 'SIN_FINANCIACION'),
];

function cuboCon(viviendas) {
  const cubo = crearCubo();
  viviendas.forEach((vivienda) => cubo.agregar(vivienda));
  return cubo;
}

describe('cubo de aseguramiento', () => {
  const analisis = analizarAseguramiento(cuboCon(VIVIENDAS));

  it('tiene una celda por combinación de estado, aseguramiento y financiación', () => {
    expect(crearCubo().celdas).toBe(6 * 3 * 4);
  });

  it('informa la cobertura como intervalo', () => {
    expect(analisis.total).toBe(10);
    expect(analisis.porAseguramiento).toEqual({ ASEGURADA: 5, NO_ASEGURADA: 4, PENDIENTE_VERIFICACION: 1 });
    expect(analisis.cobertura).toEqual({ minima: 0.5, maxima: 0.6 });
  });

  it('calcula la proporción de viviendas destruidas con póliza', () => {
    expect(analisis.destruidasConPoliza).toBe(0.75);
  });

  it('cuenta como inconsistencia la vivienda hipotecada o en leasing sin seguro', () => {
    expect(analisis.inconsistencias).toEqual({ HIPOTECA: 2, LEASING: 1, total: 3 });
  });

  it('calcula tasas condicionales por financiación', () => {
    expect(analisis.porFinanciacion).toEqual({
      HIPOTECA: 5,
      LEASING: 2,
      SIN_FINANCIACION: 3,
      PENDIENTE_VERIFICACION: 0,
    });
    expect(analisis.tasasPorFinanciacion.HIPOTECA).toEqual({
      total: 5,
      ASEGURADA: 0.6,
      NO_ASEGURADA: 0.4,
      PENDIENTE_VERIFICACION: 0,
    });
    expect(analisis.tasasPorFinanciacion.PENDIENTE_VERIFICACION).toMatchObject({ total: 0, ASEGURADA: null });
  });

  it('entrega la tabla de contingencia completa', () => {
    expect(analisis.tabla).toHaveLength(24);
    expect(
      analisis.tabla.find(
        ({ estado, financiacion }) => estado === 'DESTRUCCION_TOTAL' && financiacion === 'HIPOTECA',
      ),
    ).toEqual({
      estado: 'DESTRUCCION_TOTAL',
      financiacion: 'HIPOTECA',
      ASEGURADA: 3,
      NO_ASEGURADA: 0,
      PENDIENTE_VERIFICACION: 0,
    });
  });

  it('descarta y cuenta las viviendas con códigos desconocidos', () => {
    const cubo = cuboCon([
      { estado: 'INCENDIADA', aseguramiento: 'ASEGURADA', financiacion: 'HIPOTECA' },
      ...VIVIENDAS,
    ]);
    expect(cubo.descartadas).toBe(1);
    expect(cubo.sumar()).toBe(10);
    expect(cubo.agregarCelda('SIN_AFECTACION', 'ASEGURADA', 'HIPOTECA', -2)).toBe(false);
  });

  it('acepta celdas ya agregadas con su cantidad', () => {
    const cubo = crearCubo();
    cubo.agregarCelda('DESTRUCCION_TOTAL', 'ASEGURADA', 'HIPOTECA', 120);
    cubo.agregarCelda('DESTRUCCION_TOTAL', 'NO_ASEGURADA', 'HIPOTECA', 30);
    expect(analizarAseguramiento(cubo)).toMatchObject({ total: 150, destruidasConPoliza: 0.8 });
  });

  it('sin viviendas no inventa tasas', () => {
    expect(analizarAseguramiento(crearCubo())).toMatchObject({
      total: 0,
      cobertura: { minima: null, maxima: null },
      destruidasConPoliza: null,
    });
  });

  it('coincide con contar las viviendas una por una', () => {
    const vivienda = fc.record({
      estado: fc.constantFrom(...ESTADOS_FISICOS),
      aseguramiento: fc.constantFrom(...CONDICIONES_ASEGURAMIENTO),
      financiacion: fc.constantFrom(...TIPOS_FINANCIACION),
    });
    fc.assert(
      fc.property(fc.array(vivienda, { maxLength: 200 }), (viviendas) => {
        const cubo = cuboCon(viviendas);
        const resultado = analizarAseguramiento(cubo);
        for (const fila of resultado.tabla) {
          for (const aseguramiento of CONDICIONES_ASEGURAMIENTO) {
            const esperado = viviendas.filter(
              (elemento) =>
                elemento.estado === fila.estado &&
                elemento.financiacion === fila.financiacion &&
                elemento.aseguramiento === aseguramiento,
            ).length;
            expect(fila[aseguramiento]).toBe(esperado);
          }
        }
        expect(Object.values(resultado.porAseguramiento).reduce((suma, cantidad) => suma + cantidad, 0)).toBe(
          viviendas.length,
        );
        if (viviendas.length > 0) {
          expect(resultado.cobertura.minima).toBeLessThanOrEqual(resultado.cobertura.maxima);
        }
      }),
      { numRuns: 150, seed: 20260810 },
    );
  });
});

describe('embudo de reclamaciones', () => {
  it('sigue cada etapa del ciclo de la póliza', () => {
    expect(
      embudoDeReclamaciones({ NINGUNA: 10, EN_ESTUDIO: 5, RECHAZADA: 3, APROBADA: 4, PAGADA: 6 }),
    ).toEqual({
      aseguradas: 28,
      presentadas: 18,
      enEstudio: 5,
      rechazadas: 3,
      aprobadas: 10,
      pagadas: 6,
      tasaDePresentacion: 18 / 28,
      tasaDeAprobacion: 10 / 13,
      tasaDePago: 0.6,
    });
  });

  it('no inventa tasas sin reclamaciones', () => {
    expect(embudoDeReclamaciones({})).toMatchObject({
      presentadas: 0,
      tasaDePresentacion: null,
      tasaDePago: null,
    });
  });
});
