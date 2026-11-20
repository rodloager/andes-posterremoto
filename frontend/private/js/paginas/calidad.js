import { crear } from '/js/nucleo/dom.js';
import { formatearMomento, formatearNumero, formatearPorcentaje } from '/js/nucleo/formato.js';
import { nota, seccion } from '/js/nucleo/secciones.js';
import { crearTabla } from '/js/nucleo/tabla.js';
import { ErrorDeApi, conParametros, describirError, pedir } from '../api.js';
import { CAMPOS_DE_COMPARACION, ERRORES_DE_FILA, MOTIVOS_DE_DUPLICADO, estadoDePar } from '../etiquetas.js';
import { crearListaPaginada } from '../lista-paginada.js';
import { puede } from '../navegacion.js';
import { iniciarPaginaPrivada } from '../pagina-privada.js';

const PORCENTAJE = 100;
const FILAS_POR_PAGINA = 25;
const PARES_POR_PAGINA = 20;
const CARGAS_RECIENTES = 200;
const LONGITUD_DEL_VALOR = 60;
const CONFLICTO = 409;
const GRUPO_DE_UN_PAR = 2;
const DESTINOS = Object.freeze({ personas: 'Personas', viviendas: 'Viviendas' });
const SEXOS = Object.freeze({ F: 'mujer', M: 'hombre' });
const FILTROS_DE_PAR = Object.freeze({
  PENDIENTE: 'Por revisar',
  FUSIONADO: 'Decididos como el mismo registro',
  DISTINTO: 'Decididos como distintos',
  RESUELTO: 'Resueltos en otro par',
});

function tablaDeReglas(reglas) {
  return crearTabla({
    titulo: 'Reglas aplicadas y municipios que las activaron',
    columnas: [
      { nombre: 'Regla' },
      { nombre: 'Municipios', numerica: true },
      { nombre: 'Qué hace el sistema' },
    ],
    filas: reglas.map(({ descripcion, municipios, accion }) => [
      descripcion,
      formatearNumero(municipios),
      accion,
    ]),
  });
}

function tablaDeVacios(camposVacios, municipios) {
  return crearTabla({
    titulo: `Campos vacíos entre los ${formatearNumero(municipios)} municipios con reporte`,
    columnas: [
      { nombre: 'Campo' },
      { nombre: 'Municipios sin valor', numerica: true },
      { nombre: 'Proporción', numerica: true },
    ],
    filas: camposVacios.map(({ nombre, sinValor, proporcion }) => [
      nombre,
      formatearNumero(sinValor),
      formatearPorcentaje(proporcion * PORCENTAJE),
    ]),
  });
}

function selector(nombre, opciones) {
  return crear(
    'select',
    { clase: 'form-select form-select-sm', name: nombre },
    opciones.map(([valor, texto]) => crear('option', { value: valor, texto })),
  );
}

const campo = (etiqueta, control) => crear('label', {}, etiqueta, control);

const fallo = (error, porDefecto) => nota(describirError(error, porDefecto), { alerta: true });

const recortar = (texto) =>
  texto.length > LONGITUD_DEL_VALOR ? `${texto.slice(0, LONGITUD_DEL_VALOR - 1)}…` : texto;

function comoTexto(valor) {
  if (valor === null || valor === undefined || valor === '') {
    return '(vacío)';
  }
  return recortar(typeof valor === 'object' ? JSON.stringify(valor) : String(valor));
}

function describirContenido({ estructural, contenido }) {
  if (estructural && Array.isArray(contenido?.valores)) {
    return contenido.valores.map(comoTexto).join(' | ');
  }
  if (estructural && typeof contenido?.texto === 'string') {
    return contenido.texto;
  }
  return Object.entries(contenido ?? {})
    .map(([clave, valor]) => `${clave}: ${comoTexto(valor)}`)
    .join(' · ');
}

function listaDeErrores(errores) {
  return crear(
    'ul',
    { clase: 'lista-errores' },
    errores.map(({ campo: nombre, mensaje }) =>
      crear('li', { texto: nombre ? `${nombre}: ${mensaje}` : mensaje }),
    ),
  );
}

