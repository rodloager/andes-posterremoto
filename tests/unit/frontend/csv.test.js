import { describe, expect, it } from 'vitest';
import { aCsv, indicadoresEnCsv, territorioEnCsv } from '../../../frontend/public/js/nucleo/csv.js';

const lineas = (texto) =>
  texto
    .replace(/^\uFEFF/, '')
    .split('\r\n')
    .slice(0, -1);

describe('archivos CSV de descarga', () => {
  it('empieza con la marca de orden de bytes y termina cada línea con CRLF', () => {
    const texto = aCsv(['a', 'b'], [[1, 2]]);
    expect(texto.startsWith('\uFEFF')).toBe(true);
    expect(texto.endsWith('\r\n')).toBe(true);
    expect(lineas(texto)).toEqual(['a,b', '1,2']);
  });

  it('entrecomilla las comas, las comillas y los saltos de línea, y deja vacíos los nulos', () => {
    expect(lineas(aCsv(['texto'], [['Bogotá, D. C.'], ['dice "hola"'], ['dos\nlíneas'], [null]]))).toEqual([
      'texto',
      '"Bogotá, D. C."',
      '"dice ""hola"""',
      '"dos\nlíneas"',
      '',
    ]);
  });

  it('aplana el territorio en una fila por municipio y una columna por variable', () => {
    const texto = territorioEnCsv({
      variables: [{ codigo: 'personas' }, { codigo: 'vias' }],
      municipios: [
        {
          codigo: '27660',
          nombre: 'San José del Palmar',
          departamento: '27',
          fechaReporte: '2026-08-12',
          alertas: ['PERSONAS_MENOR_QUE_FAMILIAS'],
          valores: { personas: 1200 },
        },
      ],
    });
    expect(lineas(texto)).toEqual([
      'codigo_municipio,municipio,codigo_departamento,fecha_reporte,alertas,personas,vias',
      '27660,San José del Palmar,27,2026-08-12,PERSONAS_MENOR_QUE_FAMILIAS,1200,',
    ]);
  });

  it('pone una fila por indicador y fecha de corte, y omite los indicadores sin cifra', () => {
    const texto = indicadoresEnCsv({
      indicadores: [
        {
          codigo: 'viviendas_reconstruidas',
          nombre: 'Viviendas reconstruidas',
          unidad: 'viviendas',
          serie: [{ fechaCorte: '2026-10-23', valor: 4700, calificador: 'más de', fuente: 'minvivienda' }],
        },
        { codigo: 'personas_desplazadas', nombre: 'Personas desplazadas', unidad: 'personas', serie: [] },
      ],
    });
    expect(lineas(texto)).toEqual([
      'codigo,indicador,unidad,fecha_corte,valor,calificador,fuente',
      'viviendas_reconstruidas,Viviendas reconstruidas,viviendas,2026-10-23,4700,más de,minvivienda',
    ]);
  });
});
