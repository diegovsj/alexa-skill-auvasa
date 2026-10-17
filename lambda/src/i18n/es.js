'use strict';

/**
 * Todos los textos que pronuncia la skill. Están centralizados aquí para que
 * añadir un idioma nuevo consista en duplicar este fichero.
 */

const { escaparSsml } = require('../util/texto');

module.exports = {
  codigo: 'es-ES',

  nombre: 'AUVASA',

  bienvenidaConFavorita: 'Hola, bienvenido a AUVASA.',

  bienvenidaSinFavorita: 'Hola, bienvenido a AUVASA, el bus de Valladolid. Dime una parada, por su nombre '
    + 'o por su número, y te digo cuándo llega el próximo autobús. También puedes guardar tu parada y '
    + 'tu línea favoritas.',

  ayuda: 'Puedes decir la parada por su nombre o por su número: por ejemplo, ¿cuándo pasa el próximo '
    + 'autobús en la parada 545? También puedes preguntar qué líneas pasan por una parada, pedir el '
    + 'recorrido de una línea o guardar tu parada y tu línea favoritas. ¿Qué quieres saber?',

  repeticion: '¿Qué más quieres consultar?',

  despedida: 'Hasta luego.',

  noEntendido: 'No te he entendido. Prueba con: ¿cuándo pasa el próximo autobús en la parada 545?',

  sinParada: 'Dime el nombre o el número de la parada.',

  paradaNoEncontrada: (valor) => `No he encontrado ninguna parada parecida a ${escaparSsml(valor)}. `
    + 'Intenta decirlo de otra forma.',

  paradaAmbigua: (opciones) => `He encontrado varias: ${opciones}. ¿Cuál quieres consultar?`,

  confirmarParada: (nombre) => `¿Te refieres a la parada ${escaparSsml(nombre)}?`,

  descartarParada: 'De acuerdo, dime otra parada.',

  // --- Líneas -----------------------------------------------------------------
  lineaDesconocida: (linea) => `No conozco ninguna línea ${escaparSsml(linea)} en la red de AUVASA.`,
  lineaNoPasa: (linea, etiqueta) => `La línea ${escaparSsml(linea)} no pasa por la parada ${escaparSsml(etiqueta)}.`,

  // --- Llegadas ---------------------------------------------------------------
  tituloLlegadas: (etiqueta) => `Parada ${escaparSsml(etiqueta)}.`,
  otrasLineasEnParada: ' También hay otras líneas en esta parada.',
  sinLlegadas: (etiqueta) => `Ahora mismo no hay autobuses previstos en la parada ${escaparSsml(etiqueta)}.`,
  sinLlegadasLinea: (linea, etiqueta) => `Ahora mismo no hay autobuses de la línea ${escaparSsml(linea)} `
    + `en la parada ${escaparSsml(etiqueta)}.`,
  avisoSinTiempoReal: ' Estos son horarios previstos, pueden variar.',

  llegadaAhora: (etiqueta, destino) => `${etiqueta} hacia ${destino} está llegando`,
  llegadaConTiempos: (etiqueta, destino, tiempos) => `${etiqueta} hacia ${destino}, ${tiempos}`,

  /**
   * Convierte una lista de minutos en texto: [3] -> "3 minutos",
   * [3, 10] -> "3 y 10 minutos", [1] -> "un minuto".
   *
   * @param {number[]} minutos
   * @returns {string}
   */
  listaMinutos: (minutos) => {
    if (minutos.length === 1) return minutos[0] === 1 ? 'un minuto' : `${minutos[0]} minutos`;
    const unidad = minutos.every((m) => m === 1) ? 'minuto' : 'minutos';
    return `${minutos.slice(0, -1).join(', ')} y ${minutos[minutos.length - 1]} ${unidad}`;
  },

  // --- Líneas que pasan por una parada ---------------------------------------
  lineasEnParada: (etiqueta, listado) => `En la parada ${escaparSsml(etiqueta)} paran las líneas ${listado}.`,
  lineasSinServicio: (etiqueta) => `La parada ${escaparSsml(etiqueta)} no tiene líneas asignadas.`,

  // --- Recorrido --------------------------------------------------------------
  recorridoLinea: (codigo, nombre, destino, listado) => `La línea ${codigo}${nombre ? `, ${nombre}` : ''}. `
    + `Hacia ${destino}, pasa por ${listado}.`,
  recorridoVariosSentidos: (codigo) => `La línea ${codigo} tiene dos sentidos. `,
  recorridoDemasiadoLargo: 'y hay más paradas',
  recorridoNoDisponible: (codigo) => `No tengo el recorrido de la línea ${escaparSsml(codigo)}.`,

  // --- Favoritos --------------------------------------------------------------
  favoritaGuardada: (etiqueta) => `He guardado la parada ${escaparSsml(etiqueta)} como tu parada favorita.`,
  favoritaGuardadaConAviso: (etiqueta, codigoLinea) => `He guardado la parada ${escaparSsml(etiqueta)} como tu `
    + `parada favorita. Ojo: tu línea favorita ${escaparSsml(codigoLinea)} no pasa por aquí; `
    + 'te mostraré todas las líneas.',
  favoritaSinGuardar: 'Todavía no has guardado ninguna parada favorita. Puedes decir: guarda Paseo '
    + 'Zorrilla 198 como mi parada favorita.',
  favoritaActual: (etiqueta) => `Tu parada favorita es la parada ${escaparSsml(etiqueta)}.`,
  favoritaOlvidada: 'He borrado tu parada favorita.',
  sugerirFavorita: '¿Quieres guardarla como tu parada favorita?',
  sugerirFavoritaNo: 'De acuerdo.',

  lineaFavoritaGuardada: (codigo) => `He guardado la línea ${escaparSsml(codigo)} como tu línea favorita.`,
  lineaFavoritaGuardadaConAviso: (codigo, etiqueta) => `He guardado la línea ${escaparSsml(codigo)} como tu `
    + `línea favorita, pero no pasa por la parada ${escaparSsml(etiqueta)}; en tu parada te mostraré `
    + 'todas las líneas.',
  lineaFavoritaSinGuardar: 'Todavía no has guardado ninguna línea favorita.',
  lineaFavoritaActual: (codigo) => `Tu línea favorita es la ${escaparSsml(codigo)}.`,
  lineaFavoritaOlvidada: 'He borrado tu línea favorita.',
};
