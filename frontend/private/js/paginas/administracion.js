import { crearSello } from '/js/componentes/sello.js';
import { cargar } from '/js/nucleo/datos.js';
import { crear } from '/js/nucleo/dom.js';
import {
  formatearCantidad,
  formatearDuracion,
  formatearFecha,
  formatearMomento,
  formatearNumero,
} from '/js/nucleo/formato.js';
import { nota, seccion } from '/js/nucleo/secciones.js';
import { crearTabla } from '/js/nucleo/tabla.js';
import { describirError, enviarArchivo, pedir } from '../api.js';
import {
  ACCIONES,
  ALERTAS,
  ALERTAS_DEL_REPORTE_MUNICIPAL,
  describirAlertas,
  estadoDeCarga,
  resumirCambios,
} from '../etiquetas.js';
import { crearListaPaginada } from '../lista-paginada.js';
import { puede } from '../navegacion.js';
import { estado, iniciarPaginaPrivada } from '../pagina-privada.js';

const REGISTROS_POR_PAGINA = 25;
const MILISEGUNDOS_POR_SEGUNDO = 1000;
const SIN_FECHA = 'Sin fecha';

const fechaODefecto = (fecha) => (fecha ? formatearFecha(fecha) : SIN_FECHA);
const INTERVALO_DE_SEGUIMIENTO_MS = 1500;
const ESTADOS_FINALES = new Set(['TERMINADA', 'FALLIDA']);
const esperar = (milisegundos) => new Promise((resolver) => setTimeout(resolver, milisegundos));

function duracionDe({ iniciadaEn, finalizadaEn }) {
  if (!finalizadaEn) {
    return 'En curso';
  }
  return formatearDuracion((Date.parse(finalizadaEn) - Date.parse(iniciadaEn)) / MILISEGUNDOS_POR_SEGUNDO);
}

function tablaDeConjuntos(conjuntos) {
  return crearTabla({
    titulo: 'Conjuntos registrados y su última carga',
    columnas: [
      { nombre: 'Conjunto' },
      { nombre: 'Fuente' },
      { nombre: 'Origen' },
      { nombre: 'Registros vigentes', numerica: true },
      { nombre: 'Última carga' },
      { nombre: 'Estado' },
    ],
    filas: conjuntos.map((conjunto) => [
      conjunto.nombre,
      conjunto.fuente.nombre,
      crearSello(conjunto.fuente.origen, conjunto.fuente.nivel),
      formatearNumero(conjunto.registros),
      conjunto.ultimaCarga?.finalizadaEn ? formatearMomento(conjunto.ultimaCarga.finalizadaEn) : 'Sin cargas',
      conjunto.ultimaCarga ? estadoDeCarga(conjunto.ultimaCarga.estado) : estado('Sin cargas', 'atencion'),
    ]),
  });
}

async function seccionConjuntos() {
  const contenedor = crear('div');
  async function actualizar() {
    const { conjuntos } = await pedir('/admin/conjuntos');
    contenedor.replaceChildren(tablaDeConjuntos(conjuntos));
  }
  await actualizar();
  return {
    actualizar,
    elemento: seccion(
      {
        titulo: 'Conjuntos de datos',
        descripcion:
          'Cada conjunto se alimenta de una fuente, se define en un archivo YAML y guarda el resultado de cada carga.',
      },
      contenedor,
    ),
  };
}

