import { describe, expect, it } from 'vitest';
import {
  ESTADO_DISPONIBLE,
  ESTADO_SIN_DATO,
  MOTIVO_SIN_DATO,
  calcularVariacion,
  describirProcedencia,
  ordenarSerie,
  resolverIndicador,
} from '../../../frontend/public/js/nucleo/indicadores.js';

const FUENTE_OFICIAL = {
  id: 'ungrd-balance',
  entidad: 'Unidad Nacional para la Gestión del Riesgo de Desastres',
  sigla: 'UNGRD',
  origen: 'OFICIAL',
  nivel: 'B',
  leidoEn: 'La FM',
};
const FUENTE_SIMULADA = { id: 'generador-andes', entidad: 'Proyecto ANDES', origen: 'SIMULADO', nivel: 'S' };
const fuentes = new Map([FUENTE_OFICIAL, FUENTE_SIMULADA].map((fuente) => [fuente.id, fuente]));

const base = {
  codigo: 'viviendas_destruidas',
  nombre: 'Viviendas destruidas',
  descripcion: '',
  unidad: 'viviendas',
};
const punto = (fechaCorte, valor) => ({ fechaCorte, valor, fuente: 'ungrd-balance' });

describe('ordenarSerie', () => {
  it('ordena por fecha de corte sin modificar la serie original', () => {
    const serie = [punto('2026-10-10', 3), punto('2026-08-15', 1)];
    expect(ordenarSerie(serie).map(({ valor }) => valor)).toEqual([1, 3]);
    expect(serie[0].valor).toBe(3);
  });
});

describe('calcularVariacion', () => {
  it('no calcula variación con menos de dos cortes', () => {
    expect(calcularVariacion([])).toBeNull();
    expect(calcularVariacion([punto('2026-10-10', 5)])).toBeNull();
  });

  it('compara los dos cortes más recientes aunque lleguen desordenados', () => {
    const variacion = calcularVariacion([punto('2026-10-10', 36478), punto('2026-08-15', 14705)]);
    expect(variacion.absoluta).toBe(21773);
    expect(variacion.relativa).toBeCloseTo(148.07, 1);
    expect(variacion.corteAnterior).toBe('2026-08-15');
  });

  it('informa una disminución con signo negativo', () => {
    expect(calcularVariacion([punto('2026-08-14', 294), punto('2026-08-15', 289)]).absoluta).toBe(-5);
  });

  it('deja la variación relativa sin valor cuando el corte anterior es cero', () => {
    expect(calcularVariacion([punto('2026-08-14', 0), punto('2026-08-15', 12)]).relativa).toBeNull();
  });
});

describe('resolverIndicador', () => {
  it('usa el corte más reciente y hereda el origen de su fuente', () => {
    const definicion = { ...base, serie: [punto('2026-08-15', 14705), punto('2026-10-10', 36478)] };
    const modelo = resolverIndicador(definicion, { fuentes });
    expect(modelo).toMatchObject({
      estado: ESTADO_DISPONIBLE,
      valor: 36478,
      fechaCorte: '2026-10-10',
      origen: 'OFICIAL',
      nivel: 'B',
    });
  });

  it('prefiere el dato oficial aunque exista uno simulado', () => {
    const definicion = { ...base, serie: [punto('2026-10-10', 36478)] };
    const simulados = { viviendas_destruidas: { valor: 1, muestra: 'Muestra' } };
    expect(resolverIndicador(definicion, { fuentes, simulados }).origen).toBe('OFICIAL');
  });

  it('declara que no hay dato cuando la serie está vacía y no hay simulado', () => {
    const modelo = resolverIndicador({ ...base, serie: [] }, { fuentes });
    expect(modelo.estado).toBe(ESTADO_SIN_DATO);
    expect(modelo.motivoSinDato).toBe(MOTIVO_SIN_DATO);
    expect(modelo).not.toHaveProperty('valor');
  });

  it('respeta el motivo específico del indicador', () => {
    const definicion = { ...base, serie: [], motivoSinDato: 'Fasecolda informa reclamaciones.' };
    expect(resolverIndicador(definicion, { fuentes }).motivoSinDato).toBe('Fasecolda informa reclamaciones.');
  });

  it('marca como simulado el valor de demostración', () => {
    const simulados = { viviendas_destruidas: { valor: 5419, muestra: 'Muestra simulada' } };
    const modelo = resolverIndicador({ ...base, serie: [] }, { fuentes, simulados });
    expect(modelo).toMatchObject({ origen: 'SIMULADO', nivel: 'S', valor: 5419, variacion: null });
  });

  it('rechaza una serie que apunta a una fuente inexistente', () => {
    const definicion = { ...base, serie: [{ fechaCorte: '2026-10-10', valor: 1, fuente: 'desconocida' }] };
    expect(() => resolverIndicador(definicion, { fuentes })).toThrow(/fuente desconocida/);
  });
});

describe('describirProcedencia', () => {
  it('indica el medio cuando la cifra se leyó en un tercero', () => {
    expect(describirProcedencia(FUENTE_OFICIAL)).toBe('UNGRD, leído en La FM');
  });

  it('usa el nombre de la entidad cuando no hay sigla ni tercero', () => {
    expect(describirProcedencia(FUENTE_SIMULADA)).toBe('Proyecto ANDES');
  });
});
