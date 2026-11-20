import { Router } from 'express';
import { exigirPermiso } from '../middlewares/autenticacion.js';
import { validar } from '../middlewares/validacion.js';
import { descartarArchivoAlFallar, recibirArchivo } from '../middlewares/archivos.js';
import {
  cambiosDeFuente,
  cuerpoDeCarga,
  decisionDeDuplicado,
  filtrosDeDuplicados,
  filtrosDeRegistros,
  paginacionPorFila,
  paginacionPorId,
  parametrosCarga,
  parametrosDuplicado,
  parametrosFuente,
  filtrosDeEstadisticas,
  parametrosDePriorizacion,
} from '../models/esquemas.js';

export function crearRutasAdministracion(controlador, { recibir = recibirArchivo() } = {}) {
  const rutas = Router();
  const consultar = exigirPermiso('datos:consultar');
  const importar = exigirPermiso('datos:importar');
  const editar = exigirPermiso('datos:editar');
  rutas.get('/conjuntos', consultar, controlador.conjuntos);
  rutas.get('/ejecuciones', consultar, validar({ query: paginacionPorId }), controlador.ejecuciones);
  rutas.get('/registros', consultar, validar({ query: filtrosDeRegistros }), controlador.registros);
  rutas.get('/calidad', consultar, controlador.calidad);
  rutas.get('/historial', consultar, validar({ query: paginacionPorId }), controlador.historial);
  rutas.patch(
    '/fuentes/:id',
    exigirPermiso('datos:importar'),
    validar({ params: parametrosFuente, body: cambiosDeFuente }),
    controlador.actualizarFuente,
  );
  rutas.get('/calidad/registros', consultar, controlador.resumenDeRegistros);
  rutas.get('/importables', consultar, controlador.importables);
  rutas.post(
    '/cargas',
    importar,
    recibir,
    validar({ body: cuerpoDeCarga }),
    controlador.registrarCarga,
    descartarArchivoAlFallar,
  );
  rutas.get('/cargas/:id', consultar, validar({ params: parametrosCarga }), controlador.carga);
  rutas.get(
    '/cargas/:id/rechazos',
    consultar,
    validar({ params: parametrosCarga, query: paginacionPorFila }),
    controlador.rechazos,
  );
  rutas.get(
    '/estadisticas/poblacion',
    consultar,
    validar({ query: filtrosDeEstadisticas }),
    controlador.poblacion,
  );
  rutas.get(
    '/estadisticas/aseguramiento',
    consultar,
    validar({ query: filtrosDeEstadisticas }),
    controlador.aseguramiento,
  );
  rutas.get(
    '/priorizacion',
    exigirPermiso('priorizacion:usar'),
    validar({ query: parametrosDePriorizacion }),
    controlador.priorizacion,
  );
  rutas.get('/duplicados', editar, validar({ query: filtrosDeDuplicados }), controlador.duplicados);
  rutas.post(
    '/duplicados/:id/decision',
    editar,
    validar({ params: parametrosDuplicado, body: decisionDeDuplicado }),
    controlador.decidirDuplicado,
  );
  return rutas;
}
