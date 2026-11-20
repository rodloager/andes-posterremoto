import { describe, expect, it } from 'vitest';
import { combinarSimulados } from '../../../frontend/public/js/nucleo/contexto.js';
import {
  describirComponentes,
  describirFechaDeFuente,
  describirVariacion,
  formatearKpi,
  fuentesDelKpi,
  separarKpi,
} from '../../../frontend/public/js/nucleo/kpi.js';

describe('presentación de un indicador clave', () => {
  it('formatea porcentajes y tasas por cien mil con su calificador', () => {
    expect(formatearKpi({ valor: 12.88, unidad: 'porcentaje', calificador: 'más de' })).toEqual({
      cifra: 'más de 12,9 %',
      unidad: '',
    });
    expect(formatearKpi({ valor: 68.386, unidad: 'por_cien_mil', calificador: null })).toEqual({
      cifra: '68,4',
      unidad: 'por cada 100 mil',
    });
    expect(() => formatearKpi({ valor: 1, unidad: 'por_mil' })).toThrow(/desconocida/);
  });

  it('describe la variación en puntos porcentuales con su valoración', () => {
    expect(
      describirVariacion({
        unidad: 'porcentaje',
        variacion: { absoluta: -0.35, corteAnterior: '2026-08-15', valoracion: 'mejora' },
      }),
    ).toEqual({
      texto: '−0,4 puntos porcentuales frente al corte del 15/08/2026',
      valoracion: 'mejora',
      etiqueta: 'Mejora',
    });
    expect(describirVariacion({ unidad: 'porcentaje', variacion: null })).toBeNull();
    expect(
      describirVariacion({
        unidad: 'por_cien_mil',
        variacion: { absoluta: 2, corteAnterior: '2026-08-15', valoracion: null },
      }),
    ).toMatchObject({ texto: '+2 por cada 100 mil frente al corte del 15/08/2026', etiqueta: null });
  });

  it('describe las partes con sus unidades y calificadores', () => {
    expect(
      describirComponentes({
        numerador: { valor: 4700, unidad: 'viviendas', calificador: 'más de' },
        denominador: { valor: 36478, unidad: 'viviendas', calificador: null },
      }),
    ).toBe('más de 4.700 viviendas sobre 36.478 viviendas');
    expect(
      describirComponentes({
        numerador: { valor: 95_076_000_000, unidad: 'COP', calificador: null },
        denominador: { valor: 3_700_000_000_000, unidad: 'COP', calificador: null },
      }),
    ).toBe('$95.076 millones sobre $3,7 billones');
  });

  it('lista cada fuente una vez, con su fecha', () => {
    const fuentes = fuentesDelKpi(
      {
        numerador: { fuente: 'a', fechaCorte: '2026-10-23', tipo: 'indicador' },
        denominador: { fuente: 'b', fechaCorte: '2026-08-22', tipo: 'territorial' },
      },
      (id) =>
        id === 'a' ? { sigla: 'MinVivienda', entidad: 'Ministerio', enlace: 'https://ejemplo.gov.co' } : null,
    );
    expect(fuentes.map(({ nombre }) => nombre)).toEqual(['MinVivienda', 'b']);
    expect(fuentes.map(describirFechaDeFuente)).toEqual([
      'corte del 23/10/2026',
      'reportes hasta el 22/08/2026',
    ]);
  });

  it('separa los oficiales de los simulados', () => {
    const { oficiales, simulados } = separarKpi([
      { origen: 'OFICIAL' },
      { origen: 'SIMULADO' },
      { origen: 'OFICIAL' },
    ]);
    expect([oficiales.length, simulados.length]).toEqual([2, 1]);
  });
});

describe('indicadores simulados del contexto', () => {
  it('reemplaza los del archivo por los de los registros y retira los que no se publican', () => {
    expect(
      combinarSimulados(
        { a: { valor: 1 }, b: { valor: 2 }, c: { valor: 3 } },
        { b: { valor: 20 }, c: null, d: { valor: 40 } },
      ),
    ).toEqual({ a: { valor: 1 }, b: { valor: 20 }, d: { valor: 40 } });
  });
});
