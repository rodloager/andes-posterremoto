import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { INDICADORES_DE_VIVIENDAS_REGISTRADAS } from '../../../backend/src/services/registros.js';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const carpetaDatos = path.join(raiz, 'frontend', 'public', 'datos');
const carpetaOficiales = path.join(raiz, 'database', 'seeds', 'oficial');
const leer = (...partes) => JSON.parse(readFileSync(path.join(carpetaDatos, ...partes), 'utf8'));
const leerOficial = (archivo) => JSON.parse(readFileSync(path.join(carpetaOficiales, archivo), 'utf8'));

const { fuentes } = leerOficial('fuentes.json');
const { indicadores } = leerOficial('indicadores.json');
const territorio = leerOficial('territorio.json');
const economia = leerOficial('economia.json');
const seguros = leerOficial('seguros.json');
const evento = leerOficial('evento.json');
const simulados = leer('simulado', 'indicadores.json');
const limites = leer('geo', 'departamentos.json');

const idsDeFuentes = new Set(fuentes.map(({ id }) => id));
const FECHA_ISO = /^\d{4}-\d{2}-\d{2}$/;
const ORIGENES = ['OFICIAL', 'ESTIMADO', 'SIMULADO'];
const NIVELES = ['A', 'B', 'C', 'S'];
const SIN_SIMULACION = ['personas_desplazadas'];
const INFRAESTRUCTURA = [
  'centrosSalud',
  'centrosEducativos',
  'centrosComunitarios',
  'vias',
  'acueductos',
  'puentesVehiculares',
  'puentesPeatonales',
  'aeropuertos',
];

const indicador = (codigo) => indicadores.find((definicion) => definicion.codigo === codigo);
const valorEn = (codigo, fechaCorte) =>
  indicador(codigo).serie.find((punto) => punto.fechaCorte === fechaCorte).valor;
const sumarValores = (territorios, variable) =>
  territorios.reduce((total, { valores }) => total + (valores[variable] ?? 0), 0);

