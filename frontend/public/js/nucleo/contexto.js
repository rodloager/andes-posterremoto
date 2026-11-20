import { cargar } from './datos.js';
import { ordenarSerie, resolverIndicador } from './indicadores.js';
import { esDemostracion } from './modo.js';

const SIN_SIMULADOS = { indicadores: {} };

export function combinarSimulados(deArchivo, deRegistros) {
  const combinados = { ...deArchivo };
  for (const [codigo, valor] of Object.entries(deRegistros)) {
    if (valor === null) {
      delete combinados[codigo];
    } else {
      combinados[codigo] = valor;
    }
  }
  return combinados;
}

function indexar(elementos, clave) {
  return new Map(elementos.map((elemento) => [elemento[clave], elemento]));
}

export async function cargarContexto() {
  const demostracion = esDemostracion();
  const [catalogo, catalogoDeFuentes, simulados, registrosDeViviendas] = await Promise.all([
    cargar('oficial/indicadores'),
    cargar('oficial/fuentes'),
    demostracion ? cargar('simulado/indicadores') : SIN_SIMULADOS,
    demostracion ? cargar('simulado/vivienda') : SIN_SIMULADOS,
  ]);
  const indicadoresSimulados = combinarSimulados(simulados.indicadores, registrosDeViviendas.indicadores);
  const fuentes = indexar(catalogoDeFuentes.fuentes, 'id');
  const definiciones = indexar(catalogo.indicadores, 'codigo');

  function definicion(codigo) {
    const encontrada = definiciones.get(codigo);
    if (!encontrada) {
      throw new Error(`Indicador desconocido: ${codigo}`);
    }
    return encontrada;
  }

  return {
    demostracion,
    fuentes: catalogoDeFuentes.fuentes,
    fuente: (identificador) => fuentes.get(identificador),
    indicador: (codigo) =>
      resolverIndicador(definicion(codigo), { fuentes, simulados: indicadoresSimulados }),
    serie: (codigo) => ordenarSerie(definicion(codigo).serie),
    simulado: (modulo) => (demostracion ? cargar(`simulado/${modulo}`) : Promise.resolve(null)),
  };
}
