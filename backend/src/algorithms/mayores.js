import { MonticuloMinimo } from './estructuras/monticulo.js';

const sinDesempate = () => 0;

export function seleccionarMayores(elementos, cantidad, puntaje, desempatar = sinDesempate) {
  if (cantidad <= 0) {
    return [];
  }
  const comparar = (uno, otro) => puntaje(uno) - puntaje(otro) || desempatar(otro, uno);
  const monticulo = new MonticuloMinimo(comparar);
  for (const elemento of elementos) {
    if (monticulo.tamano < cantidad) {
      monticulo.insertar(elemento);
    } else if (comparar(elemento, monticulo.minimo()) > 0) {
      monticulo.reemplazarMinimo(elemento);
    }
  }
  const seleccionados = [];
  while (monticulo.tamano > 0) {
    seleccionados.push(monticulo.extraerMinimo());
  }
  return seleccionados.reverse();
}
