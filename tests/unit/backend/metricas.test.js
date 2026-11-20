import express, { Router } from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { crearManejadorDeErrores } from '../../../backend/src/middlewares/errores.js';
import { medirSolicitudes } from '../../../backend/src/middlewares/metricas.js';
import { crearMetricas, percentil } from '../../../backend/src/services/metricas.js';
import { Anillo } from '../../../backend/src/utils/anillo.js';

describe('percentil', () => {
  it('usa el método del rango más cercano', () => {
    const valores = Array.from({ length: 20 }, (_, indice) => indice + 1);
    expect(percentil(valores, 0.95)).toBe(19);
    expect(percentil(valores, 0.5)).toBe(10);
    expect(percentil(valores, 1)).toBe(20);
    expect(percentil(valores, 0)).toBe(1);
  });

  it('no depende del orden de entrada ni lo altera', () => {
    const valores = [9, 1, 5, 3, 7];
    expect(percentil(valores, 0.6)).toBe(5);
    expect(valores).toEqual([9, 1, 5, 3, 7]);
  });

  it('devuelve null sin datos', () => {
    expect(percentil([], 0.95)).toBeNull();
  });
});

describe('anillo de capacidad fija', () => {
  it('conserva los últimos valores en orden de llegada', () => {
    const anillo = new Anillo(3);
    [1, 2].forEach((valor) => anillo.agregar(valor));
    expect(anillo.valores()).toEqual([1, 2]);
    [3, 4, 5].forEach((valor) => anillo.agregar(valor));
    expect(anillo.valores()).toEqual([3, 4, 5]);
  });

  it('empieza vacío', () => {
    expect(new Anillo(4).valores()).toEqual([]);
  });
});

