const validado = (respuesta) => respuesta.locals.validado;

export function crearControladorAdministracion(servicio, { cargas, duplicados, estadisticas }) {
  return {
    poblacion: async (solicitud, respuesta) =>
      respuesta.json(await estadisticas.poblacion(validado(respuesta).query)),
    aseguramiento: async (solicitud, respuesta) =>
      respuesta.json(await estadisticas.aseguramiento(validado(respuesta).query)),
    priorizacion: async (solicitud, respuesta) =>
      respuesta.json(await estadisticas.priorizacion(validado(respuesta).query)),
    importables: async (solicitud, respuesta) => respuesta.json(await cargas.importables()),
    registrarCarga: async (solicitud, respuesta) => {
      const resultado = await cargas.registrar({
        conjunto: validado(respuesta).body.conjunto,
        archivo: solicitud.file,
        usuario: respuesta.locals.usuario,
      });
      respuesta.status(202).json(resultado);
    },
    carga: async (solicitud, respuesta) => respuesta.json(await cargas.carga(validado(respuesta).params.id)),
    rechazos: async (solicitud, respuesta) => {
      const { params, query } = validado(respuesta);
      respuesta.json(await cargas.rechazos(params.id, query));
    },
    resumenDeRegistros: async (solicitud, respuesta) => respuesta.json(await cargas.resumenDeRegistros()),
    duplicados: async (solicitud, respuesta) =>
      respuesta.json(await duplicados.pares(validado(respuesta).query)),
    decidirDuplicado: async (solicitud, respuesta) => {
      const { params, body } = validado(respuesta);
      respuesta.json(
        await duplicados.decidir({
          id: params.id,
          decision: body.decision,
          usuario: respuesta.locals.usuario,
        }),
      );
    },
    conjuntos: async (solicitud, respuesta) => respuesta.json(await servicio.conjuntos()),
    ejecuciones: async (solicitud, respuesta) =>
      respuesta.json(await servicio.ejecuciones(validado(respuesta).query)),
    registros: async (solicitud, respuesta) =>
      respuesta.json(await servicio.registros(validado(respuesta).query)),
    calidad: async (solicitud, respuesta) => respuesta.json(await servicio.calidad()),
    historial: async (solicitud, respuesta) =>
      respuesta.json(await servicio.historial(validado(respuesta).query)),
    actualizarFuente: async (solicitud, respuesta) => {
      const { params, body } = validado(respuesta);
      respuesta.json(await servicio.actualizarFuente(params.id, body, respuesta.locals.usuario));
    },
  };
}
