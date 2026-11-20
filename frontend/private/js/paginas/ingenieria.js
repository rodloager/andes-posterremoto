import { crear } from '/js/nucleo/dom.js';
import {
  formatearDecimal,
  formatearDuracion,
  formatearFecha,
  formatearMilisegundos,
  formatearMomento,
  formatearNumero,
} from '/js/nucleo/formato.js';
import { seccion } from '/js/nucleo/secciones.js';
import { crearTabla } from '/js/nucleo/tabla.js';
import { describirError, pedir } from '../api.js';
import { ACCIONES, MOTIVOS_DE_ACCESO, estadoDeCarga, resumirCambios } from '../etiquetas.js';
import { crearListaPaginada } from '../lista-paginada.js';
import { puede } from '../navegacion.js';
import { estado, iniciarPaginaPrivada } from '../pagina-privada.js';

const DIAS_PARA_ALERTA = 30;

function tarjeta(nombre, valor, descripcion) {
  return crear(
    'article',
    { clase: 'indicador' },
    crear('div', { clase: 'indicador-cabecera' }, crear('h3', { clase: 'indicador-nombre', texto: nombre })),
    crear('p', { clase: 'indicador-valor' }, valor),
    crear('p', { clase: 'indicador-descripcion', texto: descripcion }),
  );
}

function tarjetasDeEstado({ servidor, baseDeDatos, solicitudes, registros }) {
  const almacenados = registros.reduce((total, { filas }) => total + filas, 0);
  return crear(
    'div',
    { clase: 'rejilla-indicadores' },
    tarjeta(
      'Servidor',
      estado('En línea', 'correcto'),
      `Node.js ${servidor.versionNode} · ${formatearDuracion(servidor.segundosEnEjecucion)} en ejecución`,
    ),
    tarjeta(
      'Base de datos',
      baseDeDatos.disponible ? estado('Conectada', 'correcto') : estado('Sin conexión', 'error'),
      baseDeDatos.disponible
        ? `PostgreSQL ${baseDeDatos.version} · respuesta en ${formatearMilisegundos(baseDeDatos.latenciaMs)} · ${formatearDecimal(baseDeDatos.tamanoMb)} MB`
        : baseDeDatos.error,
    ),
    tarjeta(
      'Tiempo de respuesta de la API',
      crear('span', { clase: 'cifra', texto: formatearMilisegundos(solicitudes.promedioMs) }),
      `Promedio de ${formatearNumero(solicitudes.solicitudes)} solicitudes desde el arranque · percentil 95: ${formatearMilisegundos(solicitudes.p95Ms)}`,
    ),
    tarjeta(
      'Registros almacenados',
      crear('span', { clase: 'cifra', texto: formatearNumero(almacenados) }),
      `En ${registros.length} tablas principales`,
    ),
  );
}

function tablaDeRecursos({ servidor, baseDeDatos }) {
  const { memoria, cargaPromedio, nucleos, retardoCicloEventos } = servidor;
  const conexiones = baseDeDatos.conexiones;
  return crearTabla({
    titulo: 'Uso de recursos del proceso',
    columnas: [{ nombre: 'Recurso' }, { nombre: 'Valor' }],
    filas: [
      ['Memoria residente', `${formatearDecimal(memoria.residenteMb)} MB`],
      [
        'Memoria del montón en uso',
        `${formatearDecimal(memoria.montonUsadoMb)} de ${formatearDecimal(memoria.montonTotalMb)} MB`,
      ],
      [
        'Carga promedio (1, 5 y 15 minutos)',
        `${cargaPromedio.map(formatearDecimal).join(' · ')} con ${nucleos} núcleos`,
      ],
      [
        'Retardo del ciclo de eventos',
        `promedio ${formatearMilisegundos(retardoCicloEventos.promedioMs)} · percentil 99 ${formatearMilisegundos(retardoCicloEventos.p99Ms)}`,
      ],
      [
        'Conexiones de la aplicación',
        `${conexiones.aplicacion.total} abiertas · ${conexiones.aplicacion.inactivas} libres · ${conexiones.aplicacion.enEspera} en espera`,
      ],
      [
        'Conexiones de lectura',
        `${conexiones.lectura.total} abiertas · ${conexiones.lectura.inactivas} libres · ${conexiones.lectura.enEspera} en espera`,
      ],
    ],
  });
}

