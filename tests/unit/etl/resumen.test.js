import { describe, expect, it } from 'vitest';
import { describir } from '../../../etl/proceso.js';

const resumen = (cambios) => ({
  leidas: 0,
  validas: 0,
  rechazadas: 0,
  omitidas: 0,
  duplicados: 0,
  enRevision: 0,
  ...cambios,
});

describe('mensaje de una carga terminada', () => {
  it('usa el singular cuando la cantidad es uno', () => {
    expect(describir(resumen({ leidas: 1, validas: 1, duplicados: 1, enRevision: 1 }))).toBe(
      '1 fila leída, 1 válida, 0 rechazadas, 1 duplicado exacto descartado, 1 registro en revisión por posible duplicado.',
    );
  });

  it('separa los miles y agrega las filas sin reporte solo cuando las hay', () => {
    expect(describir(resumen({ leidas: 60000, validas: 59000, rechazadas: 1000 }))).toBe(
      '60.000 filas leídas, 59.000 válidas, 1.000 rechazadas, 0 duplicados exactos descartados, 0 registros en revisión por posible duplicado.',
    );
    expect(describir(resumen({ leidas: 1122, validas: 498, omitidas: 624 }))).toMatch(/, 624 sin reporte\.$/);
  });
});
