'use strict';

/**
 * Todos los textos que pronuncia la skill. Están centralizados aquí para que
 * añadir un idioma nuevo consista en duplicar este fichero.
 */

const { escaparSsml } = require('../util/texto');

module.exports = {
  codigo: 'es-ES',

  nombre: 'AUVASA',

  bienvenida: `Te doy la bienvenida a ${'AUVASA'}, la información de los autobuses urbanos de Valladolid. `
    + 'Puedes preguntarme cuándo pasa el próximo autobús por una parada, qué líneas paran en ella '
    + 'o guardar tu parada favorita.',

  ayuda: 'Puedes decir, por ejemplo: ¿cuándo pasa el próximo autobús en la parada Paseo Zorrilla 198? '
    + 'También puedes nombrar la parada por su número, como ¿cuánto le queda a la línea 8 para llegar a la parada 400? '
    + 'Y puedes preguntar qué líneas pasan por una parada o pedir el recorrido de una línea. '
    + '¿Qué quieres saber?',

  repeticion: '¿Qué más quieres consultar?',

  despedida: 'Hasta luego.',

  noEntendido: 'No te he entendido. Puedes decir: ¿cuándo pasa el próximo autobús en Paseo Zorrilla 198 La Rubia?',

  sinParada: 'Dime el nombre o el número de la parada. Por ejemplo: Paseo Zorrilla 198 La Rubia, o la parada 400.',

  paradaNoEncontrada: (valor) => `No he encontrado ninguna parada que se parezca a ${escaparSsml(valor)}. `
    + 'Intenta decirlo de otra forma, por ejemplo, el nombre de la calle y el número.',

  paradaAmbigua: (opciones) => `He encontrado varias paradas parecidas: ${opciones}. ¿Cuál de ellas quieres consultar?`,

  confirmarParada: (nombre) => `¿Te refieres a la parada ${nombre}?`,

  descartarParada: 'De acuerdo, dime otra parada.',

  lineaDesconocida: (linea) => `No conozco ninguna línea ${escaparSsml(linea)} en la red de AUVASA.`,

  sinLlegadas: (nombre) => `Ahora mismo no hay autobuses previstos en la parada ${nombre} en las próximas horas.`,
  sinLlegadasLinea: (linea, nombre) => `Ahora mismo no hay ningún autobús de la línea ${linea} previsto en la parada ${nombre}.`,

  tituloLlegadas: (nombre, codigo) => `Parada ${nombre}, número ${codigo}.`,

  llegadaAhora: (codigo, destino) => `El ${codigo} hacia ${destino} está llegando.`,
  llegadaMinutos: (codigo, destino, minutos) => minutos === 1
    ? `El ${codigo} hacia ${destino}, en un minuto.`
    : `El ${codigo} hacia ${destino}, en ${minutos} minutos.`,
  llegadaHora: (hora) => `, a las ${hora}`,
  llegadaTiempoReal: ' Los datos están actualizados en tiempo real.',

  lineasEnParada: (nombre, listado) => `En la parada ${nombre} paran las líneas ${listado}.`,
  lineasSinServicio: (nombre) => `La parada ${nombre} no tiene líneas asignadas.`,
  lineaEnParada: (nombre, codigo) => `En la parada ${nombre} para la línea ${codigo}.`,

  recorridoLinea: (codigo, nombre, destino, listado) => `La línea ${codigo}${nombre ? `, ${nombre}` : ''}. Hacia ${destino}, pasa por ${listado}.`,
  recorridoVariosSentidos: (codigo) => `La línea ${codigo} tiene dos sentidos. `,
  recorridoDemasiadoLargo: 'y algunas paradas más',

  favoritaGuardada: (nombre) => `He guardado ${nombre} como tu parada favorita. `
    + 'Ahora puedes preguntarme cuándo pasa el próximo autobús en mi parada.',
  favoritaSinGuardar: 'Todavía no has guardado ninguna parada favorita. '
    + 'Puedes decir: guarda Paseo Zorrilla 198 La Rubia como mi parada favorita.',
  favoritaActual: (nombre) => `Tu parada favorita es ${nombre}.`,

  avisoHorario: ' Los horarios pueden variar; consulta siempre la información de la marquesina.',
};
