import { describe, expect, it } from 'vitest';
import { INDICADORES_DE_VIVIENDAS_REGISTRADAS } from '../../../backend/src/services/registros.js';
import { crearGenerador, crearSelector } from '../../../data/generador/aleatorio.js';
import {
  TAMANO_PERSONAS,
  TAMANO_VIVIENDAS,
  fechasSemanales,
  generarDemostracion,
} from '../../../data/generador/demostracion.js';
import { distanciaKm, pesarPorCercania } from '../../../data/generador/territorio.js';

const DEPARTAMENTOS = [
  { codigo: '27', nombre: 'Chocó', peso: 3 },
  { codigo: '66', nombre: 'Risaralda', peso: 2 },
  { codigo: '76', nombre: 'Valle del Cauca', peso: 1 },
];

const sumar = (cantidades) => cantidades.reduce((total, cantidad) => total + cantidad, 0);
const demostracion = generarDemostracion({ semilla: 7, departamentos: DEPARTAMENTOS });

describe('crearGenerador', () => {
  it('produce la misma secuencia con la misma semilla', () => {
    const primero = crearGenerador(123);
    const segundo = crearGenerador(123);
    const secuencia = (generador) => Array.from({ length: 5 }, () => generador.siguiente());
    expect(secuencia(primero)).toEqual(secuencia(segundo));
  });

  it('produce secuencias distintas con semillas distintas', () => {
    expect(crearGenerador(1).siguiente()).not.toBe(crearGenerador(2).siguiente());
  });

  it('mantiene los valores dentro de sus rangos', () => {
    const generador = crearGenerador(99);
    for (let intento = 0; intento < 1000; intento += 1) {
      const valor = generador.siguiente();
      const entero = generador.entero(3, 6);
      expect(valor).toBeGreaterThanOrEqual(0);
      expect(valor).toBeLessThan(1);
      expect(entero).toBeGreaterThanOrEqual(3);
      expect(entero).toBeLessThanOrEqual(6);
    }
  });
});

describe('crearSelector', () => {
  it('elige cada opción en proporción a su peso', () => {
    const generador = crearGenerador(5);
    const elegir = crearSelector([{ peso: 3 }, { peso: 1 }]);
    const conteo = [0, 0];
    for (let intento = 0; intento < 20000; intento += 1) {
      conteo[elegir(generador)] += 1;
    }
    expect(conteo[0] / 20000).toBeCloseTo(0.75, 1);
  });

  it('nunca elige una opción de peso cero', () => {
    const generador = crearGenerador(5);
    const elegir = crearSelector([{ peso: 0 }, { peso: 1 }]);
    const elegidas = new Set(Array.from({ length: 500 }, () => elegir(generador)));
    expect([...elegidas]).toEqual([1]);
  });
});

describe('fechasSemanales', () => {
  it('avanza siete días por posición', () => {
    expect(fechasSemanales('2026-08-10', 3)).toEqual(['2026-08-10', '2026-08-17', '2026-08-24']);
  });
});

