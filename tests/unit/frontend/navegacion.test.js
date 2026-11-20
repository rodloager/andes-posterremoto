import { describe, expect, it } from 'vitest';
import { destinoTrasAcceso, paginasPermitidas } from '../../../frontend/private/js/navegacion.js';

const analista = { permisos: ['datos:consultar', 'priorizacion:usar'] };
const ingeniero = { permisos: ['auditoria:ver', 'datos:consultar', 'sistema:ver'] };
const sinPaginas = { permisos: [] };

describe('navegación privada', () => {
  it('muestra solo las páginas que permite el rol', () => {
    expect(paginasPermitidas(analista).map(({ id }) => id)).toEqual([
      'administracion',
      'calidad',
      'priorizacion',
    ]);
    expect(paginasPermitidas(ingeniero).map(({ id }) => id)).toEqual([
      'administracion',
      'calidad',
      'ingenieria',
    ]);
  });

  it('vuelve a la página solicitada si el rol puede verla', () => {
    expect(destinoTrasAcceso(ingeniero, '/privado/ingenieria')).toBe('/privado/ingenieria');
  });

  it('lleva a la primera página permitida si la solicitada no lo está', () => {
    expect(destinoTrasAcceso(analista, '/privado/ingenieria')).toBe('/privado/administracion');
  });

  it.each([
    'https://sitio-malicioso.example',
    '//sitio-malicioso.example',
    '/\\sitio-malicioso.example',
    'javascript:alert(1)',
    '/privado/ingenieria?x=https://otro.example',
    '/privado/administracion/../../salir',
    null,
  ])('no redirige a un destino externo o desconocido: %s', (solicitado) => {
    expect(destinoTrasAcceso(ingeniero, solicitado)).toBe('/privado/administracion');
  });

  it('lleva al portal público a quien no tiene páginas privadas', () => {
    expect(destinoTrasAcceso(sinPaginas, '/privado/administracion')).toBe('/');
  });
});
