import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { normalizarTexto } from '../../backend/src/algorithms/texto.js';
import { EVENTO, crearEntornoDePrueba, esProblema, leerSemilla, sinNulos } from './apoyo.js';

let entorno;
let api;

beforeAll(() => {
  entorno = crearEntornoDePrueba();
  api = request(entorno.aplicacion);
});

afterAll(() => entorno.cerrar());

const deEvento = (ruta = '') => `/api/v1/eventos/${EVENTO}${ruta}`;

function normalizarIndicadores(indicadores) {
  return sinNulos(
    indicadores.map((indicador) => ({
      ...Object.fromEntries(Object.entries(indicador).filter(([clave]) => clave !== 'tendencia')),
      esDerivado: indicador.esDerivado === true,
    })),
  );
}

describe('estado y catálogo', () => {
  it('informa que el servicio y la base de datos están disponibles', async () => {
    const respuesta = await api.get('/api/v1/estado');
    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toEqual({ servicio: 'disponible', baseDeDatos: 'disponible' });
  });

  it('devuelve las fuentes tal como se cargaron, en el mismo orden', async () => {
    const respuesta = await api.get('/api/v1/fuentes');
    expect(respuesta.status).toBe(200);
    expect(sinNulos(respuesta.body.fuentes)).toEqual(sinNulos(leerSemilla('fuentes.json').fuentes));
    expect(Object.keys(respuesta.body.meta.niveles)).toEqual(['A', 'B', 'C', 'S']);
  });

  it('lista los eventos registrados', async () => {
    const respuesta = await api.get('/api/v1/eventos');
    expect(respuesta.body.eventos).toEqual([
      { codigo: EVENTO, nombre: 'Sismo del 10 de agosto de 2026', fecha: '2026-08-10' },
    ]);
  });

  it('reconstruye el evento con sus parámetros por fuente y sus normas', async () => {
    const { meta, ...evento } = leerSemilla('evento.json');
    const respuesta = await api.get(deEvento());
    expect(meta).toBeDefined();
    expect(respuesta.body).toEqual(evento);
  });
});

describe('indicadores', () => {
  it('devuelve el catálogo completo con cada serie por fecha de corte', async () => {
    const respuesta = await api.get(deEvento('/indicadores'));
    expect(respuesta.status).toBe(200);
    expect(normalizarIndicadores(respuesta.body.indicadores)).toEqual(
      normalizarIndicadores(leerSemilla('indicadores.json').indicadores),
    );
  });

  it('devuelve un indicador con su serie ordenada', async () => {
    const respuesta = await api.get(deEvento('/indicadores/viviendas_destruidas'));
    expect(respuesta.status).toBe(200);
    expect(respuesta.body.serie.map(({ fechaCorte, valor }) => [fechaCorte, valor])).toEqual([
      ['2026-08-15', 14705],
      ['2026-10-10', 36478],
    ]);
  });

  it('calcula la tendencia de cada serie con el algoritmo 6', async () => {
    const respuesta = await api.get(deEvento('/indicadores'));
    const porCodigo = new Map(respuesta.body.indicadores.map((indicador) => [indicador.codigo, indicador]));
    const destruidas = porCodigo.get('viviendas_destruidas').tendencia;
    expect(destruidas).toMatchObject({ clasificacion: 'CRECIENTE', fechas: 2, revisionesALaBaja: [] });
    expect(destruidas.cambioDiario).toBeCloseTo((36478 - 14705) / 56, 10);
    expect(porCodigo.get('heridos').tendencia).toEqual({
      clasificacion: 'INSUFICIENTE',
      cambioDiario: null,
      fechas: 1,
      revisionesALaBaja: [],
    });
    expect(porCodigo.get('viviendas_aseguradas').tendencia).toMatchObject({
      clasificacion: 'INSUFICIENTE',
      fechas: 0,
    });
  });

  it('declara una serie vacía cuando no hay cifra oficial', async () => {
    const respuesta = await api.get(deEvento('/indicadores/viviendas_aseguradas'));
    expect(respuesta.body.serie).toEqual([]);
    expect(respuesta.body.motivoSinDato).toMatch(/Fasecolda/);
  });

  it('responde 404 ante un indicador inexistente', async () => {
    esProblema(await api.get(deEvento('/indicadores/no_existe')), 404, 'NO_ENCONTRADO');
  });
});