function crearFormularioDeImportacion(importables, alTerminar) {
  const selector = crear(
    'select',
    { clase: 'form-select form-select-sm', name: 'conjunto' },
    importables.map(({ id, nombre, origen }) =>
      crear('option', { value: id, texto: `${nombre} · ${origen}` }),
    ),
  );
  const archivo = crear('input', { type: 'file', clase: 'form-control form-control-sm', name: 'archivo' });
  const ayuda = crear('p', { clase: 'nota' });
  const mensaje = crear('p', { clase: 'nota', role: 'status', hidden: true });
  const boton = crear('button', { type: 'submit', clase: 'btn btn-primary btn-sm', texto: 'Importar' });
  const seleccionado = () => importables.find(({ id }) => id === selector.value);

  function actualizarAyuda() {
    const { formatos } = seleccionado();
    archivo.accept = formatos.map((formato) => `.${formato}`).join(',');
    ayuda.textContent = `Formatos aceptados: ${formatos.map((formato) => formato.toUpperCase()).join(', ')}. Tamaño máximo: 250 MB. Cada fila se valida por separado: las que tienen errores se guardan aparte con su motivo y no detienen la carga.`;
  }

  function avisar(texto, alerta = false) {
    mensaje.textContent = texto;
    mensaje.className = alerta ? 'nota nota--alerta' : 'nota';
    mensaje.hidden = false;
  }

  async function seguir(id) {
    for (;;) {
      const { carga } = await pedir(`/admin/cargas/${id}`);
      if (ESTADOS_FINALES.has(carga.estado)) {
        return carga;
      }
      avisar(
        carga.estado === 'EN_COLA'
          ? `La carga ${id} está en cola.`
          : `La carga ${id} está en curso: ${formatearNumero(carga.filasConfirmadas)} filas confirmadas.`,
      );
      await esperar(INTERVALO_DE_SEGUIMIENTO_MS);
    }
  }

  async function importar(evento) {
    evento.preventDefault();
    const [elegido] = archivo.files;
    if (!elegido) {
      avisar('Elige un archivo para importar.', true);
      return;
    }
    const datos = new FormData();
    datos.append('conjunto', selector.value);
    datos.append('archivo', elegido);
    boton.disabled = true;
    avisar(`Subiendo ${elegido.name}…`);
    try {
      const { carga, trabajadorActivo } = await enviarArchivo('/admin/cargas', datos);
      await alTerminar();
      if (!trabajadorActivo) {
        avisar(
          `La carga ${carga.id} quedó en cola. El proceso del ETL no está activo en este servidor: ejecute npm run etl -- trabajar para procesarla.`,
          true,
        );
        return;
      }
      const final = await seguir(carga.id);
      avisar(
        final.estado === 'TERMINADA'
          ? `Carga ${final.id} terminada. ${final.mensaje}`
          : `La carga ${final.id} falló: ${final.mensaje}`,
        final.estado !== 'TERMINADA',
      );
      archivo.value = '';
      await alTerminar();
    } catch (error) {
      avisar(describirError(error, 'No fue posible importar el archivo.'), true);
    } finally {
      boton.disabled = false;
    }
  }

  selector.addEventListener('change', actualizarAyuda);
  actualizarAyuda();
  const formulario = crear(
    'form',
    { clase: 'panel formulario-fuente' },
    crear('h3', { texto: 'Importar un archivo' }),
    campo('Conjunto de datos', selector),
    campo('Archivo', archivo),
    ayuda,
    crear('div', { clase: 'acciones' }, boton),
    mensaje,
  );
  formulario.addEventListener('submit', importar);
  return formulario;
}

async function seccionImportacion(usuario, alTerminar) {
  const descripcion =
    'El archivo entra a una cola y lo procesa el ETL en un proceso aparte, por lotes de 5.000 filas. Un archivo idéntico a otro ya cargado se rechaza por su huella SHA-256.';
  if (!puede(usuario, 'datos:importar')) {
    return seccion(
      { titulo: 'Importar archivos', descripcion },
      nota('Tu rol puede consultar las cargas, pero no importar archivos.'),
    );
  }
  const { conjuntos } = await pedir('/admin/importables');
  return seccion(
    { titulo: 'Importar archivos', descripcion },
    crearFormularioDeImportacion(conjuntos, alTerminar),
  );
}

function tablaDeFuentes(fuentes) {
  return crearTabla({
    titulo: 'Fuentes de las cifras publicadas',
    columnas: [
      { nombre: 'Fuente' },
      { nombre: 'Origen' },
      { nombre: 'Fecha de consulta' },
      { nombre: 'Limitaciones' },
    ],
    filas: fuentes.map((fuente) => [
      fuente.sigla ?? fuente.entidad,
      crearSello(fuente.origen, fuente.nivel),
      fechaODefecto(fuente.fechaConsulta),
      crear('span', { clase: 'dato-corto', texto: fuente.limitaciones }),
    ]),
  });
}

function campo(etiqueta, control) {
  return crear('label', {}, etiqueta, control);
}

