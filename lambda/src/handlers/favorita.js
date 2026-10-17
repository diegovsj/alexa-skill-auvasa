'use strict';

/** Handlers de la parada y la línea favoritas del usuario. */

const Alexa = require('ask-sdk-core');

const catalogo = require('../services/catalogo');
const textos = require('../i18n/es');
const comun = require('./comun');

/**
 * Guarda los atributos persistentes sin romper la skill si fallan.
 *
 * @param {object} handlerInput
 */
async function persistir(handlerInput) {
  try {
    await handlerInput.attributesManager.savePersistentAttributes();
  } catch (error) {
    // Alexa-hosted sin DynamoDB disponible: la skill sigue funcionando, solo
    // se pierde la persistencia entre sesiones.
    console.warn('[auvasa] no se pudieron guardar los favoritos:', error.message);
  }
}

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
  await persistir(handlerInput);

  const etiqueta = comun.etiquetaParada(parada);
  const lineaFavorita = atributos.lineaFavorita
    ? catalogo.lineaPorCodigo(atributos.lineaFavorita.codigo)
    : undefined;
  const aviso = lineaFavorita && !comun.lineaPasaPorParada(parada, lineaFavorita);

  return handlerInput.responseBuilder
    .speak(aviso
      ? textos.favoritaGuardadaConAviso(etiqueta, lineaFavorita.codigo)
      : textos.favoritaGuardada(etiqueta))
    .reprompt(textos.repeticion)
    .getResponse();
}

/** Guarda una línea como favorita. */
const GuardarLineaFavoritaIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(handlerInput.requestEnvelope) === 'GuardarLineaFavoritaIntent';
  },
  async handle(handlerInput) {
    const codigo = comun.leerSlot(handlerInput, 'linea');
    if (!codigo) {
      return handlerInput.responseBuilder
        .speak('Dime qué línea quieres guardar como favorita.')
        .reprompt('Por ejemplo: guarda la línea 5 como mi línea favorita.')
        .getResponse();
    }

    const linea = catalogo.lineaPorCodigo(codigo);
    if (!linea) {
      return handlerInput.responseBuilder
        .speak(textos.lineaDesconocida(codigo))
        .reprompt(textos.repeticion)
        .getResponse();
    }

    return guardarLineaFavorita(handlerInput, linea);
  },
};

/**
 * @param {object} handlerInput
 * @param {object} linea
 */
async function guardarLineaFavorita(handlerInput, linea) {
  const atributos = await handlerInput.attributesManager.getPersistentAttributes();
  atributos.lineaFavorita = { codigo: linea.codigo, nombre: linea.nombre };
  handlerInput.attributesManager.setPersistentAttributes(atributos);
  await persistir(handlerInput);

  const favorita = await comun.leerFavorita(handlerInput);
  const aviso = favorita && !comun.lineaPasaPorParada(favorita, linea);

  return handlerInput.responseBuilder
    .speak(aviso
      ? textos.lineaFavoritaGuardadaConAviso(linea.codigo, comun.etiquetaParada(favorita))
      : textos.lineaFavoritaGuardada(linea.codigo))
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

/** Dice cuál es la línea favorita. */
const ConsultarLineaFavoritaIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(handlerInput.requestEnvelope) === 'ConsultarLineaFavoritaIntent';
  },
  async handle(handlerInput) {
    const linea = await comun.leerLineaFavorita(handlerInput);
    return handlerInput.responseBuilder
      .speak(linea ? textos.lineaFavoritaActual(linea.codigo) : textos.lineaFavoritaSinGuardar)
      .reprompt(textos.repeticion)
      .getResponse();
  },
};

/** Borra la parada favorita. */
const OlvidarParadaFavoritaIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(handlerInput.requestEnvelope) === 'OlvidarParadaFavoritaIntent';
  },
  async handle(handlerInput) {
    const atributos = await handlerInput.attributesManager.getPersistentAttributes();
    delete atributos.paradaFavorita;
    handlerInput.attributesManager.setPersistentAttributes(atributos);
    await persistir(handlerInput);

    return handlerInput.responseBuilder
      .speak(textos.favoritaOlvidada)
      .reprompt(textos.repeticion)
      .getResponse();
  },
};

/** Borra la línea favorita. */
const OlvidarLineaFavoritaIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(handlerInput.requestEnvelope) === 'OlvidarLineaFavoritaIntent';
  },
  async handle(handlerInput) {
    const atributos = await handlerInput.attributesManager.getPersistentAttributes();
    delete atributos.lineaFavorita;
    handlerInput.attributesManager.setPersistentAttributes(atributos);
    await persistir(handlerInput);

    return handlerInput.responseBuilder
      .speak(textos.lineaFavoritaOlvidada)
      .reprompt(textos.repeticion)
      .getResponse();
  },
};

module.exports = {
  GuardarParadaFavoritaIntentHandler,
  guardarFavorita,
  GuardarLineaFavoritaIntentHandler,
  ConsultarParadaFavoritaIntentHandler,
  ConsultarLineaFavoritaIntentHandler,
  OlvidarParadaFavoritaIntentHandler,
  OlvidarLineaFavoritaIntentHandler,
};
