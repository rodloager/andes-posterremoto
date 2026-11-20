import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { conectarComo, esperarRechazo } from './apoyo.js';

const SIN_PRIVILEGIO = '42501';
const VIOLA_RESTRICCION = '23514';

let lector;
let aplicacion;
let propietario;

beforeAll(async () => {
  [lector, aplicacion, propietario] = await Promise.all([
    conectarComo('lectura'),
    conectarComo('aplicacion'),
    conectarComo('propietario'),
  ]);
});

afterAll(() => Promise.all([lector, aplicacion, propietario].map((cliente) => cliente.end())));

async function enTransaccionRevertida(cliente, prueba) {
  await cliente.query('BEGIN');
  try {
    return await prueba();
  } finally {
    await cliente.query('ROLLBACK');
  }
}

describe('cuenta de lectura del portal público', () => {
  it('consulta las vistas analíticas', async () => {
    const { rows } = await lector.query('SELECT count(*)::int AS total FROM analitica.fuentes');
    expect(rows[0].total).toBeGreaterThan(0);
  });

  it.each([
    'nucleo.fuentes_datos',
    'nucleo.reportes_municipales',
    'seguridad.usuarios',
    'seguridad.sesiones',
  ])('no puede leer la tabla %s', async (tabla) => {
    await esperarRechazo(lector.query(`SELECT 1 FROM ${tabla} LIMIT 1`), SIN_PRIVILEGIO);
  });

  it('no puede escribir en las vistas', async () => {
    await esperarRechazo(lector.query("DELETE FROM analitica.fuentes WHERE id = 'dane-mgn'"), SIN_PRIVILEGIO);
  });

  it.each([
    ['las personas registradas', 'nucleo.personas_afectadas'],
    ['las viviendas registradas', 'nucleo.viviendas'],
    ['la vista de personas vigentes', 'analitica.personas_vigentes'],
    ['la vista de viviendas vigentes', 'analitica.viviendas_vigentes'],
    ['los agregados sin anonimizar', 'analitica.agregados'],
    ['las consultas de población', 'analitica.poblacion_por_grupo_de_edad'],
    ['las filas rechazadas', 'staging.filas_rechazadas'],
    ['la cola de duplicados', 'staging.revision_duplicados'],
  ])('no puede leer %s', async (descripcion, tabla) => {
    await esperarRechazo(lector.query(`SELECT 1 FROM ${tabla} LIMIT 1`), SIN_PRIVILEGIO);
  });

  it('puede leer el catálogo de municipios para el buscador', async () => {
    const { rows } = await lector.query('SELECT count(*)::int AS total FROM analitica.municipios');
    expect(rows[0].total).toBeGreaterThan(1000);
  });

  it('no puede ejecutar las funciones de auditoría', async () => {
    await esperarRechazo(lector.query('SELECT * FROM seguridad.verificar_auditoria()'), SIN_PRIVILEGIO);
  });
});

