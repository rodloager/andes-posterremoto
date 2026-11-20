import { crear } from '../nucleo/dom.js';

const ESPERA_MS = 200;
const LIMITE = 8;
const LETRAS_MINIMAS = 2;

export const textoDeMunicipio = ({ nombre, departamento }) => `${nombre}, ${departamento.nombre}`;

async function buscarEnLaApi(prefijo) {
  const consulta = new URLSearchParams({ prefijo, limite: String(LIMITE) });
  const respuesta = await fetch(`/api/v1/municipios?${consulta}`, {
    headers: { Accept: 'application/json' },
  });
  return respuesta.ok ? (await respuesta.json()).municipios : [];
}

export function crearBuscadorDeMunicipios({ alElegir, buscar = buscarEnLaApi, espera = ESPERA_MS }) {
  const sugerencias = crear('datalist', { id: 'sugerencias-de-municipios' });
  const entrada = crear('input', {
    type: 'search',
    id: 'buscar-municipio',
    clase: 'form-control form-control-sm',
    list: 'sugerencias-de-municipios',
    autocomplete: 'off',
    maxlength: '60',
    placeholder: 'Escribe al menos dos letras',
  });
  const porTexto = new Map();
  let temporizador = null;
  let consulta = 0;

  async function sugerir(texto) {
    const numero = ++consulta;
    const municipios = texto.length < LETRAS_MINIMAS ? [] : await buscar(texto);
    if (numero !== consulta) {
      return;
    }
    porTexto.clear();
    sugerencias.replaceChildren(
      ...municipios.map((municipio) => {
        const valor = textoDeMunicipio(municipio);
        porTexto.set(valor, municipio);
        return crear('option', { value: valor });
      }),
    );
  }

  entrada.addEventListener('input', () => {
    const elegido = porTexto.get(entrada.value);
    if (elegido) {
      clearTimeout(temporizador);
      alElegir(elegido);
      return;
    }
    clearTimeout(temporizador);
    temporizador = setTimeout(() => sugerir(entrada.value.trim()), espera);
  });

  return {
    entrada,
    sugerir,
    campo: crear('label', { for: 'buscar-municipio' }, 'Buscar municipio', entrada, sugerencias),
  };
}
