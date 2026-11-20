import { documentoDe } from './personas.js';
import { escribirDireccion, predioDe } from './viviendas.js';

export const TASAS_POR_DEFECTO = Object.freeze({
  rechazo: 0.01,
  exacto: 0.005,
  probable: 0.005,
  normalizable: 0.03,
});
export const SIN_DEFECTOS = Object.freeze({ rechazo: 0, exacto: 0, probable: 0, normalizable: 0 });

const MEMORIA_DE_DUPLICADOS = 1000;
const CONFUSIONES = new Map([
  ['S', 'Z'],
  ['Z', 'S'],
  ['B', 'V'],
  ['V', 'B'],
  ['C', 'S'],
  ['G', 'J'],
  ['J', 'G'],
  ['I', 'Y'],
  ['Y', 'I'],
  ['M', 'N'],
  ['N', 'M'],
]);
const LETRA = /\p{L}/u;

const elegir = (lista, generador) => lista[generador.entero(0, lista.length - 1)];

function sustituir(letra) {
  const mayuscula = letra.toUpperCase();
  const reemplazo = CONFUSIONES.get(mayuscula) ?? (mayuscula === 'A' ? 'E' : 'A');
  return letra === mayuscula ? reemplazo : reemplazo.toLowerCase();
}

export function introducirErrorDeDigitacion(texto, generador) {
  const letras = [...texto];
  const candidatas = letras
    .map((letra, posicion) => posicion)
    .filter((posicion) => posicion > 0 && LETRA.test(letras[posicion]));
  if (candidatas.length === 0) {
    return `${texto}${texto.at(-1) ?? 'A'}`;
  }
  const posicion = elegir(candidatas, generador);
  const tipo = generador.entero(0, 2);
  const siguienteEsLetra = posicion + 1 < letras.length && LETRA.test(letras[posicion + 1]);
  const anteriorEsLetra = LETRA.test(letras[posicion - 1]);
  if (tipo === 1 && anteriorEsLetra && siguienteEsLetra) {
    letras.splice(posicion, 1);
  } else if (tipo === 2 && siguienteEsLetra && letras[posicion] !== letras[posicion + 1]) {
    [letras[posicion], letras[posicion + 1]] = [letras[posicion + 1], letras[posicion]];
  } else {
    letras[posicion] = sustituir(letras[posicion]);
  }
  return letras.join('');
}

export const DEFECTOS_DE_PERSONAS = Object.freeze({
  corrupciones: [
    { motivo: 'EDAD_NO_NUMERICA', aplicar: (fila) => ({ ...fila, edad: 'treinta y dos' }) },
    { motivo: 'EDAD_FUERA_DE_RANGO', aplicar: (fila) => ({ ...fila, edad: 150 }) },
    { motivo: 'MUNICIPIO_INEXISTENTE', aplicar: (fila) => ({ ...fila, municipio: '99999' }) },
    { motivo: 'DOCUMENTO_VACIO', aplicar: (fila) => ({ ...fila, documento: '' }) },
    { motivo: 'CONDICION_DESCONOCIDA', aplicar: (fila) => ({ ...fila, condicion_institucional: 'CIVL' }) },
    { motivo: 'FECHA_IMPOSIBLE', aplicar: (fila) => ({ ...fila, fecha_registro: '2026-02-30' }) },
    { motivo: 'FECHA_ANTERIOR_AL_SISMO', aplicar: (fila) => ({ ...fila, fecha_registro: '2026-07-15' }) },
  ],
  normalizaciones: [
    {
      tipo: 'MUNICIPIO_SIN_CERO_INICIAL',
      aplica: (fila) => fila.municipio.startsWith('0'),
      aplicar: (fila) => ({ ...fila, municipio: fila.municipio.slice(1) }),
    },
    {
      tipo: 'CODIGO_EN_MINUSCULAS',
      aplica: () => true,
      aplicar: (fila) => ({
        ...fila,
        condicion_institucional: ` ${fila.condicion_institucional.toLowerCase()} `,
      }),
    },
    {
      tipo: 'MARCADOR_DE_AUSENCIA',
      aplica: (fila) => fila.tenencia === null,
      aplicar: (fila) => ({ ...fila, tenencia: 'No registra' }),
    },
    {
      tipo: 'SEXO_EN_MINUSCULA',
      aplica: () => true,
      aplicar: (fila) => ({ ...fila, sexo: fila.sexo.toLowerCase() }),
    },
  ],
  duplicarProbable: (fila, generador, indice) => ({
    ...fila,
    documento: documentoDe(indice),
    nombre_completo: introducirErrorDeDigitacion(fila.nombre_completo, generador),
  }),
});

