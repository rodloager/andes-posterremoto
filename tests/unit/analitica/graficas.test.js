import { describe, expect, it } from 'vitest';
import {
  ajusteLogaritmico,
  cantidadCorta,
  escapar,
  graficaDeAlgoritmos,
  graficaDeApi,
  graficaDeConsultas,
} from '../../../analytics/benchmarks/graficas.js';

const API = Object.freeze({
  registros: { personas: 984939, viviendas: 50000 },
  carga: { solicitudesPorRuta: 500, concurrencia: 8 },
  criterio: { p95MaximoMs: 300 },
  rutas: [
    { ruta: '/api/v1/estado', servidor: { p95Ms: 1.6 } },
    { ruta: '/api/v1/eventos/sismo-2026-08-10/kpi', servidor: { p95Ms: 412 } },
  ],
});

describe('gráficas de las mediciones', () => {
  it('estima el exponente de una potencia exacta', () => {
    const puntos = [1000, 2000, 4000, 8000].map((n) => ({ n, ms: 0.001 * n ** 2 }));
    expect(ajusteLogaritmico(puntos).pendiente).toBeCloseTo(2, 10);
  });

  it('abrevia las cantidades y escapa el texto del SVG', () => {
    expect([cantidadCorta(31250), cantidadCorta(1_000_000), cantidadCorta(125)]).toEqual([
      '31 mil',
      '1 M',
      '125',
    ]);
    expect(escapar('<a & "b">')).toBe('&#60;a &#38; &#34;b&#34;&#62;');
  });

  it('dibuja un panel por experimento con su pendiente', () => {
    const svg = graficaDeAlgoritmos({
      experimentos: [
        {
          algoritmo: 1,
          nombre: 'Clasificación',
          variante: 'Tabla',
          rangoEsperado: [0.8, 1.25],
          coincide: true,
          puntos: [1000, 2000, 4000].map((n) => ({ n, ms: n / 100 })),
        },
      ],
    });
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toMatch(/<title>Experimento de duplicación/);
    expect(svg).toMatch(/pendiente 1 · esperada 0,8 a 1,25/);
    expect(svg.match(/<circle/g)).toHaveLength(3);
  });

  it('marca en rojo la ruta que supera el límite y dibuja la línea del límite', () => {
    const svg = graficaDeApi(API);
    expect(svg).toMatch(/Límite de RNF-01: 300 ms/);
    expect(svg).toMatch(/\/eventos\/:evento\/kpi/);
    expect(svg).toMatch(/fill="#b42318"/);
  });

  it('agrupa cada comparación de planes y escribe el tiempo real', () => {
    const svg = graficaDeConsultas({
      resultados: [
        {
          nombre: 'Candidatos de un bloque',
          variantes: [
            { etiqueta: 'Índice', ms: 0.008 },
            { etiqueta: 'Recorrido secuencial', ms: 30.864 },
          ],
        },
      ],
    });
    expect(svg).toMatch(/Candidatos de un bloque/);
    expect(svg).toMatch(/0,008 ms/);
    expect(svg).toMatch(/30,864 ms/);
  });
});
