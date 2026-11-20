import { describe, expect, it } from 'vitest';
import {
  describirCambio,
  pesosConfigurados,
  repartir,
  textoDePesos,
} from '../../../frontend/private/js/pesos.js';

describe('pesos del laboratorio de priorización', () => {
  it('escribe los pesos en el formato que espera la API', () => {
    expect(textoDePesos({ personas_afectadas: 40, viviendas_destruidas: 0 })).toBe(
      'personas_afectadas:40,viviendas_destruidas:0',
    );
  });

  it('reparte los pesos sobre cien y evita dividir por cero', () => {
    expect(repartir({ a: 25, b: 75 })).toEqual({ a: 25, b: 75 });
    expect(repartir({ a: 1, b: 1, c: 2 })).toEqual({ a: 25, b: 25, c: 50 });
    expect(repartir({ a: 0, b: 0 })).toEqual({ a: 0, b: 0 });
  });

  it('describe el cambio de puesto', () => {
    expect([describirCambio(3), describirCambio(-2), describirCambio(0)]).toEqual([
      'Sube 3',
      'Baja 2',
      'Igual',
    ]);
  });

  it('toma los pesos configurados solo de los criterios con datos', () => {
    expect(
      pesosConfigurados([
        { codigo: 'a', incluido: true, pesoConfigurado: 0.25 },
        { codigo: 'b', incluido: false, pesoConfigurado: 0.1 },
      ]),
    ).toEqual({ a: 25 });
  });
});
