import { pedir } from './api.js';

export const PAGINAS_PRIVADAS = Object.freeze([
  {
    id: 'administracion',
    nombre: 'Administración de datos',
    ruta: '/privado/administracion',
    permiso: 'datos:consultar',
  },
  { id: 'calidad', nombre: 'Calidad de datos', ruta: '/privado/calidad', permiso: 'datos:consultar' },
  {
    id: 'priorizacion',
    nombre: 'Laboratorio de priorización',
    ruta: '/privado/priorizacion',
    permiso: 'priorizacion:usar',
  },
  { id: 'ingenieria', nombre: 'Panel de ingeniería', ruta: '/privado/ingenieria', permiso: 'sistema:ver' },
]);

let sesion = null;

export function sesionActual() {
  sesion ??= pedir('/sesion').then(({ usuario }) => usuario);
  return sesion;
}

export function puede(usuario, permiso) {
  return usuario.permisos.includes(permiso);
}

export function paginasPermitidas(usuario) {
  return PAGINAS_PRIVADAS.filter(({ permiso }) => puede(usuario, permiso));
}

export function destinoTrasAcceso(usuario, solicitado) {
  const permitidas = paginasPermitidas(usuario);
  const destino = permitidas.find(({ ruta }) => ruta === solicitado) ?? permitidas[0];
  return destino?.ruta ?? '/';
}
