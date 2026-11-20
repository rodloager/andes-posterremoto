const ENTIDADES = Object.freeze({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' });

export function escaparHtml(valor) {
  return String(valor ?? '').replace(/[&<>"']/g, (caracter) => ENTIDADES[caracter]);
}
