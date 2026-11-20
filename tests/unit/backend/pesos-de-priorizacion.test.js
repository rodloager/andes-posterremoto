import { describe, expect, it } from 'vitest';
import { parametrosDePriorizacion } from '../../../backend/src/models/esquemas.js';

const validar = (consulta) => parametrosDePriorizacion.safeParse(consulta);

describe('pesos de la priorización en la consulta', () => {
  it('convierte la lista de pesos en un objeto', () => {
    const { success, data } = validar({ pesos: 'personas_afectadas:40, viviendas_destruidas:12.5' });
    expect(success).toBe(true);
    expect(data.pesos).toEqual({ personas_afectadas: 40, viviendas_destruidas: 12.5 });
  });

  it('deja los pesos sin definir cuando no llegan', () => {
    expect(validar({}).data).toEqual({ evento: 'sismo-2026-08-10' });
  });

  it.each([
    ['un formato distinto', 'personas_afectadas=40', /criterio:valor/],
    ['un criterio repetido', 'a:1,a:2', /una sola vez/],
    ['un peso mayor que cien', 'a:101', /entre 0 y 100/],
    ['un peso negativo', 'a:-1', /criterio:valor/],
  ])('rechaza %s', (_, pesos, mensaje) => {
    const resultado = validar({ pesos });
    expect(resultado.success).toBe(false);
    expect(resultado.error.issues[0].message).toMatch(mensaje);
  });
});
