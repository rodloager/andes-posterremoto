import { describe, expect, it } from 'vitest';
import {
  cargarMedidas,
  consultaDeMedidas,
  describirMedida,
  leerMedidas,
  revisarMedidas,
} from '../../../analytics/powerbi/medidas.js';
import { leerKpi } from '../../../backend/src/config/kpi.js';

const medida = (nombre, expresion) => `${nombre} =\n${expresion}`;
const archivo = (...bloques) => `${bloques.join('\n\n')}\n`;

describe('lectura del archivo de medidas', () => {
  it('separa cada medida por una línea en blanco', () => {
    const medidas = leerMedidas(
      archivo(medida('Total', 'SUM ( hecho[valor] )'), medida('Doble', '[Total] * 2')),
    );
    expect(medidas).toEqual([
      { nombre: 'Total', expresion: 'SUM ( hecho[valor] )' },
      { nombre: 'Doble', expresion: '[Total] * 2' },
    ]);
  });

  it('rechaza un bloque sin el encabezado de la medida', () => {
    expect(() => leerMedidas('SUM ( hecho[valor] )\notra línea')).toThrow(/Nombre de la medida/);
  });

  it('distingue columnas, medidas, columnas locales y filtros de texto', () => {
    const descripcion = describirMedida({
      expresion: [
        'VAR Tabla = ADDCOLUMNS ( VALUES ( dim_geografia[codigo_municipio] ), "@Valor", [Total] )',
        'RETURN CALCULATE ( SUMX ( Tabla, [@Valor] ), dim_vivienda[estado_fisico] = "DESTRUCCION_TOTAL",',
        '  dim_aseguramiento[reclamacion] IN { "APROBADA", "PAGADA" } )',
      ].join('\n'),
    });
    expect(descripcion.tablas).toEqual(['dim_geografia', 'dim_vivienda', 'dim_aseguramiento']);
    expect(descripcion.medidas).toEqual(['Total']);
    expect(descripcion.filtros).toEqual([
      { tabla: 'dim_vivienda', columna: 'estado_fisico', valores: ['DESTRUCCION_TOTAL'] },
      { tabla: 'dim_aseguramiento', columna: 'reclamacion', valores: ['APROBADA', 'PAGADA'] },
    ]);
  });
});

describe('revisión de las medidas', () => {
  it.each([
    ['un nombre repetido', [medida('A', '1'), medida('A', '2')], /repetida/],
    ['una medida inexistente', [medida('A', '[B] + 1')], /no está definida/],
    ['una dependencia circular', [medida('A', '[B]'), medida('B', '[A]')], /circular/],
    ['un paréntesis sin cerrar', [medida('A', 'SUM ( hecho[valor]')], /sin cerrar/],
  ])('detecta %s', (_, bloques, mensaje) => {
    expect(revisarMedidas(leerMedidas(archivo(...bloques))).join('\n')).toMatch(mensaje);
  });

  it('ignora los paréntesis dentro de un texto', () => {
    expect(revisarMedidas(leerMedidas(archivo(medida('A', 'IF ( 1 = 1, "a (b" )'))))).toEqual([]);
  });
});

describe('medidas del modelo', () => {
  it('no tienen problemas y cubren cada indicador clave con su mismo nombre', async () => {
    const medidas = await cargarMedidas();
    expect(revisarMedidas(medidas)).toEqual([]);
    const nombres = new Set(medidas.map(({ nombre }) => nombre.toLocaleLowerCase('es')));
    const { kpi } = await leerKpi();
    expect(kpi.filter(({ nombre }) => !nombres.has(nombre.toLocaleLowerCase('es')))).toEqual([]);
  });

  it('arma una consulta DAX que define todas las medidas sobre la tabla Medidas', async () => {
    const medidas = await cargarMedidas();
    const consulta = consultaDeMedidas(medidas);
    expect(consulta.startsWith('DEFINE\n')).toBe(true);
    expect(consulta.match(/^ {4}MEASURE 'Medidas'\[/gm)).toHaveLength(medidas.length);
    expect(consulta).toMatch(/\nEVALUATE\n {4}ROW \(\n/);
    expect(
      revisarMedidas([{ nombre: 'Consulta', expresion: consulta.replaceAll("'Medidas'", 'medidas') }]),
    ).toEqual(expect.not.arrayContaining([expect.stringMatching(/sin cerrar/)]));
  });
});