describe('generarDemostracion', () => {
  it('es repetible con la misma semilla', () => {
    const repeticion = generarDemostracion({ semilla: 7, departamentos: DEPARTAMENTOS });
    expect(repeticion).toEqual(demostracion);
  });

  it('cambia cuando cambia la semilla', () => {
    const otra = generarDemostracion({ semilla: 8, departamentos: DEPARTAMENTOS });
    expect(otra.poblacion.gruposEdad).not.toEqual(demostracion.poblacion.gruposEdad);
  });

  it('reparte a todas las personas en clasificaciones excluyentes', () => {
    const { poblacion } = demostracion;
    const personas = (categorias) => sumar(categorias.map((categoria) => categoria.personas));
    expect(personas(poblacion.gruposEdad)).toBe(TAMANO_PERSONAS);
    expect(personas(poblacion.condicionInstitucional)).toBe(TAMANO_PERSONAS);
    expect(personas(poblacion.tenencia)).toBe(TAMANO_PERSONAS);
    expect(personas(poblacion.situacion)).toBe(TAMANO_PERSONAS);
    expect(personas(poblacion.porDepartamento)).toBe(TAMANO_PERSONAS);
    expect(sumar(poblacion.piramide.hombres) + sumar(poblacion.piramide.mujeres)).toBe(TAMANO_PERSONAS);
  });

  it('trata las vulnerabilidades como variables independientes', () => {
    const porNombre = Object.fromEntries(
      demostracion.poblacion.vulnerabilidad.map(({ nombre, personas }) => [nombre, personas]),
    );
    const mayores = demostracion.poblacion.gruposEdad.at(-1).personas;
    expect(porNombre['Adultos mayores']).toBe(mayores);
    expect(porNombre.Discapacidad).not.toBe(porNombre['Necesidades especiales']);
    expect(sumar(Object.values(porNombre))).not.toBe(TAMANO_PERSONAS);
  });

  it('mantiene coherentes los cruces de vivienda', () => {
    const { vivienda } = demostracion;
    const viviendas = (categorias) => sumar(categorias.map((categoria) => categoria.viviendas));
    const celdas = (cruce) => sumar(cruce.valores.flat());
    expect(viviendas(vivienda.estadoFisico)).toBe(TAMANO_VIVIENDAS);
    expect(viviendas(vivienda.financiacion)).toBe(TAMANO_VIVIENDAS);
    expect(celdas(vivienda.estadoPorAseguramiento)).toBe(TAMANO_VIVIENDAS);
    expect(celdas(vivienda.financiacionPorAseguramiento)).toBe(TAMANO_VIVIENDAS);
    expect(viviendas(vivienda.ocupacion)).toBe(vivienda.afectadas);
    expect(viviendas(vivienda.aseguramiento)).toBe(vivienda.afectadas);
  });

  it('permite viviendas financiadas con y sin seguro', () => {
    const [hipotecadas] = demostracion.vivienda.financiacionPorAseguramiento.valores;
    const [aseguradas, noAseguradas] = hipotecadas;
    expect(aseguradas).toBeGreaterThan(0);
    expect(noAseguradas).toBeGreaterThan(0);
    expect(demostracion.vivienda.financiadasSinSeguro).toBeGreaterThanOrEqual(noAseguradas);
  });

  it('estrecha el embudo de reclamaciones en cada etapa', () => {
    const etapas = demostracion.vivienda.embudoReclamaciones.map(({ viviendas }) => viviendas);
    expect(etapas).toEqual([...etapas].sort((a, b) => b - a));
    const { reclamaciones } = demostracion.vivienda;
    expect(etapas[2] + reclamaciones.rechazadas + reclamaciones.enEstudio).toBe(etapas[1]);
  });

  it('acota el intervalo de cobertura de las viviendas destruidas', () => {
    const { porcentajeMinimo, porcentajeMaximo } = demostracion.vivienda.coberturaDestruidas;
    expect(porcentajeMinimo).toBeGreaterThanOrEqual(0);
    expect(porcentajeMaximo).toBeGreaterThanOrEqual(porcentajeMinimo);
    expect(porcentajeMaximo).toBeLessThanOrEqual(100);
  });

  it('acumula la atención sin retroceder y nunca supera la capacidad de los albergues', () => {
    const { atendidas } = demostracion.poblacion.evolucion;
    expect(atendidas).toEqual([...atendidas].sort((a, b) => a - b));
    const { alojadas, capacidad } = demostracion.logistica.evolucionAlojamiento;
    alojadas.forEach((cantidad, semana) => expect(cantidad).toBeLessThanOrEqual(capacidad[semana]));
  });

  it('no ejecuta más recursos de los asignados', () => {
    for (const { asignado, comprometido, ejecutado } of demostracion.economia.recursos) {
      expect(comprometido).toBeLessThanOrEqual(asignado);
      expect(ejecutado).toBeLessThanOrEqual(comprometido);
    }
  });

  it('no simula los indicadores que salen de los registros cargados en la base', () => {
    for (const codigo of [...INDICADORES_DE_VIVIENDAS_REGISTRADAS, 'personas_desplazadas']) {
      expect(demostracion.indicadores, codigo).not.toHaveProperty(codigo);
    }
  });

  it('entrega un valor numérico para cada indicador simulado', () => {
    const valores = Object.values(demostracion.indicadores);
    expect(valores.length).toBeGreaterThanOrEqual(30);
    for (const { valor, muestra } of valores) {
      expect(Number.isFinite(valor)).toBe(true);
      expect(valor).toBeGreaterThanOrEqual(0);
      expect(muestra).toMatch(/simulad/i);
    }
  });
});

describe('pesarPorCercania', () => {
  const cuadrado = (longitud, latitud) => ({
    type: 'Polygon',
    coordinates: [
      [
        [longitud, latitud],
        [longitud + 1, latitud],
        [longitud + 1, latitud + 1],
        [longitud, latitud + 1],
      ],
    ],
  });
  const entidades = [
    { properties: { codigo: 'cerca', nombre: 'Cerca' }, geometry: cuadrado(-76.5, 4.5) },
    { properties: { codigo: 'lejos', nombre: 'Lejos' }, geometry: cuadrado(-70, 10) },
  ];

  it('da más peso al territorio más cercano al epicentro', () => {
    const [cerca, lejos] = pesarPorCercania(entidades, { latitud: 4.86, longitud: -76.26 });
    expect(cerca.peso).toBeGreaterThan(lejos.peso);
    expect(lejos.peso).toBeGreaterThan(0);
  });

  it('mide cero kilómetros entre un punto y sí mismo', () => {
    const punto = { latitud: 4.86, longitud: -76.26 };
    expect(distanciaKm(punto, punto)).toBe(0);
  });

  it('mide cerca de 111 kilómetros por grado de latitud', () => {
    expect(distanciaKm({ latitud: 4, longitud: -76 }, { latitud: 5, longitud: -76 })).toBeCloseTo(111.2, 0);
  });
});
