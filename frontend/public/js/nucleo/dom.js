const ATRIBUTOS_OMITIDOS = new Set([false, null, undefined]);

function aplicarAtributo(elemento, nombre, valor) {
  if (ATRIBUTOS_OMITIDOS.has(valor)) {
    return;
  }
  if (nombre === 'clase') {
    elemento.className = valor;
  } else if (nombre === 'texto') {
    elemento.textContent = valor;
  } else {
    elemento.setAttribute(nombre, valor === true ? '' : valor);
  }
}

export function crear(etiqueta, atributos = {}, ...hijos) {
  const elemento = document.createElement(etiqueta);
  for (const [nombre, valor] of Object.entries(atributos)) {
    aplicarAtributo(elemento, nombre, valor);
  }
  elemento.append(...hijos.flat().filter((hijo) => !ATRIBUTOS_OMITIDOS.has(hijo)));
  return elemento;
}

export function enlaceExterno(texto, direccion, titulo) {
  return crear('a', {
    href: direccion,
    target: '_blank',
    rel: 'noopener noreferrer',
    title: titulo,
    texto,
  });
}
