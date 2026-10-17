'use strict';

/**
 * Utilidades compartidas por los handlers: resolución de la parada pedida,
 * gestión de la pregunta de confirmación y construcción de la respuesta con
 * las próximas llegadas.
 */

const Alexa = require('ask-sdk-core');

const catalogo = require('../services/catalogo');
const horarios = require('../services/horarios');
const { describirLlegadas } = require('../util/voz');
const { normalizar } = require('../util/texto');
const textos = require('../i18n/es');

const CLAVE_PENDIENTE = 'paradaPendiente';

/** Puntuación mínima para aceptar una coincidencia sin preguntar. */
const UMBRAL_CONFIANZA = 90;

/**
 * @param {object} handlerInput
 * @param {string} nombre
 * @returns {string|undefined}
 */
function leerSlot(handlerInput, nombre) {
  try {
    return Alexa.getSlotValue(handlerInput.requestEnvelope, nombre);
  } catch (error) {
    return undefined;
  }
}

/**
 * Texto que identifica una parada: "545 en Calle Morena".
 *
 * @param {object} parada
 * @returns {string}
 */
function etiquetaParada(parada) {
  return `${parada.codigo} en ${parada.nombre}`;
}

/**
 * ¿El usuario ha dicho "mi parada" (en lugar de un nombre o un número)?
 *
 * @param {string} valor
 * @returns {boolean}
 */
function esMiParada(valor) {
  if (!valor) return false;
  return normalizar(valor).includes('mi parada');
}

/**
 * Interpreta el slot `parada` y decide si la coincidencia es fiable.
 *
 * @param {object} handlerInput
 * @param {string} [nombreSlot]
 * @returns {{estado: 'ok', parada: object}
 *   | {estado: 'sinParada'}
 *   | {estado: 'sinResultados', valor: string}
 *   | {estado: 'ambiguo', valor: string, candidatos: object[]}}
 */
function resolverParada(handlerInput, nombreSlot = 'parada') {
  const valor = leerSlot(handlerInput, nombreSlot);
  const reconocidas = paradasReconocidas(handlerInput, nombreSlot);

  if (!valor && reconocidas.length === 0) return { estado: 'sinParada' };

  // Si Alexa ha reconocido la parada, nos fiamos de su resolución; si hay
  // varias, preguntamos cuál.
  if (reconocidas.length === 1) return { estado: 'ok', parada: reconocidas[0] };
  if (reconocidas.length > 1) {
    return {
      estado: 'ambiguo',
      valor: valor || reconocidas[0].nombre,
      candidatos: reconocidas.slice(0, 3).map((parada) => ({ parada })),
    };
  }

  const candidatos = catalogo.buscarParadas(valor, { limite: 5 });
  if (candidatos.length === 0) return { estado: 'sinResultados', valor };

  const mejor = candidatos[0];
  if (mejor.motivo === 'codigo' || mejor.puntuacion >= UMBRAL_CONFIANZA) {
    return { estado: 'ok', parada: mejor.parada };
  }
  return { estado: 'ambiguo', valor, candidatos: candidatos.slice(0, 3) };
}

/**
 * Paradas que Alexa ha reconocido para un slot (entity resolution). Es más
 * fiable que la búsqueda difusa porque usa el propio vocabulario del modelo.
 *
 * @param {object} handlerInput
 * @param {string} nombreSlot
 * @returns {object[]}
 */
function paradasReconocidas(handlerInput, nombreSlot) {
  const slot = handlerInput.requestEnvelope?.request?.intent?.slots?.[nombreSlot];
  const valores = slot?.resolutions?.resolutionsPerAuthority?.[0]?.values || [];
  const paradas = [];
  for (const v of valores) {
    const encontrada = catalogo.buscarParadas(v.name, { limite: 1 })[0]?.parada;
    if (encontrada && !paradas.some((p) => p.id === encontrada.id)) paradas.push(encontrada);
  }
  return paradas;
}

/**
 * Guarda en la sesión la parada pendiente de confirmar y la acción que hay que
 * ejecutar cuando el usuario responda que sí.
 *
 * @param {object} handlerInput
 * @param {object[]} candidatos
 * @param {string} accion
 */
function guardarPendiente(handlerInput, candidatos, accion) {
  handlerInput.attributesManager.setSessionAttributes({
    [CLAVE_PENDIENTE]: {
      accion,
      candidatos: candidatos.map((c) => ({ id: c.id ?? c.parada?.id, nombre: c.nombre ?? c.parada?.nombre })),
      indice: 0,
    },
  });
}

/**
 * @param {object} handlerInput
 * @returns {{accion: string, candidatos: object[], indice: number}|undefined}
 */
function leerPendiente(handlerInput) {
  return handlerInput.attributesManager.getSessionAttributes()[CLAVE_PENDIENTE];
}

/**
 * @param {object} handlerInput
 */
function limpiarPendiente(handlerInput) {
  const atributos = handlerInput.attributesManager.getSessionAttributes();
  delete atributos[CLAVE_PENDIENTE];
  handlerInput.attributesManager.setSessionAttributes(atributos);
}

/**
 * Pregunta al usuario si se refería a la primera coincidencia encontrada.
 *
 * @param {object} handlerInput
 * @param {{valor: string, candidatos: object[]}} resultado
 * @param {string} accion
 * @returns {object}
 */
function pedirConfirmacion(handlerInput, resultado, accion) {
  const candidatos = resultado.candidatos.map((c) => c.parada);
  guardarPendiente(handlerInput, candidatos, accion);

  const opciones = candidatos.map((p) => p.nombre);
  return handlerInput.responseBuilder
    .speak(textos.confirmarParada(candidatos[0].nombre))
    .reprompt(textos.paradaAmbigua(opciones.join(', ')))
    .getResponse();
}

