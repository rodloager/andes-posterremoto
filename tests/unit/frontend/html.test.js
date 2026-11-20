import { describe, expect, it } from 'vitest';
import { escaparHtml } from '../../../frontend/public/js/nucleo/html.js';

describe('escape de HTML en los textos de las gráficas', () => {
  it('neutraliza las marcas y conserva el texto', () => {
    expect(escaparHtml('<img src=x onerror="alert(1)">')).toBe(
      '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;',
    );
    expect(escaparHtml("Bogotá & D'Alemán")).toBe('Bogotá &amp; D&#39;Alemán');
  });

  it('convierte en texto vacío lo que no existe', () => {
    expect(escaparHtml(null)).toBe('');
    expect(escaparHtml(undefined)).toBe('');
    expect(escaparHtml(42)).toBe('42');
  });
});
