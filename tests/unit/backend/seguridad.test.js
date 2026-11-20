import { describe, expect, it, vi } from 'vitest';
import { exigirPermiso, tienePermiso } from '../../../backend/src/middlewares/autenticacion.js';
import { crearProteccionDePaginas } from '../../../backend/src/middlewares/paginasPrivadas.js';
import { verificarOrigen } from '../../../backend/src/middlewares/seguridad.js';

const encabezados = (valores) => (nombre) => valores[nombre.toLowerCase()];

function verificar(method, valores) {
  const siguiente = vi.fn();
  verificarOrigen({ method, get: encabezados({ host: 'andes.example', ...valores }) }, {}, siguiente);
  return siguiente;
}

describe('verificación del origen', () => {
  it.each(['GET', 'HEAD', 'OPTIONS'])(
    'deja pasar el método seguro %s aunque venga de otro sitio',
    (metodo) => {
      expect(
        verificar(metodo, { origin: 'https://otro.example', 'sec-fetch-site': 'cross-site' }),
      ).toHaveBeenCalled();
    },
  );

  it.each([
    ['el mismo anfitrión', { origin: 'https://andes.example' }],
    ['un cliente sin cabeceras de navegador', {}],
    ['una solicitud del mismo origen según el navegador', { 'sec-fetch-site': 'same-origin' }],
  ])('acepta %s', (descripcion, valores) => {
    expect(verificar('POST', valores)).toHaveBeenCalled();
  });

  it.each([
    ['otro anfitrión', { origin: 'https://otro.example' }],
    ['un subdominio parecido', { origin: 'https://andes.example.otro.example' }],
    ['otro puerto', { origin: 'https://andes.example:8443' }],
    ['un origen opaco', { origin: 'null' }],
    ['un origen mal formado', { origin: '::::' }],
    ['una solicitud marcada como de otro sitio', { 'sec-fetch-site': 'cross-site' }],
  ])('rechaza %s', (descripcion, valores) => {
    expect(() => verificar('POST', valores)).toThrow(
      expect.objectContaining({ estado: 403, codigo: 'ORIGEN_NO_PERMITIDO' }),
    );
  });
});

describe('permisos', () => {
  const analista = { permisos: ['datos:consultar', 'priorizacion:usar'] };

  it('consulta la lista de permisos del usuario', () => {
    expect(tienePermiso(analista, 'datos:consultar')).toBe(true);
    expect(tienePermiso(analista, 'sistema:ver')).toBe(false);
    expect(tienePermiso(undefined, 'datos:consultar')).toBe(false);
  });

  it('distingue entre falta de sesión y falta de permiso', () => {
    const exigir = exigirPermiso('sistema:ver');
    expect(() => exigir({}, { locals: {} }, vi.fn())).toThrow(expect.objectContaining({ estado: 401 }));
    expect(() => exigir({}, { locals: { usuario: analista } }, vi.fn())).toThrow(
      expect.objectContaining({ estado: 403 }),
    );
    const siguiente = vi.fn();
    exigir({}, { locals: { usuario: { permisos: ['sistema:ver'] } } }, siguiente);
    expect(siguiente).toHaveBeenCalledOnce();
  });
});

describe('protección de páginas privadas', () => {
  const proteger = crearProteccionDePaginas({
    paginaProhibida: '/403.html',
    paginaNoEncontrada: '/404.html',
  });

  function visitar(ruta, usuario) {
    const solicitud = { path: ruta, url: ruta };
    const respuesta = {
      locals: { usuario },
      resultado: null,
      status(estado) {
        this.estado = estado;
        return this;
      },
      sendFile(archivo) {
        this.resultado = { estado: this.estado, archivo };
      },
      redirect(estado, destino) {
        this.resultado = { estado, destino };
      },
    };
    const siguiente = vi.fn();
    proteger(solicitud, respuesta, siguiente);
    return { solicitud, resultado: respuesta.resultado, continua: siguiente.mock.calls.length === 1 };
  }

  const ingeniero = { permisos: ['datos:consultar', 'sistema:ver', 'auditoria:ver'] };
  const analista = { permisos: ['datos:consultar'] };

  it.each(['/', '/index', '/index.html', '/css/privado.css', '/js/paginas/ingenieria.js'])(
    'deja pasar sin sesión el recurso libre %s',
    (ruta) => {
      expect(visitar(ruta).continua).toBe(true);
    },
  );

  it.each([
    '/ingenieria',
    '/INGENIERIA',
    '/Ingenieria.HTML',
    '/ingenier%69a',
    '/ingenieria/',
    '/ingenieria//',
  ])('reconoce %s como la página de ingeniería', (ruta) => {
    expect(visitar(ruta).resultado).toEqual({
      estado: 303,
      destino: `/privado/?siguiente=${encodeURIComponent('/privado/ingenieria')}`,
    });
  });

  it('reescribe la dirección hacia el archivo de la página cuando hay permiso', () => {
    const { solicitud, continua } = visitar('/INGENIERIA/', ingeniero);
    expect(continua).toBe(true);
    expect(solicitud.url).toBe('/ingenieria.html');
  });

  it('responde 403 cuando el rol no tiene el permiso de la página', () => {
    expect(visitar('/ingenieria', analista).resultado).toEqual({ estado: 403, archivo: '/403.html' });
  });

  it.each([
    '/secreta',
    '/403',
    '/403.html',
    '/ingenier%C3%ADa',
    '/../.env',
    '/%2e%2e/.env',
    '/%E0%A4%A',
    '/css/../ingenieria.html',
    '/js/../../backend/server.js',
    '/js/x.json',
  ])('niega por defecto la ruta no declarada %s', (ruta) => {
    expect(visitar(ruta, ingeniero).resultado).toEqual({ estado: 404, archivo: '/404.html' });
  });
});
