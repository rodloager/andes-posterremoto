import { barras, lineas } from '../graficas/opciones.js';
import { formatearFecha } from '../nucleo/formato.js';
import { describirProcedencia } from '../nucleo/indicadores.js';
import { grafica, origenDe } from '../nucleo/pagina.js';
import { nombresDe, ordenarPor, origenTerritorial, serieDe } from '../nucleo/territorio.js';

export const nombres = (categorias) => categorias.map(({ nombre }) => nombre);

export function puntosDe(contexto, codigo) {
  return contexto.serie(codigo).map(({ fechaCorte, valor }) => ({ fecha: fechaCorte, valor }));
}

export function puntosSemanales(fechas, valores) {
  return fechas.map((fecha, posicion) => ({ fecha, valor: valores[posicion] }));
}

export function evolucionDeVivienda(contexto) {
  const ultimo = contexto.serie('viviendas_destruidas').at(-1);
  return grafica({
    pregunta: '¿Cómo cambiaron las cifras de vivienda entre cortes?',
    descripcion: 'Cada punto es un balance de la UNGRD, ubicado en su fecha real.',
    ...lineas({
      series: [
        { nombre: 'Viviendas averiadas', puntos: puntosDe(contexto, 'viviendas_averiadas') },
        { nombre: 'Viviendas destruidas', puntos: puntosDe(contexto, 'viviendas_destruidas') },
      ],
    }),
    origen: origenDe(contexto.fuente(ultimo.fuente), ultimo.fechaCorte),
  });
}

function nombreDeVariable(territorio, codigo) {
  return territorio.variables.find((variable) => variable.codigo === codigo).nombre;
}

export function barrasPorDepartamento(contexto, territorio, { variables, ...presentacion }) {
  const [principal] = variables;
  const departamentos = ordenarPor(territorio.departamentos, principal);
  return grafica({
    ...presentacion,
    ...barras({
      categorias: nombresDe(departamentos),
      series: variables.map((codigo) => ({
        nombre: nombreDeVariable(territorio, codigo),
        valores: serieDe(departamentos, codigo),
      })),
      encabezado: 'Departamento',
    }),
    origen: origenTerritorial(contexto.fuente('dane-afectaciones'), territorio.meta),
  });
}

export function origenDeVariasFuentes(contexto, partidas) {
  const citas = new Map(
    partidas.map(({ fuente, fechaCorte }) => [
      `${fuente}|${fechaCorte}`,
      `${describirProcedencia(contexto.fuente(fuente))} (${formatearFecha(fechaCorte)})`,
    ]),
  );
  const [primera] = partidas;
  const referencia = contexto.fuente(primera.fuente);
  return {
    tipo: referencia.origen,
    nivel: referencia.nivel,
    texto: `Fuentes: ${[...citas.values()].join('; ')}.`,
  };
}
