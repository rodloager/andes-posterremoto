import { describe, expect, it } from 'vitest';
import { normalizarDireccion, normalizarTexto, quitarTildes } from '../../../backend/src/algorithms/texto.js';

describe('normalización de texto', () => {
  it.each([
    ['José  Pérez Gómez', 'JOSE PEREZ GOMEZ'],
    ['Peña', 'PENA'],
    ['Bogotá, D. C.', 'BOGOTA D C'],
    ['  Ánimas-Ñuñoa  ', 'ANIMAS NUNOA'],
    ['', ''],
  ])('convierte %j en %j', (texto, esperado) => {
    expect(normalizarTexto(texto)).toBe(esperado);
  });

  it('quita las tildes sin alterar el resto', () => {
    expect(quitarTildes('Quibdó, Chocó')).toBe('Quibdo, Choco');
  });
});

describe('normalización de direcciones', () => {
  it.each([
    ['Calle 10 # 5-20', 'CL 10 5 20'],
    ['Cra. 7 No. 45-12 Apto 301', 'KR 7 45 12 AP 301'],
    ['CARRERA 7 N 45 12', 'KR 7 45 12'],
    ['Avenida Boyacá # 68-90', 'AV BOYACA 68 90'],
    ['Vereda La Esperanza, kilómetro 3', 'VDA LA ESPERANZA KM 3'],
  ])('unifica %j como %j', (direccion, esperado) => {
    expect(normalizarDireccion(direccion)).toBe(esperado);
  });
});
