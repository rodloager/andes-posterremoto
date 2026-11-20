import { describe, expect, it } from 'vitest';
import {
  SIN_DATO,
  formatearCantidad,
  formatearConSigno,
  formatearDolares,
  formatearDuracion,
  formatearFecha,
  formatearFechaLarga,
  formatearMilisegundos,
  formatearMomento,
  formatearNumero,
  formatearPesos,
  formatearPorcentaje,
  formatearValor,
} from '../../../frontend/public/js/nucleo/formato.js';

describe('valores vacíos', () => {
  it('no convierte un vacío en cero', () => {
    expect(formatearCantidad(undefined)).toBe(SIN_DATO);
    expect(formatearCantidad(null)).toBe(SIN_DATO);
    expect(formatearValor(null, 'viviendas')).toEqual({ texto: SIN_DATO, unidad: '' });
    expect(formatearValor(undefined, 'COP')).toEqual({ texto: SIN_DATO, unidad: '' });
  });

  it('muestra el cero cuando la fuente lo reporta', () => {
    expect(formatearCantidad(0)).toBe('0');
    expect(formatearValor(0, 'viviendas')).toEqual({ texto: '0', unidad: 'viviendas' });
  });
});

describe('formatearNumero', () => {
  it('separa los miles con punto', () => {
    expect(formatearNumero(489862)).toBe('489.862');
    expect(formatearNumero(4516)).toBe('4.516');
  });

  it('conserva los números pequeños y el cero', () => {
    expect(formatearNumero(0)).toBe('0');
    expect(formatearNumero(335)).toBe('335');
  });
});

describe('formatearPesos', () => {
  it('expresa los billones con coma decimal', () => {
    expect(formatearPesos(54_000_000_000_000)).toBe('$54 billones');
    expect(formatearPesos(58_290_000_000_000)).toBe('$58,29 billones');
    expect(formatearPesos(3_700_000_000_000)).toBe('$3,7 billones');
  });

  it('usa el singular para un billón exacto', () => {
    expect(formatearPesos(1_000_000_000_000)).toBe('$1 billón');
  });

  it('expresa en millones las cifras menores a un billón', () => {
    expect(formatearPesos(95_076_000_000)).toBe('$95.076 millones');
    expect(formatearPesos(4_600_000_000)).toBe('$4.600 millones');
  });

  it('muestra completas las cifras menores a un millón', () => {
    expect(formatearPesos(875_452)).toBe('$875.452');
  });
});

describe('formatearDolares', () => {
  it('antepone la sigla de la moneda', () => {
    expect(formatearDolares(48_000_000)).toBe('USD 48 millones');
  });
});

describe('formatearPorcentaje', () => {
  it('redondea a un decimal y separa el símbolo', () => {
    expect(formatearPorcentaje(18.25)).toBe('18,3 %');
    expect(formatearPorcentaje(100)).toBe('100 %');
  });
});

describe('formatearFecha', () => {
  it('convierte la fecha ISO al orden día, mes y año', () => {
    expect(formatearFecha('2026-08-10')).toBe('10/08/2026');
  });

  it('escribe la fecha larga sin desplazarla por la zona horaria', () => {
    expect(formatearFechaLarga('2026-08-10')).toBe('10 de agosto de 2026');
  });
});

describe('formatearValor', () => {
  it('integra la unidad cuando es moneda o porcentaje', () => {
    expect(formatearValor(54_000_000_000_000, 'COP')).toEqual({ texto: '$54 billones', unidad: '' });
    expect(formatearValor(32.66, '%')).toEqual({ texto: '32,7 %', unidad: '' });
  });

  it('devuelve la unidad aparte en los conteos', () => {
    expect(formatearValor(36478, 'viviendas')).toEqual({ texto: '36.478', unidad: 'viviendas' });
  });
});

describe('formatearConSigno', () => {
  it('marca los aumentos y las disminuciones', () => {
    expect(formatearConSigno(21773, 'viviendas')).toBe('+21.773');
    expect(formatearConSigno(-5, 'personas')).toBe('−5');
  });

  it('no pone signo al cero', () => {
    expect(formatearConSigno(0, 'personas')).toBe('0');
  });
});

describe('formatearMomento', () => {
  it('muestra la hora de Colombia en formato de 24 horas', () => {
    expect(formatearMomento('2026-08-10T15:04:00Z')).toBe('10/08/2026, 10:04');
    expect(formatearMomento('2026-08-11T04:30:00Z')).toBe('10/08/2026, 23:30');
  });

  it('indica la ausencia de dato', () => {
    expect(formatearMomento(null)).toBe(SIN_DATO);
  });
});

describe('formatearMilisegundos', () => {
  it('usa un decimal y la coma colombiana', () => {
    expect(formatearMilisegundos(12.345)).toBe('12,3 ms');
    expect(formatearMilisegundos(1234.56)).toBe('1.234,6 ms');
    expect(formatearMilisegundos(0)).toBe('0 ms');
    expect(formatearMilisegundos(undefined)).toBe(SIN_DATO);
  });
});

describe('formatearDuracion', () => {
  it.each([
    [42.25, '42,3 s'],
    [59.94, '59,9 s'],
    [59.99, '1 min'],
    [60, '1 min'],
    [3725, '1 h 2 min'],
    [86_400, '1 d 0 h'],
    [90_061, '1 d 1 h'],
  ])('escribe %f segundos como %s', (segundos, texto) => {
    expect(formatearDuracion(segundos)).toBe(texto);
  });

  it('indica la ausencia de dato', () => {
    expect(formatearDuracion(null)).toBe(SIN_DATO);
  });
});
