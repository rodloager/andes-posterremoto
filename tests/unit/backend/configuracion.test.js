import { describe, expect, it } from 'vitest';
import { configuracionDeConexion } from '../../../backend/src/config/baseDeDatos.js';
import { leerEntorno } from '../../../backend/src/config/entorno.js';

const MINIMO = Object.freeze({
  BD_APP_CLAVE: 'clave-app',
  BD_LECTOR_CLAVE: 'clave-lector',
  SESION_SECRETO: 's'.repeat(32),
});

describe('lectura del entorno', () => {
  it('aplica los valores por defecto del desarrollo local', () => {
    const configuracion = leerEntorno(MINIMO);
    expect(configuracion).toMatchObject({
      entorno: 'development',
      produccion: false,
      pruebas: false,
      puerto: 3000,
      baseDeDatos: { host: '127.0.0.1', puerto: 5433, nombre: 'andes' },
      claves: { propietario: null, aplicacion: 'clave-app', lectura: 'clave-lector' },
      claveUsuariosDemo: null,
    });
  });

  it('convierte los puertos y reconoce producción', () => {
    const configuracion = leerEntorno({
      ...MINIMO,
      NODE_ENV: 'production',
      PUERTO: '8080',
      BD_PUERTO: '5432',
    });
    expect(configuracion).toMatchObject({ produccion: true, puerto: 8080, baseDeDatos: { puerto: 5432 } });
  });

  it('no confía en ningún proxy salvo que se indique cuántos hay delante', () => {
    expect(leerEntorno(MINIMO).proxiesDeConfianza).toBe(0);
    expect(leerEntorno({ ...MINIMO, PROXIES_DE_CONFIANZA: '1' }).proxiesDeConfianza).toBe(1);
    expect(() => leerEntorno({ ...MINIMO, PROXIES_DE_CONFIANZA: '6' })).toThrow(/PROXIES_DE_CONFIANZA/);
    expect(() => leerEntorno({ ...MINIMO, PROXIES_DE_CONFIANZA: 'todos' })).toThrow(/PROXIES_DE_CONFIANZA/);
  });

  it('entrega una configuración inmutable', () => {
    const configuracion = leerEntorno(MINIMO);
    expect(Object.isFrozen(configuracion)).toBe(true);
    expect(Object.isFrozen(configuracion.claves)).toBe(true);
    expect(() => {
      configuracion.baseDeDatos.nombre = 'otra';
    }).toThrow(TypeError);
  });

  it.each([
    ['un secreto de sesión corto', { SESION_SECRETO: 'corto' }, 'SESION_SECRETO'],
    ['la clave de la aplicación ausente', { BD_APP_CLAVE: undefined }, 'BD_APP_CLAVE'],
    [
      'un nombre de base de datos con caracteres peligrosos',
      { BD_NOMBRE: 'andes; DROP DATABASE andes' },
      'BD_NOMBRE',
    ],
    ['un puerto fuera de rango', { PUERTO: '70000' }, 'PUERTO'],
    ['un entorno desconocido', { NODE_ENV: 'staging' }, 'NODE_ENV'],
    ['una clave demo corta', { CLAVE_USUARIOS_DEMO: 'corta' }, 'CLAVE_USUARIOS_DEMO'],
  ])('rechaza %s y nombra la variable', (descripcion, cambios, variable) => {
    expect(() => leerEntorno({ ...MINIMO, ...cambios })).toThrow(variable);
  });

  it('no incluye los valores secretos en el mensaje de error', () => {
    const secreto = 'secreto-que-no-debe-aparecer';
    expect(() => leerEntorno({ ...MINIMO, SESION_SECRETO: secreto })).toThrow(
      expect.objectContaining({ message: expect.not.stringContaining(secreto) }),
    );
  });
});

describe('conexión a la base de datos', () => {
  it('usa la cuenta con el mínimo privilegio para cada uso', () => {
    const configuracion = leerEntorno(MINIMO);
    expect(configuracionDeConexion(configuracion, 'lectura')).toMatchObject({
      user: 'andes_lector',
      password: 'clave-lector',
      database: 'andes',
      port: 5433,
      application_name: 'andes-lectura',
    });
    expect(configuracionDeConexion(configuracion, 'aplicacion').user).toBe('andes_app');
  });

  it('exige la clave del propietario solo cuando se usa esa cuenta', () => {
    expect(() => configuracionDeConexion(leerEntorno(MINIMO), 'propietario')).toThrow(/andes_propietario/);
  });
});
