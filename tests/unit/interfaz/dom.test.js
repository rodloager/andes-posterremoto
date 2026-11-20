import { describe, expect, it } from 'vitest';
import { crearFigura } from '../../../frontend/public/js/componentes/figura.js';
import { crearSello } from '../../../frontend/public/js/componentes/sello.js';
import { crear, enlaceExterno } from '../../../frontend/public/js/nucleo/dom.js';
import { nota, rejilla, seccion } from '../../../frontend/public/js/nucleo/secciones.js';
import { crearTabla } from '../../../frontend/public/js/nucleo/tabla.js';

describe('construcción del DOM', () => {
  it('aplica clase, texto y atributos, y omite los valores vacíos', () => {
    const elemento = crear('p', {
      clase: 'nota',
      texto: '<b>texto</b>',
      'aria-live': 'polite',
      hidden: true,
      title: null,
    });
    expect(elemento.className).toBe('nota');
    expect(elemento.textContent).toBe('<b>texto</b>');
    expect(elemento.children).toHaveLength(0);
    expect(elemento.getAttribute('aria-live')).toBe('polite');
    expect(elemento.hasAttribute('hidden')).toBe(true);
    expect(elemento.hasAttribute('title')).toBe(false);
  });

  it('agrega hijos y textos, aplana un nivel y salta los nulos', () => {
    const lista = crear(
      'ul',
      {},
      [crear('li', { texto: 'uno' }), null],
      false,
      undefined,
      crear('li', { texto: 'dos' }),
    );
    expect([...lista.children].map((hijo) => hijo.textContent)).toEqual(['uno', 'dos']);
  });

  it('abre los enlaces externos en otra pestaña sin dar acceso a la página', () => {
    const enlace = enlaceExterno(
      'DANE',
      'https://www.dane.gov.co',
      'Departamento Administrativo Nacional de Estadística',
    );
    expect(enlace.getAttribute('target')).toBe('_blank');
    expect(enlace.getAttribute('rel')).toBe('noopener noreferrer');
    expect(enlace.title).toMatch(/Estadística/);
  });
});

describe('secciones, tablas y figuras', () => {
  it('arma una sección con su encabezado, su descripción y su ancla', () => {
    const elemento = seccion(
      { titulo: 'Indicadores clave', descripcion: 'Proporciones', id: 'clave' },
      nota('Aviso', { alerta: true }),
      rejilla(crear('div')),
    );
    expect(elemento.id).toBe('clave');
    expect(elemento.querySelector('h2').textContent).toBe('Indicadores clave');
    expect(elemento.querySelector('.nota--alerta').textContent).toBe('Aviso');
    expect(elemento.querySelector('.rejilla-graficas')).not.toBeNull();
  });

  it('crea una tabla accesible con encabezados de fila y de columna', () => {
    const tabla = crearTabla({
      titulo: 'Ranking',
      columnas: [{ nombre: 'Departamento' }, { nombre: 'Personas', numerica: true }],
      filas: [
        ['Chocó', '72.317'],
        [crear('strong', { texto: 'Cauca' }), crear('span', { texto: '22.038' })],
      ],
    });
    expect(tabla.getAttribute('role')).toBe('region');
    expect(tabla.querySelector('caption').textContent).toBe('Ranking');
    expect(
      [...tabla.querySelectorAll('thead th')].every((celda) => celda.getAttribute('scope') === 'col'),
    ).toBe(true);
    expect([...tabla.querySelectorAll('tbody th')].map((celda) => celda.getAttribute('scope'))).toEqual([
      'row',
      'row',
    ]);
    expect(tabla.querySelector('tbody td').className).toBe('numero');
    expect(tabla.querySelector('tbody tr:last-child strong').textContent).toBe('Cauca');
  });

  it('marca la figura simulada y cita la fuente con su enlace', () => {
    const simulada = crearFigura(
      {
        pregunta: '¿Cuántas?',
        descripcion: 'Detalle',
        origen: { tipo: 'SIMULADO', nivel: 'S', texto: 'Muestra simulada.' },
      },
      crear('div'),
    );
    expect(simulada.className).toBe('grafica grafica--simulado');
    expect(simulada.querySelector('.sello').textContent).toBe('Simulado');
    const oficial = crearFigura(
      {
        pregunta: '¿Dónde?',
        origen: { tipo: 'OFICIAL', nivel: 'A', texto: 'Fuente: DANE.', enlace: 'https://www.dane.gov.co' },
      },
      crear('div'),
    );
    expect(oficial.className).toBe('grafica');
    expect(oficial.querySelector('figcaption a').textContent).toBe('Ver la fuente');
  });

  it.each([
    ['OFICIAL', 'A', 'Oficial · nivel A'],
    ['CALCULADO', 'C', 'Cálculo con cifras oficiales'],
    ['SIMULADO', 'S', 'Simulado'],
    ['DESCONOCIDO', undefined, 'Sin dato'],
  ])('el sello de origen %s dice «%s»', (origen, nivel, texto) => {
    expect(crearSello(origen, nivel).textContent).toBe(texto);
  });
});
