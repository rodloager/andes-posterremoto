import '../componentes/marco.js';
import { crearFigura } from '../componentes/figura.js';
import { crearGrafica, crearGraficaSinDato } from '../componentes/grafica.js';
import { crearIndicador } from '../componentes/indicador.js';
import { cargarContexto } from './contexto.js';
import { crear } from './dom.js';
import { formatearFecha, formatearNumero } from './formato.js';
import { describirProcedencia } from './indicadores.js';
import { rejilla } from './secciones.js';

export { nota, seccion } from './secciones.js';

export const MOTIVO_SOLO_DEMOSTRACION =
  'Ninguna fuente publica este desglose. Cambia al modo de demostración para ver cómo se presentaría con datos simulados.';

const ORIGEN_SIMULADO = 'SIMULADO';

export function indicadores(contexto, codigos, { principal = false } = {}) {
  const clase = principal ? 'rejilla-indicadores rejilla-indicadores--principal' : 'rejilla-indicadores';
  return crear(
    'div',
    { clase },
    codigos.map((codigo) => crearIndicador(contexto.indicador(codigo), { principal })),
  );
}

export const graficas = rejilla;

export function origenDe(fuente, fechaCorte) {
  const corte = fechaCorte ? ` · Corte: ${formatearFecha(fechaCorte)}` : '';
  return {
    tipo: fuente.origen,
    nivel: fuente.nivel,
    texto: `Fuente: ${describirProcedencia(fuente)}${corte}.`,
    enlace: fuente.enlace,
  };
}

export function origenSimulado(muestra) {
  return { tipo: ORIGEN_SIMULADO, nivel: 'S', texto: `${muestra}. No son cifras oficiales.` };
}

export function muestraDe(cantidad, unidad) {
  return `Muestra simulada de ${formatearNumero(cantidad)} ${unidad}`;
}

function conAncho(elemento, anchoCompleto) {
  if (anchoCompleto) {
    elemento.classList.add('ancho-completo');
  }
  return elemento;
}

export function grafica({ anchoCompleto = false, ...configuracion }) {
  return conAncho(crearGrafica(configuracion), anchoCompleto);
}

export function graficaSimulada(datos, { pregunta, muestra, construir, anchoCompleto = false, ...resto }) {
  if (!datos) {
    return conAncho(crearGraficaSinDato({ pregunta, motivo: MOTIVO_SOLO_DEMOSTRACION }), anchoCompleto);
  }
  return grafica({
    pregunta,
    ...resto,
    ...construir(datos),
    origen: origenSimulado(muestra(datos)),
    anchoCompleto,
  });
}

export function figura({ anchoCompleto = false, ...descripcion }, ...cuerpo) {
  return conAncho(crearFigura(descripcion, ...cuerpo), anchoCompleto);
}

export function figuraSimulada(datos, { pregunta, muestra, construir, anchoCompleto = false, ...resto }) {
  if (!datos) {
    return conAncho(crearGraficaSinDato({ pregunta, motivo: MOTIVO_SOLO_DEMOSTRACION }), anchoCompleto);
  }
  return figura(
    { pregunta, ...resto, origen: origenSimulado(muestra(datos)), anchoCompleto },
    construir(datos),
  );
}

function mostrarError(contenedor, error) {
  console.error(error);
  contenedor.replaceChildren(
    crear('p', {
      clase: 'estado-error',
      role: 'alert',
      texto: 'No se pudieron cargar los datos. Recarga la página para intentarlo de nuevo.',
    }),
  );
}

export async function iniciarPagina(construir) {
  const contenedor = document.getElementById('contenido');
  try {
    const contexto = await cargarContexto();
    contenedor.replaceChildren(...(await construir(contexto)));
  } catch (error) {
    mostrarError(contenedor, error);
  }
}
