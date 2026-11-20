import { describe, expect, it } from 'vitest';
import {
  ALERTA_FECHA_REPORTE_INVALIDA,
  ALERTA_PERSONAS_MENOR_QUE_FAMILIAS,
  acumularPorDepartamento,
  extraerFechaReporte,
  normalizarMunicipio,
  resumirPeriodo,
  tieneReporte,
  totalizar,
} from '../../../etl/transformadores/afectaciones.js';
import { aEntero, aTitulo } from '../../../etl/transformadores/texto.js';

const PERIODO = { desde: '2026-08-10', hasta: '2026-11-11' };

function fila(cambios = {}) {
  return {
    mpio_cdpmp: '17001',
    mpio_cnmbr: 'MANIZALES',
    dpto_ccdgo: '17',
    dpto_cnmbr: 'CALDAS',
    Familias: '4000',
    Personas: '8240',
    Fallecidos: 5,
    Heridos: '211',
    Viviendas: '10000',
    Viviendas_: '1500',
    Bitacora: 'Reporte EDAN CALDAS 13:30 horas 17/08/2026',
    ...cambios,
  };
}

describe('aEntero', () => {
  it('convierte texto numérico y conserva los enteros', () => {
    expect(aEntero('54810')).toBe(54810);
    expect(aEntero(' 42 ')).toBe(42);
    expect(aEntero(154)).toBe(154);
    expect(aEntero('0')).toBe(0);
  });

  it('devuelve vacío ante textos, nulos y números inválidos', () => {
    expect(aEntero(null)).toBeNull();
    expect(aEntero(undefined)).toBeNull();
    expect(aEntero('')).toBeNull();
    expect(aEntero('No Registra')).toBeNull();
    expect(aEntero('$    - 0')).toBeNull();
    expect(aEntero('12,5')).toBeNull();
    expect(aEntero(-3)).toBeNull();
    expect(aEntero(2.5)).toBeNull();
  });
});

describe('aTitulo', () => {
  it('pone mayúscula inicial y deja en minúscula las palabras de enlace', () => {
    expect(aTitulo('VALLE DEL CAUCA')).toBe('Valle del Cauca');
    expect(aTitulo('SAN JOSÉ DEL PALMAR')).toBe('San José del Palmar');
    expect(aTitulo('NORTE DE SANTANDER')).toBe('Norte de Santander');
  });

  it('conserva la mayúscula cuando la palabra de enlace va al inicio', () => {
    expect(aTitulo('LA DORADA')).toBe('La Dorada');
    expect(aTitulo('EL CARMEN DE VIBORAL')).toBe('El Carmen de Viboral');
  });

  it('escribe bien la abreviatura del distrito capital', () => {
    expect(aTitulo('BOGOTÁ, D.C.')).toBe('Bogotá, D. C.');
  });
});

describe('extraerFechaReporte', () => {
  it('lee la fecha escrita dentro de la bitácora', () => {
    expect(extraerFechaReporte('Enviado por Correo CITEL 16/08/2026  09:30 horas', PERIODO)).toEqual({
      fecha: '2026-08-16',
      esValida: true,
    });
  });

  it('no marca error cuando la bitácora no trae fecha', () => {
    expect(extraerFechaReporte('construccion de aulas', PERIODO)).toEqual({ fecha: null, esValida: true });
    expect(extraerFechaReporte(null, PERIODO)).toEqual({ fecha: null, esValida: true });
  });

  it('rechaza una fecha posterior a la consulta', () => {
    expect(extraerFechaReporte('Reporte EDAN CALDAS 13:30 horas 17/08/2027', PERIODO)).toEqual({
      fecha: null,
      esValida: false,
    });
  });

  it('rechaza una fecha anterior al sismo y una fecha que no existe', () => {
    expect(extraerFechaReporte('Reporte 01/08/2026', PERIODO).esValida).toBe(false);
    expect(extraerFechaReporte('Reporte 31/09/2026', PERIODO).esValida).toBe(false);
  });
});

