import { describe, expect, it, vi } from 'vitest';
import { AVISO_PRIORIZACION } from '../../../backend/src/algorithms/priorizacion.js';
import { crearServicioEstadisticas } from '../../../backend/src/services/estadisticas.js';
import { nombreSeguro } from '../../../backend/src/services/cargas.js';

const EVENTO = 'sismo-2026-08-10';
const NACIONAL = { evento: EVENTO, territorio: '00', origen: 'SIMULADO' };

const ZONAS = [
  { codigo: '05001', nombre: 'Medellín', departamento_codigo: '05', departamento: 'Antioquia' },
  { codigo: '17001', nombre: 'Manizales', departamento_codigo: '17', departamento: 'Caldas' },
  { codigo: '27660', nombre: 'San José del Palmar', departamento_codigo: '27', departamento: 'Chocó' },
];

function crearRepositorio({ agregados = [], valores = [], municipales = {} } = {}) {
  return {
    evento: async (codigo) => (codigo === EVENTO ? { id: 1, codigo, nombre: 'Sismo' } : null),
    departamento: async (codigo) => (codigo === '17' ? { codigo, nombre: 'Caldas' } : null),
    municipio: async (codigo) =>
      codigo === '17001'
        ? { codigo, nombre: 'Manizales', departamento_codigo: '17', departamento: 'Caldas' }
        : null,
    agregados: vi.fn(async () => agregados),
    zonasConReporte: async () => ZONAS,
    valoresTerritoriales: async (evento, variables) =>
      valores.filter(({ variable_codigo: variable }) => variables.includes(variable)),
    agregadosMunicipales: async ({ dimension, categoria }) => municipales[`${dimension}|${categoria}`] ?? [],
  };
}

const celda = (
  dimension,
  categoria,
  cantidad,
  suma = 0,
  actualizadoEn = new Date('2026-11-01T00:00:00Z'),
) => ({
  dimension,
  categoria,
  cantidad,
  suma,
  actualizado_en: actualizadoEn,
});

const criterio = (codigo, peso, fuente, extras = {}) => ({
  codigo,
  nombre: codigo,
  descripcion: codigo,
  peso,
  mas_es_mejor: false,
  ...(fuente ? { fuente } : {}),
  ...extras,
});

const territorial = (...variables) => ({ tipo: 'variable_territorial', origen: 'OFICIAL', variables });
const agregado = (dimension, categoria) => ({
  tipo: 'agregado',
  origen: 'SIMULADO',
  destino: 'personas',
  dimension,
  categoria,
});