/**
 * Construye la respuesta con las próximas llegadas a una parada.
 *
 * @param {object} handlerInput
 * @param {object} parada
 * @param {{linea?: string, limite?: number, otrasLineas?: boolean, prefijo?: string}} [opciones]
 * @returns {Promise<object>}
 */
async function responderLlegadas(handlerInput, parada, opciones = {}) {
  const { linea, limite, otrasLineas, prefijo, sugerirFavorita } = opciones;
  const etiqueta = etiquetaParada(parada);
  const resultado = await horarios.proximasLlegadas(parada.id, {
    linea,
    limite: limite ?? (linea ? 2 : 3),
  });

  const hablar = (texto, reprompt = textos.repeticion) => handlerInput.responseBuilder
    .speak(prefijo ? `${prefijo} ${texto}` : texto)
    .reprompt(reprompt)
    .getResponse();

  if (resultado.aviso === 'lineaDesconocida') {
    return hablar(textos.lineaDesconocida(linea));
  }

  // ¿La línea pedida presta servicio en esta parada?
  if (linea) {
    const conocida = catalogo.lineaPorCodigo(linea);
    const pasa = conocida
      && catalogo.lineasEnParada(parada.id).some((l) => l.codigo === conocida.codigo);
    if (!pasa) return hablar(textos.lineaNoPasa(linea, etiqueta));
  }

  let extra = otrasLineas ? textos.otrasLineasEnParada : '';

  if (resultado.llegadas.length === 0) {
    const mensaje = linea
      ? textos.sinLlegadasLinea(linea, etiqueta)
      : textos.sinLlegadas(etiqueta);
    return hablar(`${mensaje}${extra}`);
  }

  const cuerpo = describirLlegadas(resultado.llegadas, textos);
  const hayTiempoReal = resultado.llegadas.some((l) => l.tiempoReal);
  const sufijo = hayTiempoReal ? '' : textos.avisoSinTiempoReal;

  let reprompt = textos.repeticion;
  const pregunta = textoPreguntaFavoritos(sugerirFavorita, linea);
  if (pregunta && marcarFavoritaSugerida(handlerInput, {
    paradaId: sugerirFavorita.parada ? parada.id : undefined,
    lineaCodigo: sugerirFavorita.linea ? linea : undefined,
  })) {
    extra += ` ${pregunta}`;
    reprompt = pregunta;
  }

  return hablar(`${textos.tituloLlegadas(etiqueta)} ${cuerpo}${sufijo}${extra}`, reprompt);
}

/**
 * Texto de la pregunta para guardar los favoritos que falten.
 *
 * @param {{parada?: boolean, linea?: boolean}|undefined} sugerirFavorita
 * @param {string|undefined} linea
 * @returns {string}
 */
function textoPreguntaFavoritos(sugerirFavorita, linea) {
  if (!sugerirFavorita) return '';
  if (sugerirFavorita.parada && sugerirFavorita.linea) return textos.sugerirParadaYLinea(linea);
  if (sugerirFavorita.parada) return textos.sugerirFavorita;
  if (sugerirFavorita.linea) return textos.sugerirLineaFavorita(linea);
  return '';
}

/**
 * Plantea guardar la parada y/o la línea como favoritas (una vez por sesión).
 *
 * @param {object} handlerInput
 * @param {{paradaId?: string, lineaCodigo?: string}} sugerida
 * @returns {boolean}
 */
function marcarFavoritaSugerida(handlerInput, sugerida) {
  const atributos = handlerInput.attributesManager.getSessionAttributes();
  if (atributos.favoritaPreguntada) return false;
  atributos.favoritaSugerida = sugerida;
  atributos.favoritaPreguntada = true;
  handlerInput.attributesManager.setSessionAttributes(atributos);
  return true;
}

/**
 * Recupera la parada favorita guardada por el usuario.
 *
 * @param {object} handlerInput
 * @returns {Promise<object|undefined>}
 */
async function leerFavorita(handlerInput) {
  const atributos = await handlerInput.attributesManager.getPersistentAttributes();
  const guardada = atributos.paradaFavorita;
  if (!guardada) return undefined;
  return catalogo.paradaPorId(guardada.id) || catalogo.paradaPorCodigo(guardada.codigo);
}

/**
 * Recupera la línea favorita guardada por el usuario.
 *
 * @param {object} handlerInput
 * @returns {Promise<object|undefined>}
 */
async function leerLineaFavorita(handlerInput) {
  const atributos = await handlerInput.attributesManager.getPersistentAttributes();
  const guardada = atributos.lineaFavorita;
  if (!guardada) return undefined;
  return catalogo.lineaPorCodigo(guardada.codigo);
}

/**
 * ¿La línea presta servicio en esta parada?
 *
 * @param {object} parada
 * @param {object} linea
 * @returns {boolean}
 */
function lineaPasaPorParada(parada, linea) {
  return catalogo.lineasEnParada(parada.id).some((l) => l.codigo === linea.codigo);
}

module.exports = {
  leerSlot,
  etiquetaParada,
  esMiParada,
  resolverParada,
  guardarPendiente,
  leerPendiente,
  limpiarPendiente,
  pedirConfirmacion,
  responderLlegadas,
  marcarFavoritaSugerida,
  leerFavorita,
  leerLineaFavorita,
  lineaPasaPorParada,
  UMBRAL_CONFIANZA,
  CLAVE_PENDIENTE,
};
