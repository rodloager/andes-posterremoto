const consulta = (respuesta) => respuesta.locals.validado.query;

export function crearControladorIngenieria(servicio) {
  return {
    estado: async (solicitud, respuesta) => respuesta.json(await servicio.estado()),
    auditoria: async (solicitud, respuesta) => respuesta.json(await servicio.auditoria(consulta(respuesta))),
    verificarAuditoria: async (solicitud, respuesta) => respuesta.json(await servicio.verificarAuditoria()),
    accesos: async (solicitud, respuesta) => respuesta.json(await servicio.accesos(consulta(respuesta))),
  };
}