describe('catálogo de fuentes', () => {
  it('no repite identificadores', () => {
    expect(idsDeFuentes.size).toBe(fuentes.length);
  });

  it.each(fuentes)('describe por completo la fuente $id', (fuente) => {
    for (const campo of ['entidad', 'nombre', 'tipoAcceso', 'cobertura', 'variables', 'limitaciones']) {
      expect(fuente[campo], campo).toEqual(expect.any(String));
      expect(fuente[campo].length, campo).toBeGreaterThan(0);
    }
    expect(ORIGENES).toContain(fuente.origen);
    expect(NIVELES).toContain(fuente.nivel);
  });

  it('exige enlace y fecha de consulta a toda fuente que no sea simulada', () => {
    for (const fuente of fuentes.filter(({ origen }) => origen !== 'SIMULADO')) {
      expect(fuente.enlace, fuente.id).toMatch(/^https:\/\//);
      expect(fuente.fechaConsulta, fuente.id).toMatch(FECHA_ISO);
    }
  });

  it('reserva el nivel S para los datos simulados y el nivel C para los estimados', () => {
    for (const { id, origen, nivel } of fuentes) {
      expect(nivel === 'S', id).toBe(origen === 'SIMULADO');
      expect(nivel === 'C', id).toBe(origen === 'ESTIMADO');
    }
  });
});

describe('indicadores nacionales', () => {
  it('no repite códigos', () => {
    expect(new Set(indicadores.map(({ codigo }) => codigo)).size).toBe(indicadores.length);
  });

  it.each(indicadores)('publica $codigo con fuente, fecha de corte y valor', ({ serie, nombre, unidad }) => {
    expect(nombre).toEqual(expect.any(String));
    expect(unidad).toEqual(expect.any(String));
    for (const punto of serie) {
      expect(idsDeFuentes.has(punto.fuente), punto.fuente).toBe(true);
      expect(punto.fechaCorte).toMatch(FECHA_ISO);
      expect(Number.isFinite(punto.valor)).toBe(true);
      expect(punto.valor).toBeGreaterThanOrEqual(0);
    }
  });

  it('no usa fuentes simuladas en las series oficiales', () => {
    const simuladas = new Set(fuentes.filter(({ origen }) => origen === 'SIMULADO').map(({ id }) => id));
    for (const { codigo, serie } of indicadores) {
      expect(
        serie.some((punto) => simuladas.has(punto.fuente)),
        codigo,
      ).toBe(false);
    }
  });

  it('calcula las viviendas afectadas como destruidas más averiadas en cada corte', () => {
    for (const { fechaCorte, valor } of indicador('viviendas_afectadas').serie) {
      const suma = valorEn('viviendas_destruidas', fechaCorte) + valorEn('viviendas_averiadas', fechaCorte);
      expect(valor, fechaCorte).toBe(suma);
    }
  });

  it('toma del reporte municipal los indicadores de infraestructura', () => {
    const { nacional } = territorio;
    const suma = INFRAESTRUCTURA.reduce((total, variable) => total + nacional[variable], 0);
    expect(indicador('infraestructura_afectada').serie[0].valor).toBe(suma);
    expect(indicador('centros_salud_afectados').serie[0].valor).toBe(nacional.centrosSalud);
    expect(indicador('centros_educativos_afectados').serie[0].valor).toBe(nacional.centrosEducativos);
  });

  it('ofrece un valor simulado de archivo solo para los indicadores sin cifra oficial ni registros', () => {
    const desdeRegistros = new Set([...INDICADORES_DE_VIVIENDAS_REGISTRADAS, ...SIN_SIMULACION]);
    const sinCifra = indicadores
      .filter(({ serie, codigo }) => serie.length === 0 && !desdeRegistros.has(codigo))
      .map(({ codigo }) => codigo);
    expect(Object.keys(simulados.indicadores).sort()).toEqual(sinCifra.sort());
  });

  it('deja sin cifra oficial los indicadores que ahora salen de los registros', () => {
    for (const codigo of [...INDICADORES_DE_VIVIENDAS_REGISTRADAS, ...SIN_SIMULACION]) {
      expect(indicador(codigo).serie, codigo).toEqual([]);
    }
  });
});

describe('afectación por territorio', () => {
  it('suma lo mismo por municipio, por departamento y en el total nacional', () => {
    for (const { codigo } of territorio.variables) {
      const porMunicipio = sumarValores(territorio.municipios, codigo);
      expect(sumarValores(territorio.departamentos, codigo), codigo).toBe(porMunicipio);
      expect(territorio.nacional[codigo] ?? 0, codigo).toBe(porMunicipio);
    }
  });

  it('cuenta los municipios con reporte de cada departamento', () => {
    for (const { codigo, municipiosConReporte } of territorio.departamentos) {
      const municipios = territorio.municipios.filter(({ departamento }) => departamento === codigo);
      expect(municipios.length, codigo).toBe(municipiosConReporte);
    }
    expect(territorio.municipios.length).toBe(territorio.meta.municipiosConReporte);
  });

  it('deriva el departamento de los dos primeros dígitos del código del municipio', () => {
    for (const { codigo, departamento } of territorio.municipios) {
      expect(codigo).toMatch(/^\d{5}$/);
      expect(codigo.slice(0, 2)).toBe(departamento);
    }
  });

  it('ubica cada municipio con reporte en los límites del DANE', () => {
    const departamentos = new Set(limites.features.map(({ properties }) => properties.codigo));
    for (const { codigo } of territorio.departamentos) {
      expect(departamentos.has(codigo), codigo).toBe(true);
      const municipios = new Set(
        leer('geo', 'municipios', `${codigo}.json`).features.map(({ properties }) => properties.codigo),
      );
      const conReporte = territorio.municipios.filter(({ departamento }) => departamento === codigo);
      for (const municipio of conReporte) {
        expect(municipios.has(municipio.codigo), municipio.codigo).toBe(true);
      }
    }
  });

  it('registra fechas de reporte posteriores al sismo y anteriores a la consulta', () => {
    for (const { codigo, fechaReporte } of territorio.municipios) {
      if (fechaReporte !== null) {
        expect(fechaReporte >= evento.fecha, codigo).toBe(true);
        expect(fechaReporte <= territorio.meta.consultadoEn, codigo).toBe(true);
      }
    }
  });
});

describe('otros datos oficiales', () => {
  it('cita una fuente existente en cada partida económica', () => {
    const partidas = [
      ...economia.costos,
      ...economia.recursos,
      ...economia.contratacion,
      economia.destinoFondo,
    ];
    for (const { fuente } of partidas) {
      expect(idsDeFuentes.has(fuente), fuente).toBe(true);
    }
  });

  it('suma en los rubros del fondo el total que detalló el Gobierno', () => {
    const detallado = economia.destinoFondo.rubros.reduce((total, { valor }) => total + valor, 0);
    expect(detallado).toBe(economia.destinoFondo.total);
  });

  it('cita la fuente de seguros y de cada parámetro del sismo', () => {
    expect(idsDeFuentes.has(seguros.meta.fuente)).toBe(true);
    for (const { valores } of evento.parametros) {
      for (const { fuente } of valores) {
        expect(idsDeFuentes.has(fuente), fuente).toBe(true);
      }
    }
  });
});

describe('datos simulados', () => {
  const archivos = readdirSync(path.join(carpetaDatos, 'simulado'));

  it.each(archivos)('marca %s como simulado', (archivo) => {
    const { meta } = leer('simulado', archivo);
    expect(meta).toMatchObject({ origen: 'SIMULADO', nivel: 'S', fuente: 'generador-andes' });
    expect(meta.advertencia).toMatch(/No son cifras oficiales/);
  });
});
