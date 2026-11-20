import { describirError, pedir } from './api.js';
import { destinoTrasAcceso, sesionActual } from './navegacion.js';

const formulario = document.getElementById('formulario-acceso');
const mensaje = document.getElementById('mensaje-acceso');
const boton = formulario.querySelector('button[type="submit"]');
const solicitado = new URLSearchParams(window.location.search).get('siguiente');

function mostrarMensaje(texto) {
  mensaje.textContent = texto;
  mensaje.hidden = !texto;
}

async function iniciarSesion(evento) {
  evento.preventDefault();
  mostrarMensaje('');
  boton.disabled = true;
  const datos = new FormData(formulario);
  try {
    const { usuario } = await pedir('/sesion', {
      metodo: 'POST',
      cuerpo: { correo: datos.get('correo'), clave: datos.get('clave') },
    });
    window.location.assign(destinoTrasAcceso(usuario, solicitado));
  } catch (error) {
    mostrarMensaje(describirError(error, 'No fue posible conectar con el servidor.'));
    boton.disabled = false;
  }
}

formulario.addEventListener('submit', iniciarSesion);

const usuarioActivo = await sesionActual().catch(() => null);
if (usuarioActivo) {
  window.location.replace(destinoTrasAcceso(usuarioActivo, solicitado));
}
