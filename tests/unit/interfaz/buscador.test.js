import { describe, expect, it, vi } from 'vitest';
import {
  crearBuscadorDeMunicipios,
  textoDeMunicipio,
} from '../../../frontend/public/js/componentes/buscador.js';

const PALMAR = {
  codigo: '27660',
  nombre: 'San José del Palmar',
  departamento: { codigo: '27', nombre: 'Chocó' },
};
const PALMIRA = {
  codigo: '76520',
  nombre: 'Palmira',
  departamento: { codigo: '76', nombre: 'Valle del Cauca' },
};

describe('buscador de municipios', () => {
  it('muestra cada sugerencia con su departamento', async () => {
    const buscar = vi.fn(async () => [PALMAR, PALMIRA]);
    const buscador = crearBuscadorDeMunicipios({ alElegir: () => {}, buscar });
    await buscador.sugerir('palm');
    expect(buscar).toHaveBeenCalledWith('palm');
    expect([...buscador.campo.querySelectorAll('option')].map((opcion) => opcion.value)).toEqual([
      'San José del Palmar, Chocó',
      'Palmira, Valle del Cauca',
    ]);
    expect(buscador.entrada.getAttribute('list')).toBe('sugerencias-de-municipios');
    expect(buscador.campo.textContent).toMatch(/Buscar municipio/);
  });

  it('no consulta con menos de dos letras', async () => {
    const buscar = vi.fn(async () => [PALMAR]);
    const buscador = crearBuscadorDeMunicipios({ alElegir: () => {}, buscar });
    await buscador.sugerir('p');
    expect(buscar).not.toHaveBeenCalled();
    expect(buscador.campo.querySelectorAll('option')).toHaveLength(0);
  });

  it('elige el municipio cuando el texto coincide con una sugerencia', async () => {
    const alElegir = vi.fn();
    const buscador = crearBuscadorDeMunicipios({ alElegir, buscar: async () => [PALMAR] });
    await buscador.sugerir('palmar');
    buscador.entrada.value = textoDeMunicipio(PALMAR);
    buscador.entrada.dispatchEvent(new Event('input'));
    expect(alElegir).toHaveBeenCalledWith(PALMAR);
  });

  it('descarta una respuesta vieja que llega después de una nueva', async () => {
    let liberar;
    const lenta = new Promise((resolver) => {
      liberar = resolver;
    });
    const buscar = vi.fn((texto) => (texto === 'pa' ? lenta : Promise.resolve([PALMIRA])));
    const buscador = crearBuscadorDeMunicipios({ alElegir: () => {}, buscar });
    const vieja = buscador.sugerir('pa');
    await buscador.sugerir('palmi');
    liberar([PALMAR]);
    await vieja;
    expect([...buscador.campo.querySelectorAll('option')].map((opcion) => opcion.value)).toEqual([
      'Palmira, Valle del Cauca',
    ]);
  });
});
