import { normalizarTexto } from '../../backend/src/algorithms/texto.js';
import { ocultarValor } from './seudonimos.js';

export const ERRORES = Object.freeze({
  obligatorio: 'OBLIGATORIO',
  tipo: 'TIPO',
  rango: 'RANGO',
  formato: 'FORMATO',
  longitud: 'LONGITUD',
  valor: 'VALOR_NO_PERMITIDO',
  municipio: 'MUNICIPIO_INEXISTENTE',
  fecha: 'FECHA_INVALIDA',
});

const ENTERO = /^[+-]?\d+$/;
const DECIMAL = /^[+-]?\d+(\.\d+)?$/;
const FECHA_ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
const CODIGO_DE_MUNICIPIO = /^\d{4,5}$/;
const MUESTRA = 60;

const muestra = (valor) => {
  const texto = typeof valor === 'string' ? valor : JSON.stringify(valor);
  return texto.length > MUESTRA ? `${texto.slice(0, MUESTRA)}…` : texto;
};

const mostrar = (campo, valor) => (campo.seudonimizar ? ocultarValor(valor) : muestra(valor));

export const aCodigo = (texto) => normalizarTexto(texto).replaceAll(' ', '_');

function fechaReal(texto) {
  const coincidencia = FECHA_ISO.exec(texto);
  if (!coincidencia) {
    return null;
  }
  const [, anio, mes, dia] = coincidencia.map(Number);
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  return fecha.getUTCFullYear() === anio && fecha.getUTCMonth() === mes - 1 && fecha.getUTCDate() === dia
    ? texto
    : null;
}

function resolverLimiteDeFecha(limite, referencias) {
  if (limite === undefined) {
    return null;
  }
  return referencias[limite] ?? limite;
}

function convertirNumero(bruto, campo, patron) {
  if (typeof bruto === 'number') {
    if (!Number.isFinite(bruto) || (campo.tipo === 'entero' && !Number.isInteger(bruto))) {
      return {
        error: ERRORES.tipo,
        mensaje: `El valor ${mostrar(campo, bruto)} no es un número ${campo.tipo === 'entero' ? 'entero' : 'válido'}.`,
      };
    }
    return { valor: bruto };
  }
  const texto = String(bruto).trim();
  if (!patron.test(texto)) {
    return {
      error: ERRORES.tipo,
      mensaje: `El valor ${mostrar(campo, texto)} no es un número ${campo.tipo === 'entero' ? 'entero' : 'válido'}.`,
    };
  }
  return { valor: Number(texto) };
}