function tablaDeConsultas({ masFrecuentes }) {
  if (masFrecuentes.length === 0) {
    return crear('p', { clase: 'estado-carga', texto: 'Todavía no hay solicitudes registradas.' });
  }
  return crearTabla({
    titulo: 'Las diez rutas más solicitadas desde el arranque',
    columnas: [
      { nombre: 'Ruta' },
      { nombre: 'Solicitudes', numerica: true },
      { nombre: 'Promedio', numerica: true },
      { nombre: 'Percentil 95', numerica: true },
      { nombre: 'Errores', numerica: true },
    ],
    filas: masFrecuentes.map((ruta) => [
      crear('code', { texto: ruta.ruta }),
      formatearNumero(ruta.solicitudes),
      formatearMilisegundos(ruta.promedioMs),
      formatearMilisegundos(ruta.p95Ms),
      formatearNumero(ruta.errores),
    ]),
  });
}

function tablaDeProcesos(procesos) {
  return crearTabla({
    titulo: 'Últimos procesos de carga',
    columnas: [
      { nombre: 'Inicio' },
      { nombre: 'Conjunto' },
      { nombre: 'Filas leídas', numerica: true },
      { nombre: 'Filas válidas', numerica: true },
      { nombre: 'Alertas', numerica: true },
      { nombre: 'Estado' },
    ],
    filas: procesos.map((proceso) => [
      formatearMomento(proceso.iniciadaEn),
      proceso.conjunto,
      formatearNumero(proceso.filasLeidas),
      formatearNumero(proceso.filasValidas),
      formatearNumero(proceso.alertas),
      estadoDeCarga(proceso.estado),
    ]),
  });
}

function tablaDeFuentes(fuentes) {
  return crearTabla({
    titulo: 'Última consulta de cada fuente de las cifras publicadas',
    columnas: [{ nombre: 'Fuente' }, { nombre: 'Fecha de consulta' }, { nombre: 'Antigüedad' }],
    filas: fuentes.map((fuente) => [
      fuente.nombre,
      fuente.fechaConsulta ? formatearFecha(fuente.fechaConsulta) : 'No aplica',
      fuente.diasDesdeConsulta === null
        ? 'No aplica'
        : estado(
            `${fuente.diasDesdeConsulta} días`,
            fuente.diasDesdeConsulta > DIAS_PARA_ALERTA ? 'atencion' : 'correcto',
          ),
    ]),
  });
}

function tablaDeRegistros(registros) {
  return crearTabla({
    titulo: 'Filas por tabla',
    columnas: [{ nombre: 'Tabla' }, { nombre: 'Filas', numerica: true }],
    filas: registros.map(({ tabla, filas }) => [crear('code', { texto: tabla }), formatearNumero(filas)]),
  });
}

function tablaDeErrores(errores) {
  if (errores.length === 0) {
    return crear('p', { clase: 'estado-carga', texto: 'Sin errores del servidor desde el arranque.' });
  }
  return crearTabla({
    titulo: 'Errores recientes del servidor',
    columnas: [
      { nombre: 'Fecha' },
      { nombre: 'Ruta' },
      { nombre: 'Estado', numerica: true },
      { nombre: 'Detalle' },
    ],
    filas: errores.map((error) => [
      formatearMomento(error.fecha),
      crear('code', { texto: error.ruta }),
      String(error.estado),
      error.mensaje,
    ]),
  });
}

function seccionesDeEstado(estadoDelSistema) {
  return [
    seccion({ titulo: 'Estado del sistema' }, tarjetasDeEstado(estadoDelSistema)),
    seccion({ titulo: 'Uso de recursos' }, tablaDeRecursos(estadoDelSistema)),
    seccion(
      {
        titulo: 'Consultas más frecuentes',
        descripcion: 'Se eligen con un montículo de tamaño diez, sin ordenar todas las rutas.',
      },
      tablaDeConsultas(estadoDelSistema.solicitudes),
    ),
    seccion({ titulo: 'Procesos de carga' }, tablaDeProcesos(estadoDelSistema.procesosEtl)),
    seccion({ titulo: 'Fuentes' }, tablaDeFuentes(estadoDelSistema.fuentes)),
    seccion({ titulo: 'Registros almacenados' }, tablaDeRegistros(estadoDelSistema.registros)),
    seccion({ titulo: 'Errores recientes' }, tablaDeErrores(estadoDelSistema.erroresRecientes)),
  ];
}

