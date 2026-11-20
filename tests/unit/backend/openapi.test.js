import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { LIMITES_POR_DEFECTO } from '../../../backend/src/middlewares/limites.js';
import { crearRutasAdministracion } from '../../../backend/src/routes/administracion.js';
import { crearRutasIngenieria } from '../../../backend/src/routes/ingenieria.js';
import { crearRutasPublicas } from '../../../backend/src/routes/publicas.js';
import { crearRutasSesion } from '../../../backend/src/routes/sesion.js';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const contrato = parse(readFileSync(path.join(raiz, 'docs', 'openapi.yml'), 'utf8'));
const METODOS = ['get', 'post', 'put', 'patch', 'delete'];
const controladorFalso = new Proxy({}, { get: () => () => {} });

function rutasDe(enrutador, prefijo) {
  return enrutador.stack
    .filter((capa) => capa.route)
    .flatMap(({ route }) =>
      Object.keys(route.methods).map((metodo) => {
        const ruta = `${prefijo}${route.path === '/' ? '' : route.path}`.replace(/:([a-zA-Z]+)/g, '{$1}');
        return `${metodo.toUpperCase()} ${ruta}`;
      }),
    );
}

const rutasDelServidor = [
  ...rutasDe(crearRutasPublicas(controladorFalso), ''),
  ...rutasDe(crearRutasSesion(controladorFalso, LIMITES_POR_DEFECTO.sesion), '/sesion'),
  ...rutasDe(crearRutasAdministracion(controladorFalso, { recibir: () => {} }), '/admin'),
  ...rutasDe(crearRutasIngenieria(controladorFalso), '/ingenieria'),
].sort();

const operaciones = Object.entries(contrato.paths).flatMap(([ruta, definicion]) =>
  METODOS.filter((metodo) => definicion[metodo]).map((metodo) => ({
    clave: `${metodo.toUpperCase()} ${ruta}`,
    ruta,
    operacion: definicion[metodo],
  })),
);

function resolver(referencia) {
  return referencia
    .replace(/^#\//, '')
    .split('/')
    .reduce((nodo, parte) => nodo?.[parte], contrato);
}

function referencias(nodo, encontradas = []) {
  if (Array.isArray(nodo)) {
    nodo.forEach((hijo) => referencias(hijo, encontradas));
  } else if (nodo && typeof nodo === 'object') {
    for (const [clave, valor] of Object.entries(nodo)) {
      if (clave === '$ref') {
        encontradas.push(valor);
      } else {
        referencias(valor, encontradas);
      }
    }
  }
  return encontradas;
}

const parametro = (definicion) => (definicion.$ref ? resolver(definicion.$ref) : definicion);

describe('contrato OpenAPI', () => {
  it('declara OpenAPI 3.1 con su información básica', () => {
    expect(contrato.openapi).toBe('3.1.0');
    expect(contrato.info.title).toBe('API de ANDES');
    expect(contrato.servers[0].url).toMatch(/\/api\/v1$/);
  });

  it('documenta exactamente las rutas que atiende el servidor', () => {
    expect(rutasDelServidor).toHaveLength(37);
    expect(operaciones.map(({ clave }) => clave).sort()).toEqual(rutasDelServidor);
  });

  it('no tiene referencias rotas', () => {
    const rotas = [...new Set(referencias(contrato))].filter((referencia) => !resolver(referencia));
    expect(rotas).toEqual([]);
  });

  it('declara cada parámetro de la ruta y un identificador de operación único', () => {
    const identificadores = operaciones.map(({ operacion }) => operacion.operationId);
    expect(new Set(identificadores).size).toBe(identificadores.length);
    for (const { ruta, operacion, clave } of operaciones) {
      const enLaRuta = [...ruta.matchAll(/\{([a-zA-Z]+)\}/g)].map(([, nombre]) => nombre).sort();
      const declarados = (operacion.parameters ?? [])
        .map(parametro)
        .filter(({ in: lugar }) => lugar === 'path')
        .map(({ name }) => name)
        .sort();
      expect([clave, declarados]).toEqual([clave, enLaRuta]);
    }
  });

  it('da a cada operación una respuesta exitosa y describe sus errores como problemas', () => {
    for (const { clave, operacion } of operaciones) {
      const codigos = Object.keys(operacion.responses);
      expect([clave, codigos.some((codigo) => /^2/.test(codigo))]).toEqual([clave, true]);
      for (const codigo of codigos.filter((valor) => /^4/.test(valor))) {
        const respuesta = parametro(operacion.responses[codigo]);
        expect(Object.keys(respuesta.content ?? {}), `${clave} ${codigo}`).toEqual([
          'application/problem+json',
        ]);
      }
    }
  });

  it('exige la cookie de sesión en las rutas privadas', () => {
    const privadas = operaciones.filter(({ ruta }) => /^\/(admin|ingenieria)\//.test(ruta));
    expect(privadas.length).toBeGreaterThan(15);
    for (const { clave, operacion } of privadas) {
      expect([clave, operacion.security]).toEqual([clave, [{ sesion: [] }]]);
      expect(Object.keys(operacion.responses), clave).toEqual(expect.arrayContaining(['401', '403']));
    }
  });
});
