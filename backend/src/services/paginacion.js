export function paginar(elementos, limite, cursor) {
  const completa = elementos.length === limite;
  return {
    elementos,
    siguiente: completa ? cursor(elementos.at(-1)) : null,
  };
}
