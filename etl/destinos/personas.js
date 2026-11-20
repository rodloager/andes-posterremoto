import { VULNERABILIDADES, crearClasificador } from '../../backend/src/algorithms/clasificacion.js';
import { normalizarTexto } from '../../backend/src/algorithms/texto.js';
import { CONDICIONES_INSTITUCIONALES, TENENCIAS } from '../../backend/src/models/dimensiones.js';
import { copiarFilas } from '../cargadores/copia.js';

const COLUMNAS_STAGING = [
  'ejecucion_id',
  'lote',
  'numero_fila',
  'identificador_hmac',
  'nombre_normalizado',
  'edad',
  'sexo',
  'municipio_codigo',
  'condicion_institucional',
  'tenencia',
  'situacion',
  'condicion_salud',
  'vulnerabilidades',
  'alertas',
  'clave_bloque',
  'capturado_en',
];

const BITS_DERIVADOS = VULNERABILIDADES.filter(({ derivada }) => derivada).reduce(
  (mascara, { bit }) => mascara | (1 << bit),
  0,
);

const INSERTAR_LOTE = `
  INSERT INTO nucleo.personas_afectadas (
    evento_id, identificador_hmac, nombre_normalizado, edad_al_evento, sexo, municipio_codigo,
    condicion_institucional_id, tenencia_id, situacion, condicion_salud, alertas, clave_bloque,
    origen_dato, ejecucion_id, numero_fila, capturado_en)
  SELECT $3, s.identificador_hmac, s.nombre_normalizado, s.edad, s.sexo, s.municipio_codigo,
         ci.id, tt.id, s.situacion, s.condicion_salud, s.alertas, s.clave_bloque,
         $4, s.ejecucion_id, s.numero_fila, s.capturado_en
  FROM staging.personas s
  JOIN nucleo.condiciones_institucionales ci ON ci.codigo = s.condicion_institucional AND ci.asignable
  LEFT JOIN nucleo.tipos_tenencia tt ON tt.codigo = s.tenencia
  WHERE s.ejecucion_id = $1 AND s.lote = $2
  ORDER BY s.numero_fila
  ON CONFLICT (evento_id, identificador_hmac) DO NOTHING
  RETURNING id, numero_fila`;

const CANDIDATOS = `
  SELECT n.id AS nuevo_id, n.nombre_normalizado AS nuevo_nombre, n.sexo AS nuevo_sexo,
         c.id AS candidato_id, c.nombre_normalizado AS candidato_nombre, c.sexo AS candidato_sexo
  FROM nucleo.personas_afectadas n
  JOIN nucleo.personas_afectadas c
    ON c.evento_id = n.evento_id AND c.clave_bloque = n.clave_bloque AND c.id < n.id AND c.estado <> 'FUSIONADO'
  WHERE n.id = ANY ($1::bigint[])
  ORDER BY n.id, c.id`;

export const destinoPersonas = Object.freeze({
  nombre: 'personas',
  tablaDeRegistros: 'nucleo.personas_afectadas',

  crearPreparador() {
    const clasificar = crearClasificador({ condiciones: CONDICIONES_INSTITUCIONALES, tenencias: TENENCIAS });
    return function preparar(valores, { seudonimo }) {
      const clasificacion = clasificar({
        edad: valores.edad,
        condicion: valores.condicion_institucional,
        tenencia: valores.tenencia,
        vulnerabilidades: valores.vulnerabilidades,
      });
      if (!clasificacion.clasificable) {
        return {
          errores: clasificacion.problemas.map((codigo) => ({
            campo: null,
            codigo,
            mensaje: 'El registro no se pudo clasificar.',
          })),
        };
      }
      const nombre = normalizarTexto(valores.nombre_completo);
      if (!nombre) {
        return {
          errores: [
            { campo: 'nombre_completo', codigo: 'OBLIGATORIO', mensaje: 'El nombre no tiene letras.' },
          ],
        };
      }
      return {
        registro: {
          identificador_hmac: seudonimo(valores.documento),
          nombre_normalizado: nombre,
          edad: valores.edad,
          sexo: valores.sexo,
          municipio_codigo: valores.municipio,
          condicion_institucional: valores.condicion_institucional,
          tenencia: valores.tenencia,
          situacion: valores.situacion,
          condicion_salud: valores.condicion_salud,
          vulnerabilidades: clasificacion.mascara & ~BITS_DERIVADOS,
          clave_bloque: `${valores.municipio}|${valores.edad}|${nombre[0]}`,
          capturado_en: valores.fecha_registro,
        },
      };
    };
  },

  async cargarCatalogos(cliente) {
    const { rows } = await cliente.query(
      'SELECT id, bit FROM nucleo.tipos_vulnerabilidad WHERE NOT es_derivada ORDER BY bit',
    );
    return { vulnerabilidades: rows };
  },

  async cargarLote(cliente, { ejecucionId, lote, eventoId, origen, filas, catalogos }) {
    await copiarFilas(
      cliente,
      'staging.personas',
      COLUMNAS_STAGING,
      filas.map(({ numero, registro, alertas }) => [
        ejecucionId,
        lote,
        numero,
        registro.identificador_hmac,
        registro.nombre_normalizado,
        registro.edad,
        registro.sexo,
        registro.municipio_codigo,
        registro.condicion_institucional,
        registro.tenencia,
        registro.situacion,
        registro.condicion_salud,
        registro.vulnerabilidades,
        alertas,
        registro.clave_bloque,
        registro.capturado_en,
      ]),
    );
    const { rows } = await cliente.query(INSERTAR_LOTE, [ejecucionId, lote, eventoId, origen]);
    await cliente.query('DELETE FROM staging.personas WHERE ejecucion_id = $1 AND lote = $2', [
      ejecucionId,
      lote,
    ]);
    const mascaraPorFila = new Map(filas.map(({ numero, registro }) => [numero, registro.vulnerabilidades]));
    const vulnerabilidades = [];
    for (const { id, numero_fila: numero } of rows) {
      const mascara = mascaraPorFila.get(numero);
      for (const { bit, id: tipo } of catalogos.vulnerabilidades) {
        if ((mascara & (1 << bit)) !== 0) {
          vulnerabilidades.push([id, tipo]);
        }
      }
    }
    await copiarFilas(
      cliente,
      'nucleo.personas_vulnerabilidades',
      ['persona_id', 'tipo_vulnerabilidad_id'],
      vulnerabilidades,
    );
    return rows;
  },

  duplicados: Object.freeze({
    consultaDeCandidatos: CANDIDATOS,
    campos: (pesos) => [
      { nombre: 'nombre', peso: pesos.nombre ?? 0.8, tipo: 'texto' },
      { nombre: 'sexo', peso: pesos.sexo ?? 0.2, tipo: 'exacto' },
    ],
    nuevo: (fila) => ({ id: fila.nuevo_id, nombre: fila.nuevo_nombre, sexo: fila.nuevo_sexo }),
    candidato: (fila) => ({
      id: fila.candidato_id,
      nombre: fila.candidato_nombre,
      sexo: fila.candidato_sexo,
    }),
    claveNatural: (registro) => registro.nombre,
    columnas: ['persona_id', 'persona_candidata_id'],
  }),
});