function crearFormularioDeFuente(fuentes, alGuardar) {
  const selector = crear(
    'select',
    { clase: 'form-select form-select-sm', name: 'fuente' },
    fuentes.map((fuente) => crear('option', { value: fuente.id, texto: fuente.sigla ?? fuente.entidad })),
  );
  const fecha = crear('input', {
    type: 'date',
    clase: 'form-control form-control-sm',
    name: 'fechaConsulta',
  });
  const limitaciones = crear('textarea', {
    clase: 'form-control form-control-sm',
    name: 'limitaciones',
    maxlength: '2000',
  });
  const mensaje = crear('p', { clase: 'nota', role: 'status', hidden: true });
  const boton = crear('button', {
    type: 'submit',
    clase: 'btn btn-primary btn-sm',
    texto: 'Guardar cambios',
  });
  const seleccionada = () => fuentes.find(({ id }) => id === selector.value);

  function rellenar() {
    fecha.value = seleccionada().fechaConsulta ?? '';
    limitaciones.value = seleccionada().limitaciones;
  }

  function cambios() {
    const actual = seleccionada();
    const propuestos = { fechaConsulta: fecha.value, limitaciones: limitaciones.value.trim() };
    return Object.fromEntries(
      Object.entries(propuestos).filter(([clave, valor]) => valor && valor !== actual[clave]),
    );
  }

  function avisar(texto, alerta = false) {
    mensaje.textContent = texto;
    mensaje.className = alerta ? 'nota nota--alerta' : 'nota';
    mensaje.hidden = false;
  }

  async function guardar(evento) {
    evento.preventDefault();
    const cuerpo = cambios();
    if (Object.keys(cuerpo).length === 0) {
      avisar('No hay cambios para guardar.', true);
      return;
    }
    boton.disabled = true;
    try {
      const { fuente } = await pedir(`/admin/fuentes/${selector.value}`, { metodo: 'PATCH', cuerpo });
      Object.assign(seleccionada(), {
        fechaConsulta: fuente.fechaConsulta,
        limitaciones: fuente.limitaciones,
      });
      avisar('Cambios guardados. Quedaron registrados en el historial con tu usuario.');
      await alGuardar();
    } catch (error) {
      avisar(describirError(error, 'No fue posible guardar los cambios.'), true);
    } finally {
      boton.disabled = false;
    }
  }

  selector.addEventListener('change', rellenar);
  rellenar();
  const formulario = crear(
    'form',
    { clase: 'panel formulario-fuente' },
    crear('h3', { texto: 'Actualizar una fuente' }),
    campo('Fuente', selector),
    campo('Fecha de consulta', fecha),
    campo('Limitaciones', limitaciones),
    crear('div', { clase: 'acciones' }, boton),
    mensaje,
  );
  formulario.addEventListener('submit', guardar);
  return formulario;
}

async function seccionFuentes(usuario, historial) {
  const { fuentes } = await pedir('/fuentes');
  const deIndicadores = fuentes.filter(({ uso }) => uso === 'indicadores');
  const tabla = crear('div', {}, tablaDeFuentes(deIndicadores));
  const edicion = puede(usuario, 'datos:importar')
    ? crearFormularioDeFuente(deIndicadores, async () => {
        tabla.replaceChildren(tablaDeFuentes(deIndicadores));
        await historial.reiniciar();
      })
    : nota('Tu rol puede consultar las fuentes, pero no modificarlas.');
  return seccion(
    {
      titulo: 'Fuentes de información',
      descripcion:
        'Cada cambio exige permiso para gestionar fuentes y queda en el historial con el valor anterior.',
    },
    tabla,
    edicion,
  );
}

function selectorDeFiltro(etiqueta, nombre, opciones) {
  const control = crear(
    'select',
    { clase: 'form-select form-select-sm', name: nombre },
    crear('option', { value: '', texto: 'Todos' }),
    opciones.map(({ valor, texto }) => crear('option', { value: valor, texto })),
  );
  return { control, elemento: campo(etiqueta, control) };
}

async function seccionRegistros() {
  const limites = await cargar('geo/departamentos');
  const departamentos = limites.features
    .map(({ properties }) => ({ valor: properties.codigo, texto: properties.nombre }))
    .sort((uno, otro) => uno.texto.localeCompare(otro.texto, 'es'));
  const porDepartamento = selectorDeFiltro('Departamento', 'departamento', departamentos);
  const porAlerta = selectorDeFiltro(
    'Alerta',
    'alerta',
    ALERTAS_DEL_REPORTE_MUNICIPAL.map((valor) => ({ valor, texto: ALERTAS[valor] })),
  );
  const lista = crearListaPaginada({
    titulo: 'Reportes municipales vigentes',
    ruta: '/admin/registros',
    filtros: { limite: REGISTROS_POR_PAGINA },
    vacio: 'No hay registros con estos filtros.',
    columnas: [
      { nombre: 'Municipio' },
      { nombre: 'Departamento' },
      { nombre: 'Fecha del reporte' },
      { nombre: 'Familias', numerica: true },
      { nombre: 'Viviendas destruidas', numerica: true },
      { nombre: 'Fallecidos', numerica: true },
      { nombre: 'Alertas' },
    ],
    aFila: (registro) => [
      `${registro.nombre} (${registro.municipio})`,
      registro.nombreDepartamento,
      fechaODefecto(registro.fechaReporte),
      formatearCantidad(registro.valores.familias),
      formatearCantidad(registro.valores.viviendasDestruidas),
      formatearCantidad(registro.valores.fallecidos),
      describirAlertas(registro.alertas),
    ],
  });
  const filtrar = () =>
    lista.reiniciar({
      limite: REGISTROS_POR_PAGINA,
      departamento: porDepartamento.control.value,
      alerta: porAlerta.control.value,
    });
  porDepartamento.control.addEventListener('change', filtrar);
  porAlerta.control.addEventListener('change', filtrar);
  await lista.cargar();
  return seccion(
    {
      titulo: 'Explorador de registros',
      descripcion: 'Registros de la carga vigente, ordenados por código DIVIPOLA y paginados por clave.',
    },
    crear('div', { clase: 'filtros' }, porDepartamento.elemento, porAlerta.elemento),
    lista.elemento,
  );
}