async function crearPanelDeEstado() {
  const contenedor = crear('div');
  const boton = crear('button', {
    type: 'button',
    clase: 'btn btn-sm btn-outline-primary',
    texto: 'Actualizar',
  });
  const marca = crear('span', { clase: 'text-secondary small' });
  async function actualizar() {
    boton.disabled = true;
    const estadoDelSistema = await pedir('/ingenieria/estado');
    marca.textContent = `Actualizado: ${formatearMomento(estadoDelSistema.generadoEn)}`;
    contenedor.replaceChildren(...seccionesDeEstado(estadoDelSistema));
    boton.disabled = false;
  }
  boton.addEventListener('click', actualizar);
  await actualizar();
  return [crear('div', { clase: 'acciones mb-3' }, boton, marca), contenedor];
}

function crearVerificacion() {
  const resultado = crear('p', { clase: 'nota', role: 'status', hidden: true });
  const boton = crear('button', {
    type: 'button',
    clase: 'btn btn-sm btn-primary',
    texto: 'Verificar integridad',
  });
  boton.addEventListener('click', async () => {
    boton.disabled = true;
    try {
      const { registros, integra, primerRegistroAlterado } = await pedir(
        '/ingenieria/auditoria/verificacion',
      );
      resultado.className = integra ? 'nota' : 'nota nota--alerta';
      resultado.textContent = integra
        ? `La cadena de ${formatearNumero(registros)} registros está íntegra.`
        : `Se detectó una alteración a partir del registro ${primerRegistroAlterado}.`;
    } catch (error) {
      resultado.className = 'nota nota--alerta';
      resultado.textContent = describirError(error, 'No fue posible verificar la auditoría.');
    }
    resultado.hidden = false;
    boton.disabled = false;
  });
  return crear('div', { clase: 'panel' }, crear('div', { clase: 'acciones mt-0' }, boton), resultado);
}

async function seccionesDeAuditoria() {
  const auditoria = crearListaPaginada({
    titulo: 'Operaciones registradas, de la más reciente a la más antigua',
    ruta: '/ingenieria/auditoria',
    filtros: { limite: 10 },
    vacio: 'Todavía no hay operaciones registradas.',
    columnas: [
      { nombre: 'Fecha' },
      { nombre: 'Usuario' },
      { nombre: 'Acción' },
      { nombre: 'Registro' },
      { nombre: 'Cambio' },
    ],
    aFila: (cambio) => [
      formatearMomento(cambio.ocurridoEn),
      cambio.usuario?.nombre ?? 'Sistema',
      ACCIONES[cambio.accion] ?? cambio.accion,
      `${cambio.entidad} ${cambio.entidadId}`,
      crear('span', { clase: 'dato-corto', texto: resumirCambios(cambio.despues) }),
    ],
  });
  const accesos = crearListaPaginada({
    titulo: 'Intentos de acceso, del más reciente al más antiguo',
    ruta: '/ingenieria/accesos',
    filtros: { limite: 15 },
    vacio: 'Todavía no hay accesos registrados.',
    columnas: [
      { nombre: 'Fecha' },
      { nombre: 'Correo' },
      { nombre: 'Dirección IP' },
      { nombre: 'Resultado' },
      { nombre: 'Motivo' },
    ],
    aFila: (acceso) => [
      formatearMomento(acceso.ocurridoEn),
      acceso.correo,
      acceso.ip ?? 'Sin dato',
      acceso.exitoso ? estado('Exitoso', 'correcto') : estado('Rechazado', 'error'),
      MOTIVOS_DE_ACCESO[acceso.motivo] ?? acceso.motivo,
    ],
  });
  await Promise.all([auditoria.cargar(), accesos.cargar()]);
  return [
    seccion(
      {
        titulo: 'Auditoría',
        descripcion:
          'Cada operación guarda el hash de la anterior. La verificación recalcula la cadena completa en la base de datos.',
      },
      crearVerificacion(),
      auditoria.elemento,
    ),
    seccion({ titulo: 'Registro de accesos' }, accesos.elemento),
  ];
}

iniciarPaginaPrivada(async (usuario) => {
  const estadoDelSistema = await crearPanelDeEstado();
  const auditoria = puede(usuario, 'auditoria:ver') ? await seccionesDeAuditoria() : [];
  return [...estadoDelSistema, ...auditoria];
});