describe('colector de métricas', () => {
  let metricas;

  afterEach(() => metricas?.detener());

  it('acumula solicitudes, errores internos, promedio y p95 por ruta', () => {
    metricas = crearMetricas();
    [10, 20, 30].forEach((duracionMs) =>
      metricas.registrarSolicitud({ ruta: 'GET /a', estado: 200, duracionMs }),
    );
    metricas.registrarSolicitud({ ruta: 'GET /b', estado: 503, duracionMs: 100 });
    metricas.registrarSolicitud({ ruta: 'GET /b', estado: 404, duracionMs: 50 });
    const resumen = metricas.resumen();
    expect(resumen).toMatchObject({ solicitudes: 5, errores: 1, promedioMs: 42, p95Ms: 100 });
    expect(resumen.masFrecuentes).toEqual([
      { ruta: 'GET /a', solicitudes: 3, errores: 0, promedioMs: 20, p95Ms: 30 },
      { ruta: 'GET /b', solicitudes: 2, errores: 1, promedioMs: 75, p95Ms: 100 },
    ]);
  });

  it('limita la lista de rutas frecuentes a diez', () => {
    metricas = crearMetricas();
    for (let indice = 0; indice < 15; indice += 1) {
      for (let vez = 0; vez <= indice; vez += 1) {
        metricas.registrarSolicitud({ ruta: `GET /r${indice}`, estado: 200, duracionMs: 1 });
      }
    }
    const { masFrecuentes } = metricas.resumen();
    expect(masFrecuentes.map(({ ruta }) => ruta)).toEqual(
      Array.from({ length: 10 }, (_, indice) => `GET /r${14 - indice}`),
    );
  });

  it('usa una ventana fija de duraciones por ruta', () => {
    metricas = crearMetricas({ capacidadDuraciones: 2 });
    [1000, 1, 2].forEach((duracionMs) =>
      metricas.registrarSolicitud({ ruta: 'GET /a', estado: 200, duracionMs }),
    );
    expect(metricas.resumen().masFrecuentes[0]).toMatchObject({ solicitudes: 3, p95Ms: 2 });
  });

  it('guarda los errores recientes del más nuevo al más antiguo', () => {
    metricas = crearMetricas();
    metricas.registrarError({ ruta: 'GET /a', estado: 500, mensaje: 'uno' });
    metricas.registrarError({ ruta: 'GET /b', estado: 503, mensaje: 'dos' });
    expect(metricas.erroresRecientes().map(({ mensaje }) => mensaje)).toEqual(['dos', 'uno']);
    expect(metricas.erroresRecientes()[0].fecha).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('mide el retraso del ciclo de eventos sin contar el intervalo de muestreo', async () => {
    metricas = crearMetricas();
    expect(metricas.retardoCicloEventos()).toEqual({ promedioMs: null, p99Ms: null });
    await new Promise((resolver) => setTimeout(resolver, 120));
    const { promedioMs, p99Ms } = metricas.retardoCicloEventos();
    expect(promedioMs).toBeGreaterThanOrEqual(0);
    expect(p99Ms).toBeGreaterThanOrEqual(promedioMs);
  });

  it('informa vacío cuando aún no hay solicitudes', () => {
    metricas = crearMetricas();
    expect(metricas.resumen()).toEqual({
      solicitudes: 0,
      errores: 0,
      promedioMs: null,
      p95Ms: null,
      masFrecuentes: [],
    });
  });
});

describe('patrones de ruta en las métricas', () => {
  function aplicacionDePrueba() {
    const registradas = [];
    const colector = { registrarSolicitud: (registro) => registradas.push(registro) };
    const recursos = Router();
    recursos.get('/elementos/:id', (solicitud, respuesta) => respuesta.json({ id: solicitud.params.id }));
    recursos.get('/falla/:id', () => {
      throw new Error('falla');
    });
    const privado = Router();
    privado.get('/', (solicitud, respuesta) => respuesta.json({}));
    const api = Router();
    api.use(
      '/privado',
      (solicitud, respuesta, siguiente) => {
        if (solicitud.get('authorization')) {
          siguiente();
          return;
        }
        respuesta.status(401).end();
      },
      privado,
    );
    api.use(recursos);
    const aplicacion = express();
    aplicacion.use('/api', medirSolicitudes(colector));
    aplicacion.use('/api/v1', api);
    aplicacion.use((solicitud, respuesta) => respuesta.status(404).end());
    aplicacion.use(crearManejadorDeErrores({ registro: { error: () => {} } }));
    return { aplicacion, registradas };
  }

  it.each([
    ['/api/v1/elementos/42', 200, 'GET /api/v1/elementos/:id'],
    ['/api/v1/falla/7', 500, 'GET /api/v1/falla/:id'],
    ['/api/v1/privado', 401, 'GET /api/v1/privado/*'],
    ['/api/v1/no-existe', 404, 'GET /api/v1/*'],
    ['/api/v2/elementos/1', 404, 'GET /api/*'],
  ])('registra %s con estado %i como %s', async (ruta, estado, patron) => {
    const { aplicacion, registradas } = aplicacionDePrueba();
    const respuesta = await request(aplicacion).get(ruta);
    expect(respuesta.status).toBe(estado);
    expect(registradas).toEqual([{ ruta: patron, estado, duracionMs: expect.any(Number) }]);
  });

  it('usa la ruta del enrutador cuando el patrón es la raíz', async () => {
    const { aplicacion, registradas } = aplicacionDePrueba();
    await request(aplicacion).get('/api/v1/privado').set('Authorization', 'x');
    expect(registradas[0].ruta).toBe('GET /api/v1/privado');
  });

  it('no deja crecer el número de rutas con direcciones arbitrarias', async () => {
    const { aplicacion, registradas } = aplicacionDePrueba();
    for (const ruta of ['/api/v1/a', '/api/v1/b/c', '/api/v1/elementos/1/x', '/api/v1/%00']) {
      await request(aplicacion).get(ruta);
    }
    expect(new Set(registradas.map(({ ruta }) => ruta))).toEqual(new Set(['GET /api/v1/*']));
  });

  it('no altera los valores que Express expone a los manejadores', async () => {
    const { aplicacion } = aplicacionDePrueba();
    const respuesta = await request(aplicacion).get('/api/v1/elementos/abc');
    expect(respuesta.body).toEqual({ id: 'abc' });
  });
});
