const MILISEGUNDOS_POR_DIA = 86_400_000;

const tieneValor = (valor) => Number.isFinite(valor) && valor > 0;

export function clasificar(departamentos, variable) {
  const ordenados = departamentos
    .filter(({ valores }) => tieneValor(valores[variable]))
    .sort(
      (uno, otro) =>
        otro.valores[variable] - uno.valores[variable] || uno.nombre.localeCompare(otro.nombre, 'es'),
    );
  const puestos = new Map();
  ordenados.forEach((departamento, posicion) => {
    const anterior = ordenados[posicion - 1];
    const empata = anterior && anterior.valores[variable] === departamento.valores[variable];
    puestos.set(departamento.codigo, empata ? puestos.get(anterior.codigo) : posicion + 1);
  });
  return { ordenados, puestos };
}

export function participacion(valor, total) {
  return Number.isFinite(valor) && Number.isFinite(total) && total > 0 ? (valor / total) * 100 : null;
}

export function compararDepartamentos(territorio, codigos) {
  const elegidos = codigos.map(
    (codigo) => territorio.departamentos.find((departamento) => departamento.codigo === codigo) ?? null,
  );
  return territorio.variables.map((variable) => {
    const { ordenados, puestos } = clasificar(territorio.departamentos, variable.codigo);
    const nacional = territorio.nacional[variable.codigo] ?? null;
    return {
      variable,
      nacional,
      conDato: ordenados.length,
      departamentos: elegidos.map((departamento) => {
        const valor = departamento?.valores[variable.codigo] ?? null;
        return {
          valor,
          participacion: participacion(valor, nacional),
          puesto: departamento ? (puestos.get(departamento.codigo) ?? null) : null,
        };
      }),
    };
  });
}

export function departamentosIniciales(territorio, solicitados, variable = 'personas') {
  const validos = new Set(territorio.departamentos.map(({ codigo }) => codigo));
  const { ordenados } = clasificar(territorio.departamentos, variable);
  const respaldo = [...ordenados, ...territorio.departamentos].map(({ codigo }) => codigo);
  const elegidos = [];
  for (const codigo of [...solicitados, ...respaldo]) {
    if (validos.has(codigo) && !elegidos.includes(codigo)) {
      elegidos.push(codigo);
    }
    if (elegidos.length === 2) {
      break;
    }
  }
  return elegidos;
}

function unPuntoPorFecha(serie) {
  const porFecha = new Map();
  for (const punto of serie) {
    const actual = porFecha.get(punto.fechaCorte);
    if (!actual || punto.valor > actual.valor) {
      porFecha.set(punto.fechaCorte, punto);
    }
  }
  return [...porFecha.values()].sort((uno, otro) => uno.fechaCorte.localeCompare(otro.fechaCorte));
}

export function compararCortes(serie) {
  const puntos = unPuntoPorFecha(serie);
  if (puntos.length < 2) {
    return null;
  }
  const primero = puntos[0];
  const ultimo = puntos.at(-1);
  const absoluta = ultimo.valor - primero.valor;
  return {
    primero,
    ultimo,
    cortes: puntos.length,
    absoluta,
    relativa: primero.valor === 0 ? null : (absoluta / primero.valor) * 100,
    dias: Math.round((Date.parse(ultimo.fechaCorte) - Date.parse(primero.fechaCorte)) / MILISEGUNDOS_POR_DIA),
  };
}

export function indicadoresConVariosCortes(indicadores) {
  return indicadores.flatMap((indicador) => {
    const comparacion = compararCortes(indicador.serie);
    return comparacion ? [{ indicador, ...comparacion }] : [];
  });
}
