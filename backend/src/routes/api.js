import express, { Router } from 'express';
import { exigirSesion } from '../middlewares/autenticacion.js';
import { rutaApiInexistente } from '../middlewares/errores.js';
import { limitarSolicitudes } from '../middlewares/limites.js';
import { sinCache, verificarOrigen } from '../middlewares/seguridad.js';
import { crearRutasAdministracion } from './administracion.js';
import { crearRutasIngenieria } from './ingenieria.js';
import { crearRutasPublicas } from './publicas.js';
import { crearRutasSesion } from './sesion.js';

const TAMANO_MAXIMO_CUERPO = '20kb';

export function crearRutasApi({ controladores, sesion, cargarUsuario, limites, recibirArchivo }) {
  const api = Router();
  const privado = [sinCache, sesion, cargarUsuario];
  api.use(limitarSolicitudes(limites.api));
  api.use(verificarOrigen);
  api.use(express.json({ limit: TAMANO_MAXIMO_CUERPO }));
  api.use('/sesion', ...privado, crearRutasSesion(controladores.sesion, limites.sesion));
  api.use(
    '/admin',
    ...privado,
    exigirSesion,
    crearRutasAdministracion(
      controladores.administracion,
      recibirArchivo ? { recibir: recibirArchivo } : undefined,
    ),
  );
  api.use('/ingenieria', ...privado, exigirSesion, crearRutasIngenieria(controladores.ingenieria));
  api.use(crearRutasPublicas(controladores.catalogo));
  api.use(rutaApiInexistente);
  return api;
}
