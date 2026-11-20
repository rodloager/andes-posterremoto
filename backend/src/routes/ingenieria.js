import { Router } from 'express';
import { exigirPermiso } from '../middlewares/autenticacion.js';
import { validar } from '../middlewares/validacion.js';
import { paginacionPorId } from '../models/esquemas.js';

export function crearRutasIngenieria(controlador) {
  const rutas = Router();
  const auditar = exigirPermiso('auditoria:ver');
  const paginado = validar({ query: paginacionPorId });
  rutas.get('/estado', exigirPermiso('sistema:ver'), controlador.estado);
  rutas.get('/auditoria', auditar, paginado, controlador.auditoria);
  rutas.get('/auditoria/verificacion', auditar, controlador.verificarAuditoria);
  rutas.get('/accesos', auditar, paginado, controlador.accesos);
  return rutas;
}