describe('cuenta de la aplicación', () => {
  it.each([
    ['borrar la auditoría', 'DELETE FROM seguridad.auditoria'],
    ['modificar la auditoría', "UPDATE seguridad.auditoria SET entidad = 'otra'"],
    [
      'insertar en la auditoría sin la función encadenada',
      "INSERT INTO seguridad.auditoria (accion, entidad, entidad_id, ocurrido_en, hash_anterior, hash) VALUES ('CREAR', 'x', 'x', now(), repeat('0', 64), repeat('1', 64))",
    ],
    ['cambiar el rol de un usuario', 'UPDATE seguridad.usuarios SET rol_id = 1'],
    ['cambiar una contraseña', "UPDATE seguridad.usuarios SET hash_contrasena = 'x'"],
    [
      'crear usuarios',
      "INSERT INTO seguridad.usuarios (correo, nombre, hash_contrasena, rol_id) VALUES ('x@x.co', 'x', 'x', 1)",
    ],
    ['borrar el registro de accesos', 'DELETE FROM seguridad.registro_accesos'],
    ['cambiar el origen de una fuente', "UPDATE nucleo.fuentes_datos SET origen = 'OFICIAL'"],
    ['borrar fuentes', 'DELETE FROM nucleo.fuentes_datos'],
    ['modificar cifras oficiales', 'UPDATE nucleo.valores_indicador SET valor = 0'],
    ['vaciar tablas', 'TRUNCATE nucleo.reportes_municipales CASCADE'],
    [
      'insertar personas sin pasar por el ETL',
      "INSERT INTO nucleo.personas_afectadas (nombre_normalizado) VALUES ('X')",
    ],
    ['cambiar el nombre de una persona', "UPDATE nucleo.personas_afectadas SET nombre_normalizado = 'X'"],
    [
      'cambiar el seudónimo de una persona',
      "UPDATE nucleo.personas_afectadas SET identificador_hmac = repeat('0', 64)",
    ],
    ['borrar personas', 'DELETE FROM nucleo.personas_afectadas'],
    ['borrar viviendas', 'DELETE FROM nucleo.viviendas'],
    ['borrar agregados', 'DELETE FROM analitica.agregados'],
    ['borrar filas rechazadas', 'DELETE FROM staging.filas_rechazadas'],
    [
      'escribir filas rechazadas',
      "INSERT INTO staging.filas_rechazadas (ejecucion_id, numero_fila, errores, fila_cruda) VALUES (1, 1, '[]', '{}')",
    ],
    ['cambiar la similitud de un par', 'UPDATE staging.revision_duplicados SET similitud = 1'],
    ['borrar pares de la cola', 'DELETE FROM staging.revision_duplicados'],
    ['cambiar los conteos de una carga', 'UPDATE nucleo.ejecuciones_etl SET filas_validas = 0'],
    ['crear tablas', 'CREATE TABLE public.intrusa (id int)'],
  ])('no puede %s', async (descripcion, sentencia) => {
    await esperarRechazo(aplicacion.query(sentencia), SIN_PRIVILEGIO);
  });

  it('puede editar solo los campos descriptivos de una fuente', async () => {
    const resultado = await enTransaccionRevertida(aplicacion, () =>
      aplicacion.query("UPDATE nucleo.fuentes_datos SET limitaciones = 'Prueba.' WHERE id = 'dane-mgn'"),
    );
    expect(resultado.rowCount).toBe(1);
  });

  it('registra la auditoría solo a través de la función encadenada', async () => {
    const { rows } = await enTransaccionRevertida(aplicacion, () =>
      aplicacion.query(
        "SELECT seguridad.registrar_auditoria(NULL, 'ACTUALIZAR', 'fuente', 'dane-mgn', '{}'::jsonb, '{}'::jsonb) AS id",
      ),
    );
    expect(rows[0].id).toEqual(expect.any(Number));
  });
});

describe('reglas de integridad en la base de datos', () => {
  it('rechaza cifras oficiales atribuidas a una fuente simulada', async () => {
    await enTransaccionRevertida(propietario, async () => {
      await esperarRechazo(
        propietario.query(
          `INSERT INTO nucleo.valores_indicador (indicador_codigo, evento_id, fecha_corte, valor, fuente_id)
           SELECT codigo, (SELECT min(id) FROM nucleo.eventos_sismicos), '2026-08-15', 1, 'generador-andes'
           FROM nucleo.indicadores LIMIT 1`,
        ),
        VIOLA_RESTRICCION,
      );
    });
  });

  it('exige que las contraseñas se guarden con argon2id', async () => {
    await enTransaccionRevertida(propietario, async () => {
      await esperarRechazo(
        propietario.query(
          "INSERT INTO seguridad.usuarios (correo, nombre, hash_contrasena, rol_id) SELECT 'nuevo@andes.test', 'Nuevo', 'texto-plano', min(id) FROM seguridad.roles",
        ),
        VIOLA_RESTRICCION,
      );
    });
  });

  it('exige enlace y fecha de consulta a toda fuente que no sea simulada', async () => {
    await enTransaccionRevertida(propietario, async () => {
      await esperarRechazo(
        propietario.query("UPDATE nucleo.fuentes_datos SET fecha_consulta = NULL WHERE id = 'dane-mgn'"),
        VIOLA_RESTRICCION,
      );
    });
  });
});
