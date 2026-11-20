import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { registrarSolicitudesHttp } from './config/registro.js';
import { crearControladorAdministracion } from './controllers/administracion.js';
import { crearControladorCatalogo } from './controllers/catalogo.js';
import { crearControladorIngenieria } from './controllers/ingenieria.js';
import { crearControladorSesion } from './controllers/sesion.js';
import { cargarUsuario } from './middlewares/autenticacion.js';
import { crearManejadorDeErrores, rutaApiInexistente } from './middlewares/errores.js';
import { LIMITES_POR_DEFECTO } from './middlewares/limites.js';
import { medirSolicitudes } from './middlewares/metricas.js';
import { crearProteccionDePaginas } from './middlewares/paginasPrivadas.js';
import { cabecerasDeSeguridad } from './middlewares/seguridad.js';
import { crearSesiones } from './middlewares/sesion.js';
import { crearRepositorioAdministracion } from './repositories/administracion.js';
import { crearRepositorioCargas } from './repositories/cargas.js';
import { crearRepositorioDuplicados } from './repositories/duplicados.js';
import { crearRepositorioEstadisticas } from './repositories/estadisticas.js';
import { crearRepositorioCatalogo } from './repositories/catalogo.js';
import { crearRepositorioKpi } from './repositories/kpi.js';
import { crearRepositorioRegistros } from './repositories/registros.js';
import { crearRepositorioSistema } from './repositories/sistema.js';
import { crearRepositorioUsuarios } from './repositories/usuarios.js';
import { crearRutasApi } from './routes/api.js';
import { crearServicioAdministracion } from './services/administracion.js';
import { crearServicioCargas } from './services/cargas.js';
import { crearServicioDuplicados } from './services/duplicados.js';
import { crearServicioEstadisticas } from './services/estadisticas.js';
import { crearServicioCatalogo } from './services/catalogo.js';
import { crearServicioIngenieria } from './services/ingenieria.js';
import { crearServicioKpi } from './services/kpi.js';
import { crearServicioRegistros } from './services/registros.js';
import { crearMetricas } from './services/metricas.js';
import { crearServicioSesion } from './services/sesion.js';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const carpetaPublica = path.join(raiz, 'frontend', 'public');
const carpetaPrivada = path.join(raiz, 'frontend', 'private');
const paginaNoEncontrada = path.join(carpetaPublica, '404.html');
const paginaProhibida = path.join(carpetaPrivada, '403.html');
const opcionesEstaticas = { extensions: ['html'], index: ['index.html'] };

function crearServicios({ configuracion, conexiones, metricas, lanzarTrabajador }) {
  const repositorioAdministracion = crearRepositorioAdministracion(conexiones.aplicacion);
  return {
    cargas: crearServicioCargas({
      repositorio: crearRepositorioCargas(conexiones.aplicacion),
      lanzarTrabajador,
    }),
    duplicados: crearServicioDuplicados(crearRepositorioDuplicados(conexiones.aplicacion)),
    estadisticas: crearServicioEstadisticas(crearRepositorioEstadisticas(conexiones.aplicacion)),
    catalogo: crearServicioCatalogo(crearRepositorioCatalogo(conexiones.lectura)),
    kpi: crearServicioKpi(crearRepositorioKpi(conexiones.lectura)),
    registros: crearServicioRegistros(crearRepositorioRegistros(conexiones.lectura)),
    sesion: crearServicioSesion(crearRepositorioUsuarios(conexiones.aplicacion)),
    administracion: crearServicioAdministracion(repositorioAdministracion),
    ingenieria: crearServicioIngenieria({
      repositorio: crearRepositorioSistema(conexiones.aplicacion),
      repositorioAdministracion,
      conexiones,
      metricas,
      entorno: configuracion.entorno,
    }),
  };
}

function crearControladores(servicios, configuracion) {
  return {
    catalogo: crearControladorCatalogo(servicios.catalogo, {
      kpi: servicios.kpi,
      registros: servicios.registros,
    }),
    sesion: crearControladorSesion(servicios.sesion, configuracion),
    administracion: crearControladorAdministracion(servicios.administracion, {
      cargas: servicios.cargas,
      duplicados: servicios.duplicados,
      estadisticas: servicios.estadisticas,
    }),
    ingenieria: crearControladorIngenieria(servicios.ingenieria),
  };
}

export function crearAplicacion({
  configuracion,
  conexiones,
  registro,
  metricas = crearMetricas(),
  limites = LIMITES_POR_DEFECTO,
  lanzarTrabajador = () => false,
  recibirArchivo,
}) {
  const servicios = crearServicios({ configuracion, conexiones, metricas, lanzarTrabajador });
  const controladores = crearControladores(servicios, configuracion);
  const sesiones = crearSesiones({
    secreto: configuracion.sesion.secreto,
    produccion: configuracion.produccion,
    pruebas: configuracion.pruebas,
    grupo: conexiones.aplicacion,
  });
  const usuario = cargarUsuario(servicios.sesion);

  const aplicacion = express();
  aplicacion.disable('x-powered-by');
  aplicacion.set('trust proxy', configuracion.proxiesDeConfianza);
  aplicacion.use(cabecerasDeSeguridad(configuracion));
  aplicacion.use(registrarSolicitudesHttp(registro));
  aplicacion.use('/api', medirSolicitudes(metricas));
  aplicacion.use(
    '/api/v1',
    crearRutasApi({
      controladores,
      sesion: sesiones.middleware,
      cargarUsuario: usuario,
      limites,
      recibirArchivo,
    }),
  );
  aplicacion.use('/api', rutaApiInexistente);
  aplicacion.use(
    '/privado',
    sesiones.middleware,
    usuario,
    crearProteccionDePaginas({ paginaProhibida, paginaNoEncontrada }),
    express.static(carpetaPrivada, opcionesEstaticas),
  );
  aplicacion.use(express.static(carpetaPublica, opcionesEstaticas));
  aplicacion.use((solicitud, respuesta) => respuesta.status(404).sendFile(paginaNoEncontrada));
  aplicacion.use(crearManejadorDeErrores({ registro, alFallar: metricas.registrarError }));

  const cerrar = () => {
    sesiones.cerrar();
    metricas.detener();
  };
  return { aplicacion, cerrar };
}
