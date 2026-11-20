import { readFileSync } from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { EVENTO, crearEntornoDePrueba } from './apoyo.js';

const contrato = parse(
  readFileSync(path.resolve(import.meta.dirname, '..', '..', 'docs', 'openapi.yml'), 'utf8'),
);
const VALORES = Object.freeze({ evento: EVENTO, codigo: 'fallecidos', departamento: '27' });
const CONSULTAS = Object.freeze({ '/municipios': '?prefijo=san' });
const TIPOS = Object.freeze({
  string: (valor) => typeof valor === 'string',
  integer: (valor) => Number.isInteger(valor),
  number: (valor) => typeof valor === 'number',
  boolean: (valor) => typeof valor === 'boolean',
  array: (valor) => Array.isArray(valor),
  object: (valor) => valor !== null && typeof valor === 'object' && !Array.isArray(valor),
  null: (valor) => valor === null,
});

let entorno;

beforeAll(() => {
  entorno = crearEntornoDePrueba();
});

afterAll(async () => {
  await entorno?.cerrar();
});

function resolver(esquema) {
  if (!esquema?.$ref) {
    return esquema;
  }
  return resolver(
    esquema.$ref
      .replace(/^#\//, '')
      .split('/')
      .reduce((nodo, parte) => nodo[parte], contrato),
  );
}

function revisar(valor, esquema, ruta, problemas) {
  const definicion = resolver(esquema);
  if (!definicion || Object.keys(definicion).length === 0) {
    return problemas;
  }
  const tipos = [definicion.type ?? []].flat();
  if (tipos.length > 0 && !tipos.some((tipo) => TIPOS[tipo](valor))) {
    problemas.push(`${ruta}: se esperaba ${tipos.join(' o ')}`);
    return problemas;
  }
  if (definicion.enum && !definicion.enum.includes(valor)) {
    problemas.push(`${ruta}: ${JSON.stringify(valor)} no está en la lista`);
  }
  if (TIPOS.object(valor)) {
    for (const campo of definicion.required ?? []) {
      if (!(campo in valor)) {
        problemas.push(`${ruta}: falta ${campo}`);
      }
    }
    for (const [campo, subesquema] of Object.entries(definicion.properties ?? {})) {
      if (campo in valor) {
        revisar(valor[campo], subesquema, `${ruta}.${campo}`, problemas);
      }
    }
  }
  if (Array.isArray(valor) && definicion.items) {
    valor
      .slice(0, 25)
      .forEach((elemento, posicion) =>
        revisar(elemento, definicion.items, `${ruta}[${posicion}]`, problemas),
      );
  }
  return problemas;
}

const publicas = Object.entries(contrato.paths)
  .filter(([, definicion]) => definicion.get?.tags.includes('Públicas'))
  .map(([ruta, definicion]) => ({
    ruta,
    url: `/api/v1${ruta.replace(/\{([a-z]+)\}/g, (_, nombre) => VALORES[nombre])}${CONSULTAS[ruta] ?? ''}`,
    esquema: definicion.get.responses['200'].content['application/json'].schema,
  }));

describe('respuestas públicas frente al contrato', () => {
  it('cubre las catorce rutas públicas', () => {
    expect(publicas).toHaveLength(14);
  });

  it.each(publicas)('GET $ruta cumple el esquema documentado', async ({ url, esquema }) => {
    const respuesta = await request(entorno.aplicacion).get(url);
    expect(respuesta.status).toBe(200);
    expect(revisar(respuesta.body, esquema, 'respuesta', [])).toEqual([]);
  });

  it('no publica campos de datos personales en ninguna respuesta (RNF-06)', async () => {
    const PERSONALES =
      /documento|seudonimo|identificador|hmac|predio|apellido|telefono|direccion|correo|nacimiento/i;
    const claves = (valor, encontradas = new Set()) => {
      if (Array.isArray(valor)) {
        valor.forEach((elemento) => claves(elemento, encontradas));
      } else if (valor && typeof valor === 'object') {
        for (const [clave, contenido] of Object.entries(valor)) {
          encontradas.add(clave);
          claves(contenido, encontradas);
        }
      }
      return encontradas;
    };
    for (const { url } of publicas) {
      const { body } = await request(entorno.aplicacion).get(url);
      expect([url, [...claves(body)].filter((clave) => PERSONALES.test(clave))]).toEqual([url, []]);
    }
  });

  it('acompaña cada cifra oficial con su fuente, su fecha de corte y su origen (RNF-07)', async () => {
    const cliente = request(entorno.aplicacion);
    const { body: catalogo } = await cliente.get('/api/v1/fuentes');
    const fuentes = new Map(catalogo.fuentes.map((fuente) => [fuente.id, fuente]));
    const conProcedencia = ({ fuente, fechaCorte }) =>
      fuentes.has(fuente) && /^\d{4}-\d{2}-\d{2}$/.test(fechaCorte) && Boolean(fuentes.get(fuente).origen);
    const { body: indicadores } = await cliente.get(`/api/v1/eventos/${EVENTO}/indicadores`);
    const puntos = indicadores.indicadores.flatMap(({ serie }) => serie);
    expect(puntos.length).toBeGreaterThan(20);
    expect(puntos.filter((punto) => !conProcedencia(punto))).toEqual([]);
    const { body: economia } = await cliente.get(`/api/v1/eventos/${EVENTO}/economia`);
    const partidas = [...economia.costos, ...economia.recursos];
    expect(partidas.filter((partida) => !conProcedencia(partida))).toEqual([]);
    const { body: seguros } = await cliente.get(`/api/v1/eventos/${EVENTO}/seguros`);
    expect(conProcedencia(seguros.meta)).toBe(true);
    const { body: kpi } = await cliente.get(`/api/v1/eventos/${EVENTO}/kpi`);
    const partes = kpi.kpi
      .filter(({ origen, estado }) => origen === 'OFICIAL' && estado === 'disponible')
      .flatMap(({ numerador, denominador }) => [numerador, denominador]);
    expect(partes.filter((parte) => !conProcedencia(parte))).toEqual([]);
  });

  it('describe los errores como problemas', async () => {
    const respuesta = await request(entorno.aplicacion).get('/api/v1/eventos/no-existe/kpi');
    expect(respuesta.headers['content-type']).toMatch(/application\/problem\+json/);
    expect(revisar(respuesta.body, { $ref: '#/components/schemas/Problema' }, 'problema', [])).toEqual([]);
  });
});
