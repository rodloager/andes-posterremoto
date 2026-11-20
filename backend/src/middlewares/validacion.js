import { ErrorHttp } from '../utils/errores.js';

function describirProblemas(parte, problemas) {
  return problemas.map(({ path, message }) => ({
    ubicacion: parte,
    campo: path.join('.') || null,
    mensaje: message,
  }));
}

export function validar(esquemas) {
  return (solicitud, respuesta, siguiente) => {
    const validado = {};
    const errores = [];
    for (const [parte, esquema] of Object.entries(esquemas)) {
      const resultado = esquema.safeParse(solicitud[parte] ?? {});
      if (resultado.success) {
        validado[parte] = resultado.data;
      } else {
        errores.push(...describirProblemas(parte, resultado.error.issues));
      }
    }
    if (errores.length > 0) {
      throw new ErrorHttp(400, 'VALIDACION', 'Hay datos que no cumplen el formato esperado.', { errores });
    }
    respuesta.locals.validado = validado;
    siguiente();
  };
}