export const DEFECTOS_DE_VIVIENDAS = Object.freeze({
  corrupciones: [
    { motivo: 'ESTRATO_FUERA_DE_RANGO', aplicar: (fila) => ({ ...fila, estrato: 9 }) },
    { motivo: 'AVALUO_NEGATIVO', aplicar: (fila) => ({ ...fila, avaluo: -fila.avaluo }) },
    { motivo: 'ESTADO_DESCONOCIDO', aplicar: (fila) => ({ ...fila, estado_fisico: 'DERRUMBADA' }) },
    { motivo: 'MUNICIPIO_INEXISTENTE', aplicar: (fila) => ({ ...fila, municipio: '99999' }) },
    { motivo: 'PREDIO_VACIO', aplicar: (fila) => ({ ...fila, predio: '' }) },
    { motivo: 'FECHA_IMPOSIBLE', aplicar: (fila) => ({ ...fila, fecha_registro: '2026-13-01' }) },
  ],
  normalizaciones: [
    {
      tipo: 'MUNICIPIO_SIN_CERO_INICIAL',
      aplica: (fila) => fila.municipio.startsWith('0'),
      aplicar: (fila) => ({ ...fila, municipio: fila.municipio.slice(1) }),
    },
    {
      tipo: 'DIRECCION_ABREVIADA',
      aplica: () => true,
      aplicar: (fila) => ({ ...fila, direccion: escribirDireccion(fila.partesDireccion, 'abreviada') }),
    },
    {
      tipo: 'CODIGO_EN_MINUSCULAS',
      aplica: () => true,
      aplicar: (fila) => ({ ...fila, estado_fisico: fila.estado_fisico.toLowerCase() }),
    },
    {
      tipo: 'MARCADOR_DE_AUSENCIA',
      aplica: (fila) => fila.saldo === null,
      aplicar: (fila) => ({ ...fila, saldo: 'N/A' }),
    },
  ],
  duplicarProbable: (fila) => ({
    ...fila,
    predio: predioDe(fila.indiceDeDuplicado),
    direccion: escribirDireccion(fila.partesDireccion, 'alterna'),
  }),
});

function contar(grupo, clave) {
  grupo[clave] = (grupo[clave] ?? 0) + 1;
}

export function crearInyector({
  generador,
  generarBase,
  defectos,
  cantidad,
  tasas = TASAS_POR_DEFECTO,
  memoria = MEMORIA_DE_DUPLICADOS,
  primerIndice = 0,
}) {
  const recientes = [];
  let posicionReciente = 0;
  let adicionales = 0;
  const manifiesto = { rechazadas: {}, normalizables: {}, duplicadosExactos: 0, duplicadosProbables: 0 };

  function recordar(fila) {
    if (recientes.length < memoria) {
      recientes.push(fila);
    } else {
      recientes[posicionReciente] = fila;
      posicionReciente = (posicionReciente + 1) % memoria;
    }
  }

  function siguiente(indice) {
    const sorteo = generador.siguiente();
    if (sorteo < tasas.rechazo) {
      const corrupcion = elegir(defectos.corrupciones, generador);
      contar(manifiesto.rechazadas, corrupcion.motivo);
      return corrupcion.aplicar(generarBase(primerIndice + indice), generador);
    }
    const hayMemoria = recientes.length > 0;
    if (hayMemoria && sorteo < tasas.rechazo + tasas.exacto) {
      manifiesto.duplicadosExactos += 1;
      return { ...elegir(recientes, generador) };
    }
    if (hayMemoria && sorteo < tasas.rechazo + tasas.exacto + tasas.probable) {
      manifiesto.duplicadosProbables += 1;
      adicionales += 1;
      const original = elegir(recientes, generador);
      const indiceNuevo = primerIndice + cantidad + adicionales;
      return defectos.duplicarProbable(
        { ...original, indiceDeDuplicado: indiceNuevo },
        generador,
        indiceNuevo,
      );
    }
    const base = generarBase(primerIndice + indice);
    recordar(base);
    if (generador.ocurre(tasas.normalizable)) {
      const aplicables = defectos.normalizaciones.filter((normalizacion) => normalizacion.aplica(base));
      if (aplicables.length > 0) {
        const normalizacion = elegir(aplicables, generador);
        contar(manifiesto.normalizables, normalizacion.tipo);
        return normalizacion.aplicar(base, generador);
      }
    }
    return base;
  }

  return { siguiente, manifiesto: () => structuredClone(manifiesto) };
}
