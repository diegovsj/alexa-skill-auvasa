'use strict';

/** Handlers de la parada favorita del usuario. */

const Alexa = require('ask-sdk-core');

const textos = require('../i18n/es');
const comun = require('./comun');

/** Guarda una parada como favorita (atributos persistentes). */
const GuardarParadaFavoritaIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(handlerInput.requestEnvelope) === 'GuardarParadaFavoritaIntent';
  },
  async handle(handlerInput) {
    const resultado = comun.resolverParada(handlerInput);

    if (resultado.estado === 'ambiguo') {
      return comun.pedirConfirmacion(handlerInput, resultado, 'favorita');
    }
    if (resultado.estado !== 'ok') {
      const mensaje = resultado.estado === 'sinResultados'
        ? textos.paradaNoEncontrada(resultado.valor)
        : textos.sinParada;
      return handlerInput.responseBuilder.speak(mensaje).reprompt(textos.sinParada).getResponse();
    }

    return guardarFavorita(handlerInput, resultado.parada);
  },
};

/**
 * @param {object} handlerInput
 * @param {object} parada
 */
async function guardarFavorita(handlerInput, parada) {
  const atributos = await handlerInput.attributesManager.getPersistentAttributes();
  atributos.paradaFavorita = {
    id: parada.id,
    codigo: parada.codigo,
    nombre: parada.nombre,
  };
  handlerInput.attributesManager.setPersistentAttributes(atributos);
  try {
    await handlerInput.attributesManager.savePersistentAttributes();
  } catch (error) {
    // Alexa-hosted sin DynamoDB disponible: la skill sigue funcionando, solo
    // se pierde la persistencia entre sesiones.
    console.warn('[auvasa] no se pudo guardar la parada favorita:', error.message);
  }

  return handlerInput.responseBuilder
    .speak(textos.favoritaGuardada(parada.nombre))
    .reprompt(textos.repeticion)
    .getResponse();
}

/** Consulta los próximos autobuses en la parada favorita. */
const ConsultarParadaFavoritaIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(handlerInput.requestEnvelope) === 'ConsultarParadaFavoritaIntent';
  },
  async handle(handlerInput) {
    const favorita = await comun.leerFavorita(handlerInput);
    if (!favorita) {
      return handlerInput.responseBuilder
        .speak(textos.favoritaSinGuardar)
        .reprompt(textos.repeticion)
        .getResponse();
    }
    return comun.responderLlegadas(handlerInput, favorita);
  },
};

module.exports = {
  GuardarParadaFavoritaIntentHandler,
  ConsultarParadaFavoritaIntentHandler,
  guardarFavorita,
};