describe('afectación por territorio', () => {
  it('reproduce la semilla: metadatos, totales, departamentos y municipios', async () => {
    const semilla = leerSemilla('territorio.json');
    const respuesta = await api.get(deEvento('/territorio'));
    expect(respuesta.status).toBe(200);
    expect(respuesta.body.meta).toEqual(semilla.meta);
    expect(respuesta.body.variables).toEqual(semilla.variables);
    expect(respuesta.body.nacional).toEqual(semilla.nacional);
    expect(respuesta.body.departamentos).toEqual(semilla.departamentos);
    expect(respuesta.body.municipios).toEqual(semilla.municipios);
  });

  it('filtra un departamento con sus municipios', async () => {
    const respuesta = await api.get(deEvento('/territorio/departamentos/66'));
    expect(respuesta.status).toBe(200);
    expect(respuesta.body.departamento).toMatchObject({ codigo: '66', nombre: 'Risaralda' });
    expect(respuesta.body.municipios).toHaveLength(respuesta.body.departamento.municipiosConReporte);
    expect(respuesta.body.municipios.every(({ departamento }) => departamento === '66')).toBe(true);
  });

  it('responde 404 cuando el departamento no tiene reportes', async () => {
    esProblema(await api.get(deEvento('/territorio/departamentos/88')), 404, 'NO_ENCONTRADO');
  });

  it('rechaza un código de departamento mal formado', async () => {
    const respuesta = await api.get(deEvento("/territorio/departamentos/05'--"));
    esProblema(respuesta, 400, 'VALIDACION');
    expect(respuesta.body.errores[0]).toMatchObject({ ubicacion: 'params', campo: 'departamento' });
  });
});

describe('seguros y economía', () => {
  it('devuelve las reclamaciones por departamento y por ramo', async () => {
    const respuesta = await api.get(deEvento('/seguros'));
    const semilla = leerSemilla('seguros.json');
    expect(respuesta.body.porDepartamento).toEqual(semilla.porDepartamento);
    expect(respuesta.body.porRamo).toEqual(semilla.porRamo);
    expect(respuesta.body.meta).toMatchObject({ fuente: 'fasecolda-reporte-4', fechaCorte: '2026-09-07' });
  });

  it('devuelve costos, recursos, destino del fondo y contratación', async () => {
    const respuesta = await api.get(deEvento('/economia'));
    const { meta, ...semilla } = leerSemilla('economia.json');
    expect(meta).toBeDefined();
    expect(sinNulos({ ...respuesta.body, meta: undefined })).toEqual(sinNulos(semilla));
  });
});

describe('búsqueda de municipios', () => {
  const buscar = (parametros) => api.get(`/api/v1/municipios?${new URLSearchParams(parametros)}`);

  it('sugiere municipios por prefijo sin importar tildes ni mayúsculas', async () => {
    const respuesta = await buscar({ prefijo: 'BOGO' });
    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toEqual({
      prefijo: 'BOGO',
      municipios: [
        { codigo: '11001', nombre: 'Bogotá, D. C.', departamento: { codigo: '11', nombre: 'Bogotá, D. C.' } },
      ],
    });
  });

  it('encuentra un municipio por una palabra interior de su nombre', async () => {
    const { body } = await buscar({ prefijo: 'palmar' });
    expect(body.municipios.map(({ codigo }) => codigo)).toContain('27660');
  });

  it('devuelve primero los nombres que empiezan por el prefijo, en orden alfabético', async () => {
    const { body } = await buscar({ prefijo: 'san', limite: 15 });
    const claves = body.municipios.map(({ nombre }) => normalizarTexto(nombre));
    expect(claves).toHaveLength(15);
    expect(claves.every((clave) => clave.startsWith('SAN'))).toBe(true);
    expect(claves).toEqual([...claves].sort());
  });

  it('no repite un municipio que coincide por varias palabras', async () => {
    const { body } = await buscar({ prefijo: 'san', limite: 20 });
    const codigos = body.municipios.map(({ codigo }) => codigo);
    expect(new Set(codigos).size).toBe(codigos.length);
  });

  it('responde una lista vacía cuando nada coincide', async () => {
    const { body } = await buscar({ prefijo: 'zzzz' });
    expect(body.municipios).toEqual([]);
  });

  it('valida el prefijo y el límite', async () => {
    esProblema(await api.get('/api/v1/municipios'), 400, 'VALIDACION');
    esProblema(await buscar({ prefijo: '   ' }), 400, 'VALIDACION');
    esProblema(await buscar({ prefijo: 'a', limite: 21 }), 400, 'VALIDACION');
    esProblema(await buscar({ prefijo: 'a'.repeat(61) }), 400, 'VALIDACION');
  });
});

describe('errores y cabeceras', () => {
  it('responde 404 en formato de problema ante un evento inexistente', async () => {
    const respuesta = await api.get('/api/v1/eventos/otro-sismo/territorio');
    esProblema(respuesta, 404, 'NO_ENCONTRADO');
    expect(respuesta.body.instance).toBe('/api/v1/eventos/otro-sismo/territorio');
  });

  it('responde 404 ante una ruta o una versión de la API que no existe', async () => {
    esProblema(await api.get('/api/v1/inexistente'), 404, 'NO_ENCONTRADO');
    esProblema(await api.get('/api/v2/fuentes'), 404, 'NO_ENCONTRADO');
  });

  it('pide revalidar las respuestas públicas en cada consulta', async () => {
    const respuesta = await api.get('/api/v1/fuentes');
    expect(respuesta.headers['cache-control']).toBe('no-cache');
    expect(respuesta.headers.etag).toBeDefined();
  });

  it('aplica la política de seguridad de contenido', async () => {
    const respuesta = await api.get('/api/v1/fuentes');
    expect(respuesta.headers['content-security-policy']).toMatch(/script-src 'self'/);
    expect(respuesta.headers['x-powered-by']).toBeUndefined();
  });
});