describe('estadísticas de población', () => {
  const agregados = [
    celda('total', 'TOTAL', 10, 300),
    celda('grupo_edad', 'DE_60_O_MAS', 2),
    celda('grupo_edad', 'DE_0_A_9', 3),
    celda('grupo_edad', 'DE_18_A_59', 5),
    celda('sexo', 'M', 4),
    celda('sexo', 'F', 6),
    celda('vulnerabilidad', 'ADULTO_MAYOR', 2),
    celda('vulnerabilidad', 'POBLACION_INFANTIL', 3),
    celda('vulnerabilidad', 'DISCAPACIDAD', 3),
    celda('quinquenio_sexo', '05_09|M', 1),
    celda('quinquenio_sexo', '00_04|M', 1),
    celda('quinquenio_sexo', '00_04|F', 1),
    celda('semana', '2026-08-24', 2, 0, new Date('2026-11-05T00:00:00Z')),
    celda('semana', '2026-08-10', 5),
    celda('semana', '2026-08-17', 3),
  ];
  const servicio = crearServicioEstadisticas(crearRepositorio({ agregados }));

  it('ordena cada distribución y calcula sus proporciones sin inventar categorías', async () => {
    const poblacion = await servicio.poblacion(NACIONAL);
    expect(poblacion.total).toBe(10);
    expect(poblacion.edadPromedio).toBe(30);
    expect(poblacion.distribuciones.grupoEdad).toEqual([
      { categoria: 'DE_0_A_9', cantidad: 3, proporcion: 0.3 },
      { categoria: 'DE_18_A_59', cantidad: 5, proporcion: 0.5 },
      { categoria: 'DE_60_O_MAS', cantidad: 2, proporcion: 0.2 },
    ]);
    expect(poblacion.distribuciones.sexo.map(({ categoria }) => categoria)).toEqual(['F', 'M']);
    expect(poblacion.distribuciones.vulnerabilidad.map(({ categoria }) => categoria)).toEqual([
      'DISCAPACIDAD',
      'POBLACION_INFANTIL',
      'ADULTO_MAYOR',
    ]);
    expect(poblacion.distribuciones.tenencia).toEqual([]);
    expect(poblacion.piramide).toEqual([
      { quinquenio: '00_04', sexo: 'F', cantidad: 1 },
      { quinquenio: '00_04', sexo: 'M', cantidad: 1 },
      { quinquenio: '05_09', sexo: 'M', cantidad: 1 },
    ]);
  });

  it('ordena la serie semanal y le aplica el análisis de tendencia', async () => {
    const { registrosPorSemana } = await servicio.poblacion(NACIONAL);
    expect(registrosPorSemana.serie).toEqual([
      { fecha: '2026-08-10', valor: 5 },
      { fecha: '2026-08-17', valor: 3 },
      { fecha: '2026-08-24', valor: 2 },
    ]);
    expect(registrosPorSemana.tendencia).toBe('DECRECIENTE');
    expect(registrosPorSemana.cambioPorSemana).toBeCloseTo(-1.5, 12);
  });

  it('describe el territorio, el origen y la última actualización', async () => {
    const { meta } = await servicio.poblacion(NACIONAL);
    expect(meta).toMatchObject({
      evento: EVENTO,
      origen: 'SIMULADO',
      territorio: { codigo: '00', nivel: 'NACIONAL', nombre: 'Colombia' },
      actualizadoEn: new Date('2026-11-05T00:00:00Z'),
    });
    expect(meta.aviso).toMatch(/simulados/);
    const oficial = await servicio.poblacion({ ...NACIONAL, origen: 'OFICIAL' });
    expect(oficial.meta.aviso).toBeNull();
  });

  it('consulta el nivel que corresponde a la longitud del código', async () => {
    const repositorio = crearRepositorio({ agregados });
    const conRepositorio = crearServicioEstadisticas(repositorio);
    await conRepositorio.poblacion({ ...NACIONAL, territorio: '17' });
    await conRepositorio.poblacion({ ...NACIONAL, territorio: '17001' });
    expect(repositorio.agregados.mock.calls.map(([{ nivel, territorio }]) => [nivel, territorio])).toEqual([
      ['DEPARTAMENTO', '17'],
      ['MUNICIPIO', '17001'],
    ]);
    const municipal = await conRepositorio.poblacion({ ...NACIONAL, territorio: '17001' });
    expect(municipal.meta.territorio).toEqual({
      codigo: '17001',
      nivel: 'MUNICIPIO',
      nombre: 'Manizales',
      departamento: { codigo: '17', nombre: 'Caldas' },
    });
  });

  it.each([
    ['un evento', { ...NACIONAL, evento: 'otro' }, /evento otro/],
    ['un departamento', { ...NACIONAL, territorio: '99' }, /departamento 99/],
    ['un municipio', { ...NACIONAL, territorio: '99999' }, /municipio 99999/],
  ])('responde 404 ante %s inexistente', async (descripcion, filtros, mensaje) => {
    await expect(servicio.poblacion(filtros)).rejects.toMatchObject({
      estado: 404,
      message: expect.stringMatching(mensaje),
    });
  });

  it('sin registros responde vacío, con promedio nulo y tendencia insuficiente', async () => {
    const vacio = await crearServicioEstadisticas(crearRepositorio()).poblacion(NACIONAL);
    expect(vacio).toMatchObject({ total: 0, edadPromedio: null, piramide: [] });
    expect(vacio.registrosPorSemana).toEqual({
      serie: [],
      tendencia: 'INSUFICIENTE',
      cambioPorSemana: null,
      anomalias: [],
    });
  });
});

