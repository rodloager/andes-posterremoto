import { Router } from 'express';
import { limitarIntentosDeSesion } from '../middlewares/limites.js';
import { validar } from '../middlewares/validacion.js';
import { credenciales } from '../models/esquemas.js';

export function crearRutasSesion(controlador, limiteDeIntentos) {
  const rutas = Router();
  rutas.post(
    '/',
    limitarIntentosDeSesion(limiteDeIntentos),
    validar({ body: credenciales }),
    controlador.iniciar,
  );
  rutas.get('/', controlador.actual);
  rutas.delete('/', controlador.cerrar);
  return rutas;
}