function tablaDeMotivos(rechazosPorMotivo) {
  return crearTabla({
    titulo: 'Filas rechazadas por motivo, sumando todas las cargas',
    columnas: [
      { nombre: 'Motivo' },
      { nombre: 'Campo' },
      { nombre: 'Conjunto' },
      { nombre: 'Filas', numerica: true },
    ],
    filas: rechazosPorMotivo.map(({ conjunto, codigo, campo: nombre, filas }) => [
      ERRORES_DE_FILA[codigo] ?? codigo,
      nombre ?? 'Fila completa',
      conjunto,
      formatearNumero(filas),
    ]),
  });
}

function crearListaDeRechazos(id) {
  return crearListaPaginada({
    titulo: `Filas rechazadas de la carga ${id}, en el orden del archivo`,
    ruta: `/admin/cargas/${id}/rechazos`,
    filtros: { limite: FILAS_POR_PAGINA },
    vacio: 'Esta carga no rechazó filas.',
    columnas: [{ nombre: 'Fila', numerica: true }, { nombre: 'Motivos' }, { nombre: 'Contenido de la fila' }],
    aFila: (rechazo) => [
      formatearNumero(rechazo.fila),
      listaDeErrores(rechazo.errores),
      crear('span', { clase: 'dato-corto', texto: describirContenido(rechazo) }),
    ],
  });
}

function cargaPedida() {
  const valor = Number(new URLSearchParams(window.location.search).get('carga'));
  return Number.isInteger(valor) && valor > 0 ? valor : null;
}

async function seccionRechazos(rechazosPorMotivo) {
  const encabezado = {
    id: 'filas-rechazadas',
    titulo: 'Filas rechazadas',
    descripcion:
      'Cada fila con errores se guarda aparte, con su número de fila en el archivo, los motivos y su contenido, y no detiene la carga. Los identificadores personales se ocultan antes de guardarse.',
  };
  if (rechazosPorMotivo.length === 0) {
    return seccion(encabezado, nota('Ninguna carga ha rechazado filas.'));
  }
  const { elementos } = await pedir(conParametros('/admin/ejecuciones', { limite: CARGAS_RECIENTES }));
  const opciones = elementos
    .filter(({ filasRechazadas }) => filasRechazadas > 0)
    .map((carga) => [
      String(carga.id),
      `Carga ${carga.id} · ${carga.nombreArchivo ?? carga.conjunto} · ${formatearNumero(carga.filasRechazadas)} rechazadas`,
    ]);
  const pedida = cargaPedida();
  if (pedida && !opciones.some(([valor]) => valor === String(pedida))) {
    opciones.unshift([String(pedida), `Carga ${pedida}`]);
  }
  if (opciones.length === 0) {
    return seccion(
      encabezado,
      tablaDeMotivos(rechazosPorMotivo),
      nota(`Ninguna de las ${CARGAS_RECIENTES} cargas más recientes rechazó filas.`),
    );
  }
  const control = selector('carga', opciones);
  if (pedida) {
    control.value = String(pedida);
  }
  const contenedor = crear('div');
  async function mostrar() {
    const lista = crearListaDeRechazos(Number(control.value));
    contenedor.replaceChildren(lista.elemento);
    try {
      await lista.cargar();
    } catch (error) {
      contenedor.replaceChildren(fallo(error, 'No se pudieron cargar las filas rechazadas.'));
    }
  }
  control.addEventListener('change', mostrar);
  await mostrar();
  return seccion(
    encabezado,
    tablaDeMotivos(rechazosPorMotivo),
    crear('div', { clase: 'filtros' }, campo('Carga', control)),
    contenedor,
  );
}

function tablaDePendientes(pendientes) {
  return crearTabla({
    titulo: 'Pares por revisar y registros que esperan una decisión',
    columnas: [
      { nombre: 'Tipo de registro' },
      { nombre: 'Pares por revisar', numerica: true },
      { nombre: 'Registros en revisión', numerica: true },
    ],
    filas: Object.entries(DESTINOS).map(([destino, nombre]) => [
      nombre,
      formatearNumero(pendientes[destino].pares),
      formatearNumero(pendientes[destino].registros),
    ]),
  });
}

function describirRegistro(destino, registro) {
  const partes =
    destino === 'personas'
      ? [
          registro.nombre,
          registro.edad === null ? 'edad sin dato' : `${registro.edad} años`,
          SEXOS[registro.sexo] ?? 'sexo sin dato',
        ]
      : [
          registro.direccion,
          registro.zona === 'RURAL' ? 'zona rural' : 'zona urbana',
          registro.estrato === null ? 'estrato sin dato' : `estrato ${registro.estrato}`,
        ];
  return crear(
    'div',
    { clase: 'registro-de-par' },
    crear('span', { texto: partes.join(' · ') }),
    crear('span', {
      clase: 'detalle-de-celda',
      texto: `${registro.nombreMunicipio} · registro ${registro.id} · carga ${registro.carga}, fila ${formatearNumero(registro.fila)}`,
    }),
  );
}

