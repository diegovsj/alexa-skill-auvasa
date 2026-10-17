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
  if (!valor) return { estado: 'sinParada' };

  const candidatos = catalogo.buscarParadas(valor, { limite: 5 });
  if (candidatos.length === 0) return { estado: 'sinResultados', valor };

  const mejor = candidatos[0];
  if (mejor.motivo === 'codigo' || mejor.puntuacion >= UMBRAL_CONFIANZA) {
    return { estado: 'ok', parada: mejor.parada };
  }
  return { estado: 'ambiguo', valor, candidatos: candidatos.slice(0, 3) };
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
 * @param {{linea?: string, limite?: number}} [opciones]
 * @returns {Promise<object>}
 */
async function responderLlegadas(handlerInput, parada, opciones = {}) {
  const resultado = await horarios.proximasLlegadas(parada.id, {
    linea: opciones.linea,
    limite: opciones.limite ?? 3,
  });

  if (resultado.aviso === 'lineaDesconocida') {
    return handlerInput.responseBuilder
      .speak(textos.lineaDesconocida(opciones.linea))
      .reprompt(textos.repeticion)
      .getResponse();
  }

  const cabecera = textos.tituloLlegadas(parada.nombre, parada.codigo);

  if (resultado.llegadas.length === 0) {
    const mensaje = opciones.linea
      ? textos.sinLlegadasLinea(opciones.linea, parada.nombre)
      : textos.sinLlegadas(parada.nombre);
    return handlerInput.responseBuilder
      .speak(mensaje)
      .reprompt(textos.repeticion)
      .getResponse();
  }

  const cuerpo = describirLlegadas(resultado.llegadas, textos);
  const hayTiempoReal = resultado.llegadas.some((l) => l.tiempoReal);
  const sufijo = hayTiempoReal ? textos.llegadaTiempoReal : '';

  return handlerInput.responseBuilder
    .speak(`${cabecera} ${cuerpo}${sufijo}`)
    .reprompt(textos.repeticion)
    .getResponse();
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

module.exports = {
  leerSlot,
  resolverParada,
  guardarPendiente,
  leerPendiente,
  limpiarPendiente,
  pedirConfirmacion,
  responderLlegadas,
  leerFavorita,
  UMBRAL_CONFIANZA,
  CLAVE_PENDIENTE,
};
