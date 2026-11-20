export const EDAD_MAXIMA = 120;
export const CORTES_GRUPOS_EDAD = Object.freeze([10, 18, 60]);
export const CORTES_QUINQUENALES = Object.freeze([
  5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80,
]);
export const EDAD_ADULTO_MAYOR = 60;
export const EDAD_MAYORIA = 18;

export const VULNERABILIDADES = Object.freeze([
  Object.freeze({ codigo: 'DISCAPACIDAD', bit: 0, derivada: false }),
  Object.freeze({ codigo: 'NECESIDADES_ESPECIALES', bit: 1, derivada: false }),
  Object.freeze({ codigo: 'MOVILIDAD_REDUCIDA', bit: 2, derivada: false }),
  Object.freeze({ codigo: 'ADULTO_MAYOR', bit: 3, derivada: true }),
  Object.freeze({ codigo: 'EMBARAZO', bit: 4, derivada: false }),
  Object.freeze({ codigo: 'POBLACION_INFANTIL', bit: 5, derivada: true }),
  Object.freeze({ codigo: 'VULNERABILIDAD_SOCIOECONOMICA', bit: 6, derivada: false }),
  Object.freeze({ codigo: 'COMUNIDAD_ATENCION_PRIORITARIA', bit: 7, derivada: false }),
]);

const BIT_ADULTO_MAYOR = 1 << 3;
const BIT_POBLACION_INFANTIL = 1 << 5;

export function crearTablaDeGrupos(cortes, edadMaxima = EDAD_MAXIMA) {
  const ordenados = cortes.every(
    (corte, posicion) =>
      Number.isInteger(corte) &&
      corte > 0 &&
      corte <= edadMaxima &&
      (posicion === 0 || corte > cortes[posicion - 1]),
  );
  if (!ordenados) {
    throw new RangeError('Los cortes de edad deben ser enteros crecientes entre 1 y la edad máxima.');
  }
  const tabla = new Uint8Array(edadMaxima + 1);
  let grupo = 0;
  for (let edad = 0; edad <= edadMaxima; edad += 1) {
    if (grupo < cortes.length && edad >= cortes[grupo]) {
      grupo += 1;
    }
    tabla[edad] = grupo;
  }
  return tabla;
}

function indexarCatalogo(catalogo) {
  return new Map(catalogo.map((entrada) => [entrada.codigo, entrada]));
}

export function crearClasificador({
  condiciones,
  tenencias,
  vulnerabilidades = VULNERABILIDADES,
  cortes = CORTES_GRUPOS_EDAD,
  cortesQuinquenales = CORTES_QUINQUENALES,
}) {
  const grupoPorEdad = crearTablaDeGrupos(cortes);
  const quinquenioPorEdad = crearTablaDeGrupos(cortesQuinquenales);
  const catalogoCondiciones = indexarCatalogo(condiciones);
  const catalogoTenencias = indexarCatalogo(tenencias);
  const declarables = new Map(
    vulnerabilidades.filter(({ derivada }) => !derivada).map(({ codigo, bit }) => [codigo, 1 << bit]),
  );

  return function clasificar({ edad, condicion, tenencia = null, vulnerabilidades: declaradas = [] }) {
    const problemas = [];
    const edadValida = Number.isInteger(edad) && edad >= 0;
    if (!edadValida) {
      problemas.push('EDAD_INVALIDA');
    }
    const condicionEncontrada = catalogoCondiciones.get(condicion);
    if (!condicionEncontrada) {
      problemas.push('CONDICION_DESCONOCIDA');
    }
    const tenenciaEncontrada = tenencia === null ? null : catalogoTenencias.get(tenencia);
    if (tenenciaEncontrada === undefined) {
      problemas.push('TENENCIA_DESCONOCIDA');
    }
    let mascara = 0;
    for (const codigo of declaradas) {
      const bit = declarables.get(codigo);
      if (bit === undefined) {
        problemas.push('VULNERABILIDAD_DESCONOCIDA');
      } else {
        mascara |= bit;
      }
    }
    if (problemas.length > 0) {
      return { clasificable: false, problemas };
    }
    const edadAcotada = Math.min(edad, EDAD_MAXIMA);
    if (edadAcotada >= EDAD_ADULTO_MAYOR) {
      mascara |= BIT_ADULTO_MAYOR;
    }
    if (edadAcotada < EDAD_MAYORIA) {
      mascara |= BIT_POBLACION_INFANTIL;
    }
    return {
      clasificable: true,
      problemas,
      grupoEdad: grupoPorEdad[edadAcotada],
      quinquenio: quinquenioPorEdad[edadAcotada],
      condicion: condicionEncontrada.codigo,
      grupoCondicion: condicionEncontrada.padre ?? condicionEncontrada.codigo,
      tenencia: tenenciaEncontrada?.codigo ?? null,
      mascara,
    };
  };
}

export function clasificarRegistros(registros, opciones) {
  const clasificar = crearClasificador(opciones);
  const clasificados = [];
  let noClasificables = 0;
  for (const registro of registros) {
    const resultado = clasificar(registro);
    if (resultado.clasificable) {
      clasificados.push(resultado);
    } else {
      noClasificables += 1;
    }
  }
  return { clasificados, noClasificables };
}

export function codigosDeMascara(mascara, vulnerabilidades = VULNERABILIDADES) {
  return vulnerabilidades.filter(({ bit }) => (mascara & (1 << bit)) !== 0).map(({ codigo }) => codigo);
}

export function tieneVulnerabilidad(mascara, codigo, vulnerabilidades = VULNERABILIDADES) {
  const vulnerabilidad = vulnerabilidades.find((candidata) => candidata.codigo === codigo);
  return Boolean(vulnerabilidad) && (mascara & (1 << vulnerabilidad.bit)) !== 0;
}
