import { crearSello } from '../componentes/sello.js';
import { indicadoresEnCsv, territorioEnCsv } from '../nucleo/csv.js';
import { cargar, direccionDe } from '../nucleo/datos.js';
import { crear, enlaceExterno } from '../nucleo/dom.js';
import { formatearFecha } from '../nucleo/formato.js';
import { iniciarPagina, seccion } from '../nucleo/pagina.js';

const USO_EN_INDICADORES = 'indicadores';
const SIN_FECHA = 'No declarada';

const DESCARGAS = [
  {
    nombre: 'Indicadores nacionales con su serie por fecha de corte',
    recurso: 'oficial/indicadores',
    csv: indicadoresEnCsv,
  },
  { nombre: 'Afectación por departamento y municipio', recurso: 'oficial/territorio', csv: territorioEnCsv },
  { nombre: 'Reclamaciones de seguros', recurso: 'oficial/seguros' },
  { nombre: 'Costos y recursos de la reconstrucción', recurso: 'oficial/economia' },
  { nombre: 'Parámetros del sismo según cada fuente', recurso: 'oficial/evento' },
  { nombre: 'Catálogo de fuentes', recurso: 'oficial/fuentes' },
  { nombre: 'Límites de los departamentos', recurso: 'geo/departamentos' },
];

const nombreDeArchivo = (recurso, extension = 'json') => `andes-${recurso.split('/').at(-1)}.${extension}`;

function enlaceCsv({ nombre, recurso, csv }) {
  const enlace = crear('a', { href: '#', 'aria-label': `${nombre} en CSV`, texto: 'CSV' });
  enlace.addEventListener('click', async (evento) => {
    evento.preventDefault();
    const direccion = URL.createObjectURL(
      new Blob([csv(await cargar(recurso))], { type: 'text/csv;charset=utf-8' }),
    );
    const descarga = crear('a', { href: direccion, download: nombreDeArchivo(recurso, 'csv') });
    descarga.click();
    URL.revokeObjectURL(direccion);
  });
  return enlace;
}

function dato(termino, descripcion) {
  return [crear('dt', { texto: termino }), crear('dd', {}, descripcion)];
}

function fechaODefecto(fecha) {
  return fecha ? formatearFecha(fecha) : SIN_FECHA;
}

function enlaceDeLaFuente({ enlace, leidoEn }) {
  if (!enlace) {
    return 'No aplica';
  }
  return enlaceExterno(leidoEn ? `Leído en ${leidoEn}` : 'Abrir la fuente', enlace);
}

function fichaDeFuente(fuente) {
  return crear(
    'article',
    { clase: 'panel ficha-fuente' },
    crear(
      'div',
      { clase: 'grafica-cabecera mb-2' },
      crear(
        'div',
        {},
        crear('h3', { clase: 'grafica-pregunta', texto: fuente.nombre }),
        crear('p', { clase: 'grafica-descripcion', texto: fuente.entidad }),
      ),
      crearSello(fuente.origen, fuente.nivel),
    ),
    crear(
      'dl',
      { clase: 'ficha-fuente-datos' },
      dato('Acceso', fuente.tipoAcceso),
      dato('Enlace de origen', enlaceDeLaFuente(fuente)),
      dato('Fecha de publicación', fechaODefecto(fuente.fechaPublicacion)),
      dato('Fecha de consulta', fechaODefecto(fuente.fechaConsulta)),
      dato('Cobertura geográfica', fuente.cobertura),
      dato('Variables', fuente.variables),
      dato('Limitaciones', fuente.limitaciones),
    ),
  );
}

function rejillaDeFuentes(fuentes) {
  return crear('div', { clase: 'rejilla-graficas' }, fuentes.map(fichaDeFuente));
}

function listaDeDescargas() {
  return crear(
    'ul',
    { clase: 'panel mb-0 lista-descargas' },
    DESCARGAS.map((descarga) =>
      crear(
        'li',
        {},
        crear('a', {
          href: direccionDe(descarga.recurso),
          download: nombreDeArchivo(descarga.recurso),
          texto: descarga.nombre,
        }),
        ' · JSON',
        descarga.csv ? [' · ', enlaceCsv(descarga)] : null,
      ),
    ),
  );
}

iniciarPagina(async (contexto) => {
  const enUso = contexto.fuentes.filter(({ uso }) => uso === USO_EN_INDICADORES);
  const deReferencia = contexto.fuentes.filter(({ uso }) => uso !== USO_EN_INDICADORES);
  return [
    seccion(
      {
        titulo: 'Fuentes de las cifras publicadas',
        descripcion: 'Cada cifra del portal enlaza a una de estas fichas.',
      },
      rejillaDeFuentes(enUso),
    ),
    seccion(
      {
        titulo: 'Fuentes de referencia',
        descripcion: 'Catálogos y normas que el proyecto consultó y que se integrarán en fases posteriores.',
      },
      rejillaDeFuentes(deReferencia),
    ),
    seccion(
      {
        titulo: 'Descargas',
        descripcion: 'Los datos oficiales compilados por el proyecto, en formato abierto.',
      },
      listaDeDescargas(),
    ),
  ];
});