function describirParecido(par) {
  const detalle = Object.entries(par.detalle ?? {})
    .filter(([nombre]) => CAMPOS_DE_COMPARACION[nombre])
    .map(([nombre, valor]) => `${CAMPOS_DE_COMPARACION[nombre]} ${formatearPorcentaje(valor * PORCENTAJE)}`)
    .join(' · ');
  return crear(
    'div',
    { clase: 'registro-de-par' },
    crear('span', {
      texto: `${formatearPorcentaje(par.similitud * PORCENTAJE)} · ${MOTIVOS_DE_DUPLICADO[par.motivo] ?? par.motivo}`,
    }),
    detalle ? crear('span', { clase: 'detalle-de-celda', texto: detalle }) : null,
  );
}

function describirGrupo(grupo) {
  if (!grupo) {
    return '—';
  }
  const texto =
    grupo.registros > GRUPO_DE_UN_PAR
      ? `${formatearNumero(grupo.registros)} registros enlazados`
      : 'Solo este par';
  return crear('span', { clase: 'sin-corte', texto });
}

function textoDeDecision(resultado) {
  if (resultado.decision === 'MISMO') {
    return `Mismo registro: quedó fusionado con el registro ${resultado.registro.fusionadoCon}.`;
  }
  if (resultado.registro.estado === 'VIGENTE') {
    return 'Distintos: el registro quedó vigente y ya cuenta en las estadísticas.';
  }
  return `Distintos: el registro sigue en revisión por ${formatearNumero(resultado.pendientes)} pares más.`;
}

function crearDecision(par, alDecidir) {
  const celda = crear('div', { clase: 'decision' });
  const mensaje = crear('span', { clase: 'detalle-de-celda', role: 'status' });
  const botones = [
    ['MISMO', 'Es el mismo', 'btn-outline-primary'],
    ['DISTINTO', 'Son distintos', 'btn-outline-secondary'],
  ].map(([decision, texto, estilo]) => {
    const boton = crear('button', {
      type: 'button',
      clase: `btn btn-sm ${estilo}`,
      texto,
      'aria-label': `${texto}: par ${par.id}`,
    });
    boton.addEventListener('click', () => decidir(decision));
    return boton;
  });

  function cerrar(texto) {
    celda.replaceChildren(crear('span', { texto }));
  }

  async function decidir(decision) {
    botones.forEach((boton) => {
      boton.disabled = true;
    });
    mensaje.textContent = 'Guardando…';
    try {
      const { decision: resultado } = await pedir(`/admin/duplicados/${par.id}/decision`, {
        metodo: 'POST',
        cuerpo: { decision },
      });
      cerrar(textoDeDecision(resultado));
      await alDecidir(par, resultado);
    } catch (error) {
      if (error instanceof ErrorDeApi && error.estado === CONFLICTO) {
        cerrar(describirError(error, 'Este par ya tiene una decisión.'));
        return;
      }
      mensaje.textContent = describirError(error, 'No fue posible guardar la decisión.');
      botones.forEach((boton) => {
        boton.disabled = false;
      });
    }
  }

  celda.append(...botones, mensaje);
  return { elemento: celda, cerrar };
}

