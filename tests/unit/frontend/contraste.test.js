import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const hoja = readFileSync(path.join(raiz, 'frontend', 'public', 'css', 'tokens.css'), 'utf8');
const colores = Object.fromEntries(
  [...hoja.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{6})/gi)].map(([, nombre, valor]) => [nombre, valor]),
);
const CONTRASTE_MINIMO = 4.5;

const PARES_DE_TEXTO = Object.freeze([
  ['grafito', 'blanco'],
  ['grafito', 'fondo'],
  ['gris-medio', 'blanco'],
  ['gris-medio', 'fondo'],
  ['gris-medio', 'alerta-fondo'],
  ['azul-oscuro', 'blanco'],
  ['azul-oscuro', 'azul-claro'],
  ['azul-institucional', 'blanco'],
  ['azul-institucional', 'azul-claro'],
  ['alerta', 'blanco'],
  ['alerta', 'alerta-fondo'],
  ['critico', 'blanco'],
  ['critico', 'critico-fondo'],
  ['positivo', 'blanco'],
  ['positivo', 'positivo-fondo'],
  ['blanco', 'azul-oscuro'],
  ['blanco', 'azul-institucional'],
]);

function luminancia(hexadecimal) {
  const [rojo, verde, azul] = [1, 3, 5]
    .map((inicio) => Number.parseInt(hexadecimal.slice(inicio, inicio + 2), 16) / 255)
    .map((canal) => (canal <= 0.03928 ? canal / 12.92 : ((canal + 0.055) / 1.055) ** 2.4));
  return 0.2126 * rojo + 0.7152 * verde + 0.0722 * azul;
}

function contraste(primero, segundo) {
  const [clara, oscura] = [luminancia(primero), luminancia(segundo)].sort((una, otra) => otra - una);
  return (clara + 0.05) / (oscura + 0.05);
}

describe('contraste de los colores de texto (WCAG 2.1 AA)', () => {
  it('calcula los extremos conocidos', () => {
    expect(contraste('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contraste('#777777', '#777777')).toBeCloseTo(1, 5);
  });

  it.each(PARES_DE_TEXTO)('%s sobre %s alcanza 4,5:1', (texto, fondo) => {
    expect(colores[texto], texto).toBeDefined();
    expect(colores[fondo], fondo).toBeDefined();
    expect(contraste(colores[texto], colores[fondo])).toBeGreaterThanOrEqual(CONTRASTE_MINIMO);
  });
});
