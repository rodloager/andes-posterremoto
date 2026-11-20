import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cargarContexto } from '../../../frontend/public/js/nucleo/contexto.js';
import { cargar, direccionDe } from '../../../frontend/public/js/nucleo/datos.js';
import {
  MODO_DEMOSTRACION,
  MODO_OFICIAL,
  esDemostracion,
  guardarModo,
  leerModo,
  normalizarModo,
} from '../../../frontend/public/js/nucleo/modo.js';

const RESPUESTAS = {
  '/api/v1/eventos/sismo-2026-08-10/indicadores': {
    indicadores: [
      {
        codigo: 'fallecidos',
        nombre: 'Fallecidos',
        unidad: 'personas',
        serie: [{ fechaCorte: '2026-10-10', valor: 335, fuente: 'ungrd' }],
      },
      { codigo: 'viviendas_aseguradas', nombre: 'Aseguradas', unidad: 'viviendas', serie: [] },
      { codigo: 'personas_desplazadas', nombre: 'Desplazadas', unidad: 'personas', serie: [] },
    ],
  },
  '/api/v1/fuentes': {
    fuentes: [
      { id: 'ungrd', sigla: 'UNGRD', origen: 'OFICIAL', nivel: 'B' },
      { id: 'generador-andes', sigla: 'ANDES', origen: 'SIMULADO', nivel: 'S' },
    ],
  },
  '/datos/simulado/indicadores.json': {
    indicadores: {
      viviendas_aseguradas: { valor: 6854, muestra: 'Muestra de archivo' },
      personas_desplazadas: { valor: 6113, muestra: 'Muestra de archivo' },
    },
  },
  '/api/v1/eventos/sismo-2026-08-10/registros/viviendas': {
    indicadores: { viviendas_aseguradas: { valor: 7136, muestra: 'Muestra simulada de 51.961 viviendas' } },
  },
};

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (direccion) => {
      const cuerpo = RESPUESTAS[direccion];
      return { ok: Boolean(cuerpo), status: cuerpo ? 200 : 404, json: async () => cuerpo };
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('modo de datos', () => {
  it('usa el modo oficial salvo que se elija la demostración', () => {
    expect(leerModo()).toBe(MODO_OFICIAL);
    guardarModo(MODO_DEMOSTRACION);
    expect([leerModo(), esDemostracion()]).toEqual([MODO_DEMOSTRACION, true]);
    guardarModo('cualquier-otro');
    expect(leerModo()).toBe(MODO_OFICIAL);
    expect(normalizarModo(undefined)).toBe(MODO_OFICIAL);
  });
});

describe('carga de datos', () => {
  it('lleva los recursos oficiales y de registros a la API y los demás a archivos', () => {
    expect(direccionDe('oficial/kpi')).toBe('/api/v1/eventos/sismo-2026-08-10/kpi');
    expect(direccionDe('simulado/poblacion')).toBe('/api/v1/eventos/sismo-2026-08-10/registros/poblacion');
    expect(direccionDe('simulado/salud')).toBe('/datos/simulado/salud.json');
  });

  it('pide cada recurso una sola vez y avisa cuando la respuesta falla', async () => {
    await Promise.all([cargar('oficial/fuentes'), cargar('oficial/fuentes')]);
    expect(fetch).toHaveBeenCalledTimes(1);
    await expect(cargar('geo/no-existe')).rejects.toThrow(/respuesta 404/);
  });
});

describe('contexto de la página', () => {
  it('en modo oficial no carga nada simulado', async () => {
    const contexto = await cargarContexto();
    expect(contexto.demostracion).toBe(false);
    expect(contexto.indicador('fallecidos')).toMatchObject({ estado: 'disponible', valor: 335 });
    expect(contexto.indicador('viviendas_aseguradas').estado).toBe('sin-dato');
    expect(await contexto.simulado('salud')).toBeNull();
    expect(() => contexto.indicador('no_existe')).toThrow(/desconocido/);
  });

  it('en demostración prefiere los registros de la base a los valores de archivo', async () => {
    guardarModo(MODO_DEMOSTRACION);
    const contexto = await cargarContexto();
    expect(contexto.indicador('viviendas_aseguradas')).toMatchObject({
      origen: 'SIMULADO',
      valor: 7136,
      muestra: 'Muestra simulada de 51.961 viviendas',
    });
    expect(contexto.indicador('personas_desplazadas').valor).toBe(6113);
    expect(contexto.fuente('ungrd').sigla).toBe('UNGRD');
  });
});