describe('estadísticas de aseguramiento', () => {
  it('arma el cubo desde las celdas y cuenta las que no reconoce', async () => {
    const servicio = crearServicioEstadisticas(
      crearRepositorio({
        agregados: [
          celda('total', 'TOTAL', 9),
          celda('cubo', 'DESTRUCCION_TOTAL|ASEGURADA|HIPOTECA|PAGADA', 2),
          celda('cubo', 'DESTRUCCION_TOTAL|ASEGURADA|HIPOTECA|NINGUNA', 1),
          celda('cubo', 'SIN_AFECTACION|NO_ASEGURADA|SIN_FINANCIACION|NO_APLICA', 5),
          celda('cubo', 'INVENTADO|ASEGURADA|HIPOTECA|NINGUNA', 1),
          celda('reclamacion', 'PAGADA', 2),
          celda('reclamacion', 'NINGUNA', 2),
          celda('reclamacion', 'NO_APLICA', 5),
          celda('estrato', 'SIN_DATO', 1),
          celda('estrato', '3', 4),
          celda('estrato', '1', 4),
        ],
      }),
    );
    const resultado = await servicio.aseguramiento(NACIONAL);
    expect(resultado.total).toBe(9);
    expect(resultado.celdasDescartadas).toBe(1);
    expect(resultado.analisis.porAseguramiento).toEqual({
      ASEGURADA: 3,
      NO_ASEGURADA: 5,
      PENDIENTE_VERIFICACION: 0,
    });
    expect(resultado.analisis.destruidasConPoliza).toBe(1);
    expect(resultado.reclamaciones).toMatchObject({
      aseguradas: 4,
      presentadas: 2,
      pagadas: 2,
      tasaDePago: 1,
    });
    expect(resultado.distribuciones.estrato.map(({ categoria }) => categoria)).toEqual([
      '1',
      '3',
      'SIN_DATO',
    ]);
  });
});

