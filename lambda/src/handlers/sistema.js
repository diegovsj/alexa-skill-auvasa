'use strict';

/** Handlers de sistema: bienvenida, ayuda, confirmaciones, parada y errores. */

const Alexa = require('ask-sdk-core');

const catalogo = require('../services/catalogo');
const textos = require('../i18n/es');
const comun = require('./comun');
const { respuestaLineasEnParada } = require('./consultas');
const { guardarFavorita } = require('./favorita');

const LanzamientoHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'LaunchRequest';
  },
  handle(handlerInput) {
    return handlerInput.responseBuilder
      .speak(textos.bienvenida)
      .reprompt(textos.repeticion)
      .getResponse();
  },
};

const AyudaIntentHandler = {
  canHandle(handlerInput) {
    const tipo = Alexa.getRequestType(handlerInput.requestEnvelope);
    if (tipo !== 'IntentRequest') return false;
    const intent = Alexa.getIntentName(handlerInput.requestEnvelope);
    return intent === 'AMAZON.HelpIntent' || intent === 'AyudaIntent';
  },
  handle(handlerInput) {
    return handlerInput.responseBuilder
      .speak(textos.ayuda)
      .reprompt(textos.repeticion)
      .getResponse();
  },
};

/**
 * Ejecuta la acción que quedó pendiente de confirmar.
 *
 * @param {object} handlerInput
 * @param {object} pendiente
 * @returns {Promise<object>}
 */
async function ejecutarPendiente(handlerInput, pendiente) {
  const elegida = pendiente.candidatos[pendiente.indice];
  const parada = catalogo.paradaPorId(elegida.id);
  comun.limpiarPendiente(handlerInput);

  if (!parada) {
    return handlerInput.responseBuilder
      .speak(textos.paradaNoEncontrada(elegida.nombre))
      .reprompt(textos.repeticion)
      .getResponse();
  }

  switch (pendiente.accion) {
    case 'lineas':
      return respuestaLineasEnParada(handlerInput, parada);
    case 'favorita':
      return guardarFavorita(handlerInput, parada);
    case 'llegadas':
    default:
      return comun.responderLlegadas(handlerInput, parada);
  }
}

const SiIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.YesIntent';
  },
  async handle(handlerInput) {
    const pendiente = comun.leerPendiente(handlerInput);
    if (pendiente) return ejecutarPendiente(handlerInput, pendiente);

    return handlerInput.responseBuilder
      .speak(textos.ayuda)
      .reprompt(textos.repeticion)
      .getResponse();
  },
};

const NoIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.NoIntent';
  },
  handle(handlerInput) {
    const pendiente = comun.leerPendiente(handlerInput);

    if (pendiente && pendiente.indice + 1 < pendiente.candidatos.length) {
      pendiente.indice += 1;
      handlerInput.attributesManager.setSessionAttributes({ [comun.CLAVE_PENDIENTE]: pendiente });
      const siguiente = pendiente.candidatos[pendiente.indice];
      return handlerInput.responseBuilder
        .speak(textos.confirmarParada(siguiente.nombre))
        .reprompt(textos.repeticion)
        .getResponse();
    }

    comun.limpiarPendiente(handlerInput);
    return handlerInput.responseBuilder
      .speak(textos.descartarParada)
      .reprompt(textos.sinParada)
      .getResponse();
  },
};

const SalirIntentHandler = {
  canHandle(handlerInput) {
    if (Alexa.getRequestType(handlerInput.requestEnvelope) !== 'IntentRequest') return false;
    const intent = Alexa.getIntentName(handlerInput.requestEnvelope);
    return intent === 'AMAZON.StopIntent'
      || intent === 'AMAZON.CancelIntent'
      || intent === 'AMAZON.NavigateHomeIntent';
  },
  handle(handlerInput) {
    return handlerInput.responseBuilder
      .speak(textos.despedida)
      .withShouldEndSession(true)
      .getResponse();
  },
};

const NoEntendidoHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.FallbackIntent';
  },
  handle(handlerInput) {
    return handlerInput.responseBuilder
      .speak(textos.noEntendido)
      .reprompt(textos.ayuda)
      .getResponse();
  },
};

const FinSesionHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'SessionEndedRequest';
  },
  handle(handlerInput) {
    return handlerInput.responseBuilder.getResponse();
  },
};

const ErrorHandler = {
  canHandle() {
    return true;
  },
  handle(handlerInput, error) {
    console.error('[auvasa] error no controlado:', error);
    return handlerInput.responseBuilder
      .speak('Lo siento, ha ocurrido un problema al consultar los datos de AUVASA. Inténtalo de nuevo.')
      .reprompt(textos.repeticion)
      .getResponse();
  },
};

module.exports = {
  LanzamientoHandler,
  AyudaIntentHandler,
  SiIntentHandler,
  NoIntentHandler,
  SalirIntentHandler,
  NoEntendidoHandler,
  FinSesionHandler,
  ErrorHandler,
  ejecutarPendiente,
};