function enlaceARechazos(carga) {
  if (carga.filasRechazadas === 0) {
    return formatearNumero(0);
  }
  return crear('a', {
    href: `/privado/calidad?carga=${carga.id}#filas-rechazadas`,
    texto: formatearNumero(carga.filasRechazadas),
  });
}

function crearListaDeCargas() {
  return crearListaPaginada({
    titulo: 'Ejecuciones del proceso de carga, de la más reciente a la más antigua',
    ruta: '/admin/ejecuciones',
    filtros: { limite: 10 },
    vacio: 'Todavía no hay cargas.',
    columnas: [
      { nombre: 'Carga', numerica: true },
      { nombre: 'Inicio' },
      { nombre: 'Conjunto' },
      { nombre: 'Archivo' },
      { nombre: 'Leídas', numerica: true },
      { nombre: 'Válidas', numerica: true },
      { nombre: 'Rechazadas', numerica: true },
      { nombre: 'Duplicadas', numerica: true },
      { nombre: 'En revisión', numerica: true },
      { nombre: 'Duración', numerica: true },
      { nombre: 'Estado' },
    ],
    aFila: (carga) => [
      formatearNumero(carga.id),
      formatearMomento(carga.iniciadaEn),
      carga.conjunto,
      crear('span', { clase: 'nombre-de-archivo', texto: carga.nombreArchivo ?? carga.origenArchivo }),
      formatearNumero(carga.filasLeidas),
      formatearNumero(carga.filasValidas),
      enlaceARechazos(carga),
      formatearNumero(carga.duplicados),
      formatearNumero(carga.enRevision),
      duracionDe(carga),
      estadoDeCarga(carga.estado),
    ],
  });
}

function crearHistorial() {
  return crearListaPaginada({
    titulo: 'Cambios sobre los datos, del más reciente al más antiguo',
    ruta: '/admin/historial',
    filtros: { limite: 10 },
    vacio: 'Todavía no hay cambios registrados.',
    columnas: [
      { nombre: 'Fecha' },
      { nombre: 'Usuario' },
      { nombre: 'Acción' },
      { nombre: 'Registro' },
      { nombre: 'Antes' },
      { nombre: 'Después' },
    ],
    aFila: (cambio) => [
      formatearMomento(cambio.ocurridoEn),
      cambio.usuario?.nombre ?? 'Sistema',
      ACCIONES[cambio.accion] ?? cambio.accion,
      `${cambio.entidad} ${cambio.entidadId}`,
      crear('span', { clase: 'dato-corto', texto: resumirCambios(cambio.antes) }),
      crear('span', { clase: 'dato-corto', texto: resumirCambios(cambio.despues) }),
    ],
  });
}

iniciarPaginaPrivada(async (usuario) => {
  const historial = crearHistorial();
  const cargas = crearListaDeCargas();
  const conjuntos = await seccionConjuntos();
  const alTerminar = () => Promise.all([conjuntos.actualizar(), cargas.reiniciar(), historial.reiniciar()]);
  const [importacion, fuentes, registros] = await Promise.all([
    seccionImportacion(usuario, alTerminar),
    seccionFuentes(usuario, historial),
    seccionRegistros(),
    cargas.cargar(),
    historial.cargar(),
  ]);
  return [
    conjuntos.elemento,
    importacion,
    seccion(
      {
        titulo: 'Cargas ejecutadas',
        descripcion: 'Cada carga guarda su archivo, su huella SHA-256 y el conteo de filas por resultado.',
      },
      cargas.elemento,
    ),
    fuentes,
    registros,
    seccion(
      {
        titulo: 'Historial de modificaciones',
        descripcion: 'Cada fila se guarda en una cadena de hashes que permite detectar alteraciones.',
      },
      historial.elemento,
    ),
  ];
});