describe('priorización de zonas', () => {
  const configuracion = {
    version: 1,
    k: 2,
    criterios: [
      criterio('personas', 2, territorial('personas')),
      criterio('vulnerables', 1, agregado('vulnerable', 'SI')),
      criterio('suministros', 1, null, { mas_es_mejor: true }),
      criterio('sin_datos', 1, territorial('inexistente')),
      criterio('sin_peso', 0, territorial('personas')),
    ],
  };
  const repositorio = crearRepositorio({
    valores: [
      { municipio_codigo: '17001', variable_codigo: 'personas', valor: 100 },
      { municipio_codigo: '05001', variable_codigo: 'personas', valor: 50 },
      { municipio_codigo: '27660', variable_codigo: 'personas', valor: null },
    ],
    municipales: {
      'vulnerable|SI': [
        { territorio: '17001', dimension: 'total', cantidad: 10 },
        { territorio: '17001', dimension: 'vulnerable', cantidad: 4 },
        { territorio: '05001', dimension: 'total', cantidad: 5 },
      ],
    },
  });

  const servicioCon = (leerConfiguracion = async () => configuracion) =>
    crearServicioEstadisticas(repositorio, { leerConfiguracion });

  it('excluye los criterios sin fuente, sin datos o sin peso y dice por qué', async () => {
    const { criterios } = await servicioCon().priorizacion({ evento: EVENTO, k: 3 });
    expect(
      criterios.map(({ codigo, incluido, motivo, peso, zonasConDato }) => [
        codigo,
        incluido,
        motivo,
        peso,
        zonasConDato,
      ]),
    ).toEqual([
      ['personas', true, null, 2 / 3, 2],
      ['vulnerables', true, null, 1 / 3, 2],
      ['suministros', false, 'La plataforma no tiene datos para este criterio.', null, 0],
      ['sin_datos', false, 'Ninguna zona tiene datos para este criterio.', null, 0],
      ['sin_peso', false, 'El criterio tiene peso cero en la configuración.', null, 2],
    ]);
  });

  it('distingue un cero de un dato ausente', async () => {
    const { zonas } = await servicioCon().priorizacion({ evento: EVENTO, k: 3 });
    const aportes = Object.fromEntries(
      zonas.map(({ codigo, aportes: deLaZona }) => [
        codigo,
        deLaZona.map(({ criterio: nombre, valor, sinDato }) => [nombre, valor, sinDato]),
      ]),
    );
    expect(aportes['05001']).toEqual([
      ['personas', 50, false],
      ['vulnerables', 0, false],
    ]);
    expect(aportes['27660']).toEqual([
      ['personas', null, true],
      ['vulnerables', null, true],
    ]);
  });

  it('ordena por puntaje, desempata por código y agrega el departamento', async () => {
    const { zonas, meta, aviso } = await servicioCon().priorizacion({ evento: EVENTO, k: 3 });
    expect(aviso).toBe(AVISO_PRIORIZACION);
    expect(meta).toMatchObject({ evento: EVENTO, zonas: 3, k: 3 });
    expect(meta.notas[0]).toMatch(/combina cifras oficiales con datos simulados/);
    expect(
      zonas.map(({ posicion, codigo, puntaje, departamento }) => [
        posicion,
        codigo,
        puntaje,
        departamento.nombre,
      ]),
    ).toEqual([
      [1, '17001', 1, 'Caldas'],
      [2, '05001', 0, 'Antioquia'],
      [3, '27660', 0, 'Chocó'],
    ]);
  });

  it('usa el tamaño de la configuración cuando no se indica', async () => {
    const { zonas, meta } = await servicioCon().priorizacion({ evento: EVENTO });
    expect(meta.k).toBe(2);
    expect(zonas).toHaveLength(2);
  });

  it('suma las variables de un criterio compuesto e ignora las que no tienen dato', async () => {
    const servicio = crearServicioEstadisticas(
      crearRepositorio({
        valores: [
          { municipio_codigo: '17001', variable_codigo: 'x', valor: 1 },
          { municipio_codigo: '17001', variable_codigo: 'y', valor: 2 },
          { municipio_codigo: '05001', variable_codigo: 'x', valor: null },
          { municipio_codigo: '05001', variable_codigo: 'y', valor: 4 },
          { municipio_codigo: '27660', variable_codigo: 'x', valor: null },
        ],
      }),
      {
        leerConfiguracion: async () => ({
          version: 1,
          k: 3,
          criterios: [criterio('infraestructura', 1, territorial('x', 'y'))],
        }),
      },
    );
    const { zonas, meta } = await servicio.priorizacion({ evento: EVENTO });
    expect(Object.fromEntries(zonas.map(({ codigo, aportes }) => [codigo, aportes[0].valor]))).toEqual({
      '05001': 4,
      17001: 3,
      27660: null,
    });
    expect(meta.notas.join(' ')).not.toMatch(/simulados/);
  });

  it('sin criterios con datos no ordena ninguna zona', async () => {
    const servicio = servicioCon(async () => ({
      version: 1,
      k: 5,
      criterios: [criterio('suministros', 1, null)],
    }));
    const resultado = await servicio.priorizacion({ evento: EVENTO });
    expect(resultado.zonas).toEqual([]);
    expect(resultado.criterios[0]).toMatchObject({ incluido: false, peso: null });
  });

  it('lee la configuración una vez y la vuelve a intentar si falla', async () => {
    const leerConfiguracion = vi
      .fn()
      .mockRejectedValueOnce(new Error('YAML ilegible'))
      .mockResolvedValue(configuracion);
    const servicio = servicioCon(leerConfiguracion);
    await expect(servicio.priorizacion({ evento: EVENTO })).rejects.toThrow('YAML ilegible');
    await servicio.priorizacion({ evento: EVENTO });
    await servicio.priorizacion({ evento: EVENTO });
    expect(leerConfiguracion).toHaveBeenCalledTimes(2);
  });

  it('responde 404 ante un evento inexistente', async () => {
    await expect(servicioCon().priorizacion({ evento: 'otro' })).rejects.toMatchObject({ estado: 404 });
  });
});

describe('nombre seguro del archivo subido', () => {
  it.each([
    ['personas.csv', 'personas.csv'],
    ['../../etc/clave.csv', 'clave.csv'],
    ['da\u0000tos\u0007\u007f.csv', 'datos.csv'],
    ['  registros de agosto.jsonl  ', 'registros de agosto.jsonl'],
    ['', 'archivo'],
    [null, 'archivo'],
    ['\u0001\u0002', 'archivo'],
  ])('%j → %j', (original, seguro) => {
    expect(nombreSeguro(original)).toBe(seguro);
  });

  it('recorta los nombres de más de 255 caracteres', () => {
    expect(nombreSeguro(`${'a'.repeat(300)}.csv`)).toHaveLength(255);
  });
});
