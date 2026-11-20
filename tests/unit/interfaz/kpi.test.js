import { describe, expect, it } from 'vitest';
import { crearIndicadorClave, rejillaDeKpi } from '../../../frontend/public/js/componentes/kpi.js';

const OFICIAL = Object.freeze({
  codigo: 'avance',
  nombre: 'Avance de la reconstrucción de vivienda',
  descripcion: 'Reconstruidas sobre destruidas.',
  unidad: 'porcentaje',
  sentido: 'mayor_es_mejor',
  origen: 'OFICIAL',
  estado: 'disponible',
  valor: 12.884,
  calificador: 'más de',
  numerador: {
    tipo: 'indicador',
    valor: 4700,
    unidad: 'viviendas',
    calificador: 'más de',
    fuente: 'minvivienda',
    fechaCorte: '2026-10-23',
  },
  denominador: {
    tipo: 'indicador',
    valor: 36478,
    unidad: 'viviendas',
    calificador: null,
    fuente: 'ungrd',
    fechaCorte: '2026-10-10',
  },
  variacion: { absoluta: 2.5, corteAnterior: '2026-08-15', valoracion: 'mejora' },
});

const fuentes = {
  minvivienda: {
    sigla: 'MinVivienda',
    entidad: 'Ministerio de Vivienda',
    enlace: 'https://minvivienda.gov.co',
  },
  ungrd: { sigla: 'UNGRD', entidad: 'Unidad Nacional para la Gestión del Riesgo de Desastres' },
};
const texto = (elemento) => elemento.textContent.replace(/\s+/g, ' ').trim();

describe('tarjeta de indicador clave', () => {
  it('muestra el cociente, sus partes, la variación valorada y las fuentes', () => {
    const tarjeta = crearIndicadorClave(OFICIAL, { buscarFuente: (id) => fuentes[id] });
    expect(tarjeta.querySelector('.sello').textContent).toBe('Cálculo con cifras oficiales');
    expect(tarjeta.querySelector('.indicador-valor').textContent).toBe('más de 12,9 %');
    expect(tarjeta.querySelector('.kpi-componentes').textContent).toBe(
      'más de 4.700 viviendas sobre 36.478 viviendas',
    );
    expect(tarjeta.querySelector('.kpi-valoracion--mejora').textContent).toBe('Mejora');
    expect(texto(tarjeta.querySelector('.indicador-pie'))).toBe(
      'Calculado por ANDES con cifras de MinVivienda, corte del 23/10/2026 y UNGRD, corte del 10/10/2026.',
    );
    expect(tarjeta.querySelector('.indicador-pie a').getAttribute('href')).toBe('https://minvivienda.gov.co');
  });

  it('marca los simulados y no les inventa una fuente oficial', () => {
    const tarjeta = crearIndicadorClave({
      ...OFICIAL,
      origen: 'SIMULADO',
      calificador: null,
      variacion: null,
    });
    expect(tarjeta.querySelector('.indicador--simulado')).not.toBeNull();
    expect(tarjeta.querySelector('.sello').textContent).toBe('Simulado');
    expect(tarjeta.querySelector('.indicador-pie').textContent).toMatch(/No es una cifra oficial/);
    expect(tarjeta.querySelector('.indicador-variacion')).toBeNull();
  });

  it('explica por qué no hay dato', () => {
    const tarjeta = crearIndicadorClave({
      ...OFICIAL,
      estado: 'sin-dato',
      motivoSinDato: 'Alguna de las cifras necesarias reúne menos de 10 registros y no se publica.',
    });
    expect(tarjeta.querySelector('.indicador--sin-dato')).not.toBeNull();
    expect(tarjeta.querySelector('.indicador-valor').textContent).toBe('Información no disponible');
    expect(tarjeta.textContent).toMatch(/menos de 10 registros/);
    expect(tarjeta.querySelector('.sello').textContent).toBe('Sin dato');
  });

  it('arma una rejilla con una tarjeta por indicador', () => {
    const rejilla = rejillaDeKpi([
      OFICIAL,
      { ...OFICIAL, codigo: 'otro', unidad: 'por_cien_mil', calificador: null },
    ]);
    expect(rejilla.querySelectorAll('andes-kpi')).toHaveLength(2);
    expect(rejilla.querySelectorAll('.indicador-unidad')[0].textContent).toBe('por cada 100 mil');
  });
});