describe('normalizarMunicipio', () => {
  it('convierte los campos de la fuente al modelo del proyecto', () => {
    expect(normalizarMunicipio(fila(), PERIODO)).toEqual({
      codigo: '17001',
      nombre: 'Manizales',
      departamento: '17',
      nombreDepartamento: 'Caldas',
      valores: {
        familias: 4000,
        personas: 8240,
        fallecidos: 5,
        heridos: 211,
        viviendasAveriadas: 10000,
        viviendasDestruidas: 1500,
      },
      fechaReporte: '2026-08-17',
      alertas: [],
    });
  });

  it('omite los campos vacíos en lugar de convertirlos en cero', () => {
    const municipio = normalizarMunicipio(fila({ Personas: null, Heridos: 'Null' }), PERIODO);
    expect(municipio.valores).not.toHaveProperty('personas');
    expect(municipio.valores).not.toHaveProperty('heridos');
  });

  it('alerta cuando hay menos personas que familias', () => {
    const municipio = normalizarMunicipio(fila({ Familias: '972', Personas: '3' }), PERIODO);
    expect(municipio.alertas).toEqual([ALERTA_PERSONAS_MENOR_QUE_FAMILIAS]);
    expect(municipio.valores.personas).toBe(3);
  });

  it('no alerta cuando falta el número de personas', () => {
    expect(normalizarMunicipio(fila({ Personas: null }), PERIODO).alertas).toEqual([]);
  });

  it('alerta cuando la bitácora trae una fecha imposible', () => {
    const municipio = normalizarMunicipio(fila({ Bitacora: 'Reporte 17/08/2027' }), PERIODO);
    expect(municipio.fechaReporte).toBeNull();
    expect(municipio.alertas).toEqual([ALERTA_FECHA_REPORTE_INVALIDA]);
  });
});

describe('tieneReporte', () => {
  it('distingue el municipio con cifras del que solo trae ceros o vacíos', () => {
    expect(tieneReporte({ valores: { heridos: 2 } })).toBe(true);
    expect(tieneReporte({ valores: { heridos: 0 } })).toBe(false);
    expect(tieneReporte({ valores: {} })).toBe(false);
  });
});

describe('acumularPorDepartamento', () => {
  const municipios = [
    {
      departamento: '66',
      nombreDepartamento: 'Risaralda',
      valores: { fallecidos: 97, heridos: 259 },
      fechaReporte: '2026-08-19',
    },
    { departamento: '66', nombreDepartamento: 'Risaralda', valores: { fallecidos: 10 }, fechaReporte: null },
    {
      departamento: '17',
      nombreDepartamento: 'Caldas',
      valores: { heridos: 211 },
      fechaReporte: '2026-08-17',
    },
  ];
  const departamentos = acumularPorDepartamento(municipios);

  it('suma los valores de los municipios de cada departamento', () => {
    expect(departamentos).toEqual([
      {
        codigo: '17',
        nombre: 'Caldas',
        municipiosConReporte: 1,
        valores: { heridos: 211 },
        ultimoReporte: '2026-08-17',
      },
      {
        codigo: '66',
        nombre: 'Risaralda',
        municipiosConReporte: 2,
        valores: { fallecidos: 107, heridos: 259 },
        ultimoReporte: '2026-08-19',
      },
    ]);
  });

  it('produce un total nacional igual a la suma de los municipios', () => {
    expect(totalizar(departamentos)).toEqual({ heridos: 470, fallecidos: 107 });
  });

  it('devuelve una lista vacía sin municipios', () => {
    expect(acumularPorDepartamento([])).toEqual([]);
    expect(totalizar([])).toEqual({});
  });

  it('resume el periodo con la primera y la última fecha válidas', () => {
    expect(resumirPeriodo(municipios)).toEqual({ desde: '2026-08-17', hasta: '2026-08-19' });
    expect(resumirPeriodo([{ fechaReporte: null }])).toBeNull();
  });
});
