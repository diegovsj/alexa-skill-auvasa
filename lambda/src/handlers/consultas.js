'use strict';

/** Handlers de los intents principales de consulta. */

const Alexa = require('ask-sdk-core');

const catalogo = require('../services/catalogo');
const textos = require('../i18n/es');
const { enumerarParadas, limpiarNombreLinea } = require('../util/voz');
const comun = require('./comun');

/** Pregunta por los próximos autobuses en una parada. */
const ConsultarLlegadasIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(handlerInput.requestEnvelope) === 'ConsultarLlegadasIntent';
  },
  async handle(handlerInput) {
    const linea = comun.leerSlot(handlerInput, 'linea');
    const resultado = comun.resolverParada(handlerInput);

    if (resultado.estado === 'sinParada') {
      // Sin parada indicada: usamos la favorita si existe.
      const favorita = await comun.leerFavorita(handlerInput);
      if (favorita) return comun.responderLlegadas(handlerInput, favorita, { linea });

      return handlerInput.responseBuilder
        .speak(textos.sinParada)
        .reprompt(textos.sinParada)
        .getResponse();
    }

    if (resultado.estado === 'ambiguo') {
      return comun.pedirConfirmacion(handlerInput, resultado, 'llegadas');
    }

    if (resultado.estado === 'sinResultados') {
      return handlerInput.responseBuilder
        .speak(textos.paradaNoEncontrada(resultado.valor))
        .reprompt(textos.repeticion)
        .getResponse();
    }

    return comun.responderLlegadas(handlerInput, resultado.parada, { linea });
  },
};

/** Pregunta qué líneas pasan por una parada. */
const ConsultarLineasEnParadaIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(handlerInput.requestEnvelope) === 'ConsultarLineasEnParadaIntent';
  },
  async handle(handlerInput) {
    const resultado = comun.resolverParada(handlerInput);

    if (resultado.estado === 'ambiguo') {
      return comun.pedirConfirmacion(handlerInput, resultado, 'lineas');
    }
    if (resultado.estado !== 'ok') {
      const mensaje = resultado.estado === 'sinResultados'
        ? textos.paradaNoEncontrada(resultado.valor)
        : textos.sinParada;
      return handlerInput.responseBuilder.speak(mensaje).reprompt(textos.sinParada).getResponse();
    }

    return respuestaLineasEnParada(handlerInput, resultado.parada);
  },
};

/**
 * @param {object} handlerInput
 * @param {object} parada
 */
function respuestaLineasEnParada(handlerInput, parada) {
  const lineas = catalogo.lineasEnParada(parada.id);
  if (lineas.length === 0) {
    return handlerInput.responseBuilder
      .speak(textos.lineasSinServicio(parada.nombre))
      .reprompt(textos.repeticion)
      .getResponse();
  }

  const codigos = lineas.map((l) => l.codigo);
  const listado = codigos.length <= 1
    ? codigos.join('')
    : `${codigos.slice(0, -1).join(', ')} y ${codigos[codigos.length - 1]}`;

  return handlerInput.responseBuilder
    .speak(textos.lineasEnParada(parada.nombre, listado))
    .reprompt(textos.repeticion)
    .getResponse();
}

/** Pregunta por las paradas de una línea. */
const ConsultarParadasDeLineaIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(handlerInput.requestEnvelope) === 'ConsultarParadasDeLineaIntent';
  },
  handle(handlerInput) {
    const codigo = comun.leerSlot(handlerInput, 'linea');
    if (!codigo) {
      return handlerInput.responseBuilder
        .speak('Dime de qué línea quieres conocer el recorrido.')
        .reprompt('Por ejemplo: ¿por qué paradas pasa la línea 3?')
        .getResponse();
    }

    const linea = catalogo.lineaPorCodigo(codigo);
    if (!linea) {
      return handlerInput.responseBuilder
        .speak(textos.lineaDesconocida(codigo))
        .reprompt(textos.repeticion)
        .getResponse();
    }

    const recorridos = catalogo.recorridosDeLinea(linea);
    if (recorridos.length === 0) {
      return handlerInput.responseBuilder
        .speak(textos.sinLlegadasLinea(linea.codigo, ''))
        .reprompt(textos.repeticion)
        .getResponse();
    }

    const nombreLargo = limpiarNombreLinea(linea);
    // Si el nombre largo ya empieza por uno de los destinos, no aporta nada
    // repetirlo (es el caso de las circulares y de muchas líneas radiales).
    const mostrarNombre = Boolean(nombreLargo)
      && !recorridos.some((r) => nombreLargo.toLowerCase().startsWith(r.destino.toLowerCase()));

    let respuesta;
    if (recorridos.length === 1) {
      respuesta = textos.recorridoLinea(
        linea.codigo,
        mostrarNombre ? nombreLargo : '',
        recorridos[0].destino,
        enumerarParadas(recorridos[0].paradas, 12, textos),
      );
    } else {
      const prefijo = `La línea ${linea.codigo}. `;
      const partes = recorridos.map((r) => textos.recorridoLinea(
        linea.codigo,
        '',
        r.destino,
        enumerarParadas(r.paradas, 12, textos),
      ).replace(prefijo, ''));
      respuesta = textos.recorridoVariosSentidos(linea.codigo) + partes.join(' ');
    }

    return handlerInput.responseBuilder
      .speak(respuesta)
      .reprompt(textos.repeticion)
      .getResponse();
  },
};

module.exports = {
  ConsultarLlegadasIntentHandler,
  ConsultarLineasEnParadaIntentHandler,
  ConsultarParadasDeLineaIntentHandler,
  respuestaLineasEnParada,
};
