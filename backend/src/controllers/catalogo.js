const parametros = (respuesta) => respuesta.locals.validado.params;

export function crearControladorCatalogo(servicio, { kpi, registros }) {
  return {
    estado: async (solicitud, respuesta) => {
      const estado = await servicio.estado();
      respuesta.status(estado.baseDeDatos === 'disponible' ? 200 : 503).json(estado);
    },
    fuentes: async (solicitud, respuesta) => respuesta.json(await servicio.fuentes()),
    eventos: async (solicitud, respuesta) => respuesta.json(await servicio.eventos()),
    municipios: async (solicitud, respuesta) =>
      respuesta.json(await servicio.municipios(respuesta.locals.validado.query)),
    evento: async (solicitud, respuesta) =>
      respuesta.json(await servicio.evento(parametros(respuesta).evento)),
    indicadores: async (solicitud, respuesta) =>
      respuesta.json(await servicio.indicadores(parametros(respuesta).evento)),
    indicador: async (solicitud, respuesta) => {
      const { evento, codigo } = parametros(respuesta);
      respuesta.json(await servicio.indicador(evento, codigo));
    },
    territorio: async (solicitud, respuesta) =>
      respuesta.json(await servicio.territorio(parametros(respuesta).evento)),
    departamento: async (solicitud, respuesta) => {
      const { evento, departamento } = parametros(respuesta);
      respuesta.json(await servicio.departamento(evento, departamento));
    },
    seguros: async (solicitud, respuesta) =>
      respuesta.json(await servicio.seguros(parametros(respuesta).evento)),
    economia: async (solicitud, respuesta) =>
      respuesta.json(await servicio.economia(parametros(respuesta).evento)),
    kpi: async (solicitud, respuesta) => respuesta.json(await kpi.calcular(parametros(respuesta).evento)),
    registrosDePoblacion: async (solicitud, respuesta) =>
      respuesta.json(await registros.poblacion(parametros(respuesta).evento)),
    registrosDeViviendas: async (solicitud, respuesta) =>
      respuesta.json(await registros.viviendas(parametros(respuesta).evento)),
  };
}
