const estilos = getComputedStyle(document.documentElement);

const leer = (variable) => estilos.getPropertyValue(variable).trim();
const leerSerie = (prefijo, desde, hasta) =>
  Array.from({ length: hasta - desde + 1 }, (_, posicion) => leer(`${prefijo}${desde + posicion}`));

export const tema = Object.freeze({
  fuente: leer('--fuente'),
  texto: leer('--grafito'),
  textoSecundario: leer('--gris-medio'),
  borde: leer('--gris-borde'),
  fondo: leer('--blanco'),
  principal: leer('--azul-institucional'),
  oscuro: leer('--azul-oscuro'),
  alerta: leer('--alerta'),
  positivo: leer('--positivo'),
  series: leerSerie('--serie-', 1, 8),
  escala: leerSerie('--escala-', 1, 6),
  escalaSinDato: leer('--escala-sin-dato'),
  dano: [...leerSerie('--dano-', 0, 4), leer('--dano-pendiente')],
});
