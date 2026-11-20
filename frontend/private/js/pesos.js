export const ESCALA_DE_PESOS = 100;

export function textoDePesos(pesos) {
  return Object.entries(pesos)
    .map(([codigo, peso]) => `${codigo}:${peso}`)
    .join(',');
}

export function repartir(pesos) {
  const total = Object.values(pesos).reduce((suma, peso) => suma + peso, 0);
  return Object.fromEntries(
    Object.entries(pesos).map(([codigo, peso]) => [
      codigo,
      total === 0 ? 0 : (peso / total) * ESCALA_DE_PESOS,
    ]),
  );
}

export function describirCambio(cambio) {
  if (cambio > 0) {
    return `Sube ${cambio}`;
  }
  return cambio < 0 ? `Baja ${Math.abs(cambio)}` : 'Igual';
}

export function pesosConfigurados(criterios) {
  return Object.fromEntries(
    criterios
      .filter(({ incluido }) => incluido)
      .map(({ codigo, pesoConfigurado }) => [codigo, Math.round(pesoConfigurado * ESCALA_DE_PESOS)]),
  );
}