function crearColaDePares({ destino, estado, alDecidir }) {
  const decisionesPorRegistro = new Map();

  async function trasDecidir(par, resultado) {
    if (resultado.decision === 'MISMO') {
      for (const otra of decisionesPorRegistro.get(par.nuevo.id) ?? []) {
        if (otra.par !== par.id) {
          otra.cerrar('Resuelto: el registro ya se fusionó en otro par.');
        }
      }
    }
    await alDecidir();
  }

  function celdaDeDecision(par) {
    if (par.estado !== 'PENDIENTE') {
      return crear(
        'div',
        { clase: 'registro-de-par' },
        estadoDePar(par.estado),
        par.decididoEn
          ? crear('span', { clase: 'detalle-de-celda', texto: formatearMomento(par.decididoEn) })
          : null,
      );
    }
    const decision = crearDecision(par, trasDecidir);
    const delRegistro = decisionesPorRegistro.get(par.nuevo.id) ?? [];
    delRegistro.push({ par: par.id, cerrar: decision.cerrar });
    decisionesPorRegistro.set(par.nuevo.id, delRegistro);
    return decision.elemento;
  }

  return crearListaPaginada({
    titulo: `${DESTINOS[destino]}: ${FILTROS_DE_PAR[estado].toLowerCase()}`,
    ruta: '/admin/duplicados',
    filtros: { destino, estado, limite: PARES_POR_PAGINA },
    vacio: estado === 'PENDIENTE' ? 'No hay pares por revisar.' : 'No hay pares en este estado.',
    columnas: [
      { nombre: 'Par', numerica: true },
      { nombre: 'Registro nuevo' },
      { nombre: 'Registro con el que coincide' },
      { nombre: 'Parecido' },
      { nombre: 'Grupo' },
      { nombre: 'Decisión' },
    ],
    aFila: (par) => [
      formatearNumero(par.id),
      describirRegistro(destino, par.nuevo),
      describirRegistro(destino, par.candidato),
      describirParecido(par),
      describirGrupo(par.grupo),
      celdaDeDecision(par),
    ],
  });
}

async function seccionDuplicados(usuario, pendientes) {
  const encabezado = {
    titulo: 'Duplicados por revisar',
    descripcion:
      'Un registro con el mismo identificador que otro ya cargado se descarta. Si coincide con otro por clave natural o se le parece mucho, queda en revisión y no cuenta en las estadísticas hasta que alguien decide. Cada decisión queda en el historial.',
  };
  const resumen = crear('div', {}, tablaDePendientes(pendientes));
  if (!puede(usuario, 'datos:editar')) {
    return seccion(
      encabezado,
      resumen,
      nota(
        'Tu rol puede ver cuántos pares esperan revisión, pero no decidir. La cola muestra nombres y direcciones, así que solo la ven los roles con permiso para editar datos.',
      ),
    );
  }
  const destino = selector('destino', Object.entries(DESTINOS));
  destino.value = pendientes.viviendas.pares > pendientes.personas.pares ? 'viviendas' : 'personas';
  const estado = selector('estado', Object.entries(FILTROS_DE_PAR));
  const contenedor = crear('div');

  async function actualizarResumen() {
    const { duplicadosPendientes } = await pedir('/admin/calidad/registros');
    resumen.replaceChildren(tablaDePendientes(duplicadosPendientes));
  }

  async function mostrar() {
    const cola = crearColaDePares({
      destino: destino.value,
      estado: estado.value,
      alDecidir: actualizarResumen,
    });
    contenedor.replaceChildren(cola.elemento);
    try {
      await cola.cargar();
    } catch (error) {
      contenedor.replaceChildren(fallo(error, 'No se pudo cargar la cola de revisión.'));
    }
  }

  destino.addEventListener('change', mostrar);
  estado.addEventListener('change', mostrar);
  await mostrar();
  return seccion(
    encabezado,
    resumen,
    crear('div', { clase: 'filtros' }, campo('Tipo de registro', destino), campo('Estado', estado)),
    contenedor,
  );
}

iniciarPaginaPrivada(async (usuario) => {
  const [calidad, registros] = await Promise.all([
    pedir('/admin/calidad'),
    pedir('/admin/calidad/registros'),
  ]);
  const [duplicados, rechazos] = await Promise.all([
    seccionDuplicados(usuario, registros.duplicadosPendientes),
    seccionRechazos(registros.rechazosPorMotivo),
  ]);
  return [
    seccion(
      {
        titulo: 'Carga vigente del reporte por municipio',
        descripcion: `Carga ${calidad.carga.id}, terminada el ${formatearMomento(calidad.carga.finalizadaEn)}: ${formatearNumero(calidad.carga.filasLeidas)} filas leídas y ${formatearNumero(calidad.municipios)} municipios con reporte.`,
      },
      tablaDeReglas(calidad.reglas),
    ),
    seccion(
      {
        titulo: 'Campos vacíos',
        descripcion: 'Calculado en la base de datos sobre la carga vigente.',
      },
      tablaDeVacios(calidad.camposVacios, calidad.municipios),
      nota(
        'Un campo vacío no es un cero. La fuente no distingue entre «no hubo casos» y «no se reportó», así que el sistema guarda el vacío tal cual.',
        { alerta: true },
      ),
    ),
    duplicados,
    rechazos,
  ];
});
