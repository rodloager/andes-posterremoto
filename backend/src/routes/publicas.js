import { Router } from 'express';
import { validar } from '../middlewares/validacion.js';
import { revalidarCache } from '../middlewares/seguridad.js';
import {
  busquedaDeMunicipios,
  parametrosDepartamento,
  parametrosEvento,
  parametrosIndicador,
} from '../models/esquemas.js';

export function crearRutasPublicas(controlador) {
  const rutas = Router();
  const deEvento = validar({ params: parametrosEvento });
  rutas.use(revalidarCache);
  rutas.get('/estado', controlador.estado);
  rutas.get('/fuentes', controlador.fuentes);
  rutas.get('/municipios', validar({ query: busquedaDeMunicipios }), controlador.municipios);
  rutas.get('/eventos', controlador.eventos);
  rutas.get('/eventos/:evento', deEvento, controlador.evento);
  rutas.get('/eventos/:evento/indicadores', deEvento, controlador.indicadores);
  rutas.get(
    '/eventos/:evento/indicadores/:codigo',
    validar({ params: parametrosIndicador }),
    controlador.indicador,
  );
  rutas.get('/eventos/:evento/territorio', deEvento, controlador.territorio);
  rutas.get(
    '/eventos/:evento/territorio/departamentos/:departamento',
    validar({ params: parametrosDepartamento }),
    controlador.departamento,
  );
  rutas.get('/eventos/:evento/seguros', deEvento, controlador.seguros);
  rutas.get('/eventos/:evento/economia', deEvento, controlador.economia);
  rutas.get('/eventos/:evento/kpi', deEvento, controlador.kpi);
  rutas.get('/eventos/:evento/registros/poblacion', deEvento, controlador.registrosDePoblacion);
  rutas.get('/eventos/:evento/registros/viviendas', deEvento, controlador.registrosDeViviendas);
  return rutas;
}
