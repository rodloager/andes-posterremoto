import { describe, expect, it } from 'vitest';
import {
  compararPor,
  nombresDe,
  ordenarPor,
  serieDe,
  valoresPorCodigo,
} from '../../../frontend/public/js/nucleo/territorio.js';

const territorios = [
  { codigo: '17', nombre: 'Caldas', valores: { viviendasDestruidas: 2347, heridos: 329 } },
  { codigo: '13', nombre: 'Bolívar', valores: { viviendasAveriadas: 15 } },
  { codigo: '76', nombre: 'Valle del Cauca', valores: { viviendasDestruidas: 9054, heridos: 2822 } },
  { codigo: '25', nombre: 'Cundinamarca', valores: { viviendasDestruidas: 0 } },
  { codigo: '27', nombre: 'Chocó', valores: { viviendasDestruidas: 3521 } },
];

describe('valoresPorCodigo', () => {
  const valores = valoresPorCodigo(territorios, 'viviendasDestruidas');

  it('indexa el valor de cada territorio por su código', () => {
    expect(valores.get('76')).toBe(9054);
    expect(valores.get('17')).toBe(2347);
  });

  it('distingue el cero reportado del valor ausente', () => {
    expect(valores.get('25')).toBe(0);
    expect(valores.get('13')).toBeUndefined();
    expect(valores.has('13')).toBe(true);
  });
});

describe('serieDe', () => {
  it('devuelve un valor por territorio y deja vacíos los ausentes', () => {
    expect(serieDe(territorios, 'heridos')).toEqual([329, null, 2822, null, null]);
  });
});

describe('compararPor', () => {
  it('ordena de mayor a menor y deja los vacíos al final, después del cero', () => {
    const orden = [...territorios].sort(compararPor('viviendasDestruidas'));
    expect(orden.map(({ codigo }) => codigo)).toEqual(['76', '27', '17', '25', '13']);
  });
});

describe('ordenarPor', () => {
  it('conserva solo los territorios con valor mayor que cero, de mayor a menor', () => {
    expect(nombresDe(ordenarPor(territorios, 'viviendasDestruidas'))).toEqual([
      'Valle del Cauca',
      'Chocó',
      'Caldas',
    ]);
  });

  it('limita la cantidad de territorios', () => {
    expect(nombresDe(ordenarPor(territorios, 'viviendasDestruidas', 2))).toEqual([
      'Valle del Cauca',
      'Chocó',
    ]);
  });

  it('devuelve una lista vacía cuando nadie reporta la variable', () => {
    expect(ordenarPor(territorios, 'acueductos')).toEqual([]);
  });

  it('no altera la lista original', () => {
    const copia = structuredClone(territorios);
    ordenarPor(territorios, 'viviendasDestruidas');
    expect(territorios).toEqual(copia);
  });
});