function crearConversor(campo, { municipios, referenciasDeFecha }) {
  const permitidos = campo.valores ? new Set(campo.valores) : null;
  const patron = campo.patron ? new RegExp(campo.patron) : null;
  const desde = resolverLimiteDeFecha(campo.desde, referenciasDeFecha);
  const hasta = resolverLimiteDeFecha(campo.hasta, referenciasDeFecha);

  function enRango(valor) {
    if (
      (campo.minimo !== undefined && valor < campo.minimo) ||
      (campo.maximo !== undefined && valor > campo.maximo)
    ) {
      return {
        error: ERRORES.rango,
        mensaje: `El valor ${mostrar(campo, valor)} está fuera del rango permitido (${campo.minimo ?? '−∞'} a ${campo.maximo ?? '∞'}).`,
      };
    }
    return { valor };
  }

  const conversores = {
    texto(bruto) {
      const texto = String(bruto).trim();
      if (campo.longitud_maxima !== undefined && texto.length > campo.longitud_maxima) {
        return { error: ERRORES.longitud, mensaje: `El texto supera ${campo.longitud_maxima} caracteres.` };
      }
      if (patron && !patron.test(texto)) {
        return {
          error: ERRORES.formato,
          mensaje: `El valor ${mostrar(campo, texto)} no tiene el formato esperado.`,
        };
      }
      return { valor: texto };
    },
    entero(bruto) {
      const resultado = convertirNumero(bruto, campo, ENTERO);
      return resultado.error ? resultado : enRango(resultado.valor);
    },
    decimal(bruto) {
      const resultado = convertirNumero(bruto, campo, DECIMAL);
      return resultado.error ? resultado : enRango(resultado.valor);
    },
    categoria(bruto) {
      const codigo = aCodigo(bruto);
      if (!permitidos.has(codigo)) {
        return {
          error: ERRORES.valor,
          mensaje: `El valor ${mostrar(campo, bruto)} no está permitido en ${campo.nombre}.`,
        };
      }
      return { valor: codigo };
    },
    lista(bruto) {
      const elementos = Array.isArray(bruto) ? bruto : String(bruto).split(campo.separador);
      const codigos = [];
      for (const elemento of elementos) {
        if (elemento === null || String(elemento).trim() === '') {
          continue;
        }
        const codigo = aCodigo(elemento);
        if (!permitidos.has(codigo)) {
          return {
            error: ERRORES.valor,
            mensaje: `El valor ${mostrar(campo, elemento)} no está permitido en ${campo.nombre}.`,
          };
        }
        if (!codigos.includes(codigo)) {
          codigos.push(codigo);
        }
      }
      return { valor: codigos };
    },
    fecha(bruto) {
      const texto = String(bruto).trim();
      const fecha = fechaReal(texto);
      if (!fecha) {
        return {
          error: ERRORES.fecha,
          mensaje: `La fecha ${mostrar(campo, texto)} no existe o no tiene el formato AAAA-MM-DD.`,
        };
      }
      if ((desde && fecha < desde) || (hasta && fecha > hasta)) {
        return {
          error: ERRORES.rango,
          mensaje: `La fecha ${fecha} está fuera del periodo permitido (${desde ?? '…'} a ${hasta ?? '…'}).`,
        };
      }
      return { valor: fecha };
    },
    municipio(bruto) {
      const texto = String(bruto).trim();
      if (!CODIGO_DE_MUNICIPIO.test(texto)) {
        return {
          error: ERRORES.formato,
          mensaje: `El código de municipio ${mostrar(campo, texto)} no tiene cinco dígitos.`,
        };
      }
      const codigo = texto.padStart(5, '0');
      if (!municipios.has(codigo)) {
        return { error: ERRORES.municipio, mensaje: `El municipio ${codigo} no existe en la DIVIPOLA.` };
      }
      return { valor: codigo };
    },
  };
  return conversores[campo.tipo];
}

function crearLectorDeColumnas(campos) {
  const claves = campos.map((campo) => (campo.origen ?? campo.nombre).trim().toLowerCase());
  return function leer(crudo) {
    const porClave = new Map();
    for (const [clave, valor] of Object.entries(crudo)) {
      porClave.set(clave.trim().toLowerCase(), valor);
    }
    return claves.map((clave) => porClave.get(clave));
  };
}

export function crearValidador(definicion, { municipios, referenciasDeFecha = {} }) {
  const ausentes = new Set(definicion.marcadores_de_ausencia.map((marcador) => normalizarTexto(marcador)));
  const campos = definicion.campos.map((campo) => ({
    campo,
    convertir: crearConversor(campo, { municipios, referenciasDeFecha }),
  }));
  const leer = crearLectorDeColumnas(definicion.campos);
  const esAusente = (bruto) =>
    bruto === null ||
    bruto === undefined ||
    (typeof bruto === 'string' && ausentes.has(normalizarTexto(bruto)));

  return function validar(crudo) {
    const brutos = leer(crudo);
    const valores = {};
    const errores = [];
    campos.forEach(({ campo, convertir }, posicion) => {
      const bruto = brutos[posicion];
      if (esAusente(bruto) || (Array.isArray(bruto) && bruto.length === 0)) {
        if (campo.obligatorio) {
          errores.push({
            campo: campo.nombre,
            codigo: ERRORES.obligatorio,
            mensaje: `El campo ${campo.nombre} es obligatorio.`,
          });
        }
        valores[campo.nombre] = campo.tipo === 'lista' ? [] : null;
        return;
      }
      const resultado = convertir(bruto);
      if (resultado.error) {
        if (campo.si_invalido === 'anular' && !campo.obligatorio) {
          valores[campo.nombre] = null;
        } else {
          errores.push({ campo: campo.nombre, codigo: resultado.error, mensaje: resultado.mensaje });
        }
        return;
      }
      valores[campo.nombre] = resultado.valor;
    });
    return { valores, errores };
  };
}
