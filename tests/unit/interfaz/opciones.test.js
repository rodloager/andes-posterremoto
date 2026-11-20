import { describe, expect, it } from 'vitest';
import {
  barras,
  circular,
  embudo,
  lineas,
  matriz,
  piramide,
} from '../../../frontend/public/js/graficas/opciones.js';

describe('constructores de gráficas', () => {
  it('devuelven siempre la tabla alternativa con los mismos datos', () => {
    const { opcion, tabla } = barras({
      categorias: ['Chocó', 'Cauca'],
      series: [{ nombre: 'Personas', valores: [72317, null] }],
      encabezado: 'Departamento',
    });
    expect(opcion.series[0].data).toEqual([72317, null]);
    expect(tabla.columnas.map(({ nombre }) => nombre)).toEqual(['Departamento', 'Personas']);
    expect(tabla.filas).toEqual([
      ['Chocó', '72.317'],
      ['Cauca', 'Sin dato'],
    ]);
  });

  it('escapa los nombres en la ventana de información de una torta', () => {
    const { opcion, tabla } = circular({ categorias: ['<img src=x>', 'Rural'], valores: [30, null] });
    const ventana = opcion.tooltip.formatter({ name: '<img src=x>', value: 30 });
    expect(ventana).toBe('&lt;img src=x&gt;: 30 (100 %)');
    expect(tabla.filas[1]).toEqual(['Rural', 'Sin dato', 'Sin dato']);
  });

  it('dibuja la pirámide con los hombres a la izquierda y respeta las celdas ocultas', () => {
    const { opcion, tabla } = piramide({
      grupos: ['0 a 4', '5 a 9'],
      hombres: [120, null],
      mujeres: [110, 90],
    });
    expect(opcion.series[0].data).toEqual([-120, null]);
    expect(opcion.tooltip.valueFormatter(null)).toBe('Sin dato');
    expect(opcion.tooltip.valueFormatter(-120)).toBe('120');
    expect(tabla.filas[1]).toEqual(['5 a 9', 'Sin dato', '90']);
  });

  it('calcula la escala de la matriz sin las celdas ocultas y escapa sus nombres', () => {
    const { opcion, tabla } = matriz({
      filas: ['Destrucción total', 'Leve'],
      columnas: ['Asegurada', '<b>No</b>'],
      valores: [
        [null, 40],
        [25, null],
      ],
      encabezado: 'Estado físico',
    });
    expect(opcion.visualMap.max).toBe(40);
    expect(opcion.tooltip.formatter({ value: [1, 0, 40] })).toBe(
      'Destrucción total · &lt;b&gt;No&lt;/b&gt;: <strong>40</strong>',
    );
    expect(opcion.series[0].label.formatter({ value: [0, 0, null] })).toBe('Sin dato');
    expect(tabla.filas).toEqual([
      ['Destrucción total', 'Sin dato', '40'],
      ['Leve', '25', 'Sin dato'],
    ]);
  });

  it('ubica cada punto de una línea en su fecha y escapa el nombre de la serie', () => {
    const { opcion, tabla } = lineas({
      series: [
        {
          nombre: 'Personas <registradas>',
          puntos: [
            { fecha: '2026-08-10', valor: 300 },
            { fecha: '2026-08-17', valor: null },
          ],
        },
      ],
    });
    const ventana = opcion.tooltip.formatter([
      { marker: '•', seriesName: 'Personas <registradas>', value: ['2026-08-10', 300] },
    ]);
    expect(ventana).toBe('10/08/2026<br>• Personas &lt;registradas&gt;: <strong>300</strong>');
    expect(tabla.filas[0][0]).toBe('10/08/2026');
  });

  it('expresa cada etapa del embudo como parte de la primera', () => {
    const { opcion, tabla } = embudo({
      etapas: ['Aseguradas', 'Con reclamación'],
      valores: [200, 50],
      unidad: 'viviendas',
    });
    expect(opcion.tooltip.formatter({ name: 'Con reclamación', value: 50 })).toBe(
      'Con reclamación: 50 (25 %)',
    );
    expect(tabla.filas).toHaveLength(2);
  });
});
