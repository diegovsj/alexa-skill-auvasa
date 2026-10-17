'use strict';

/** Handlers de los intents principales de consulta. */

const Alexa = require('ask-sdk-core');

const catalogo = require('../services/catalogo');
const textos = require('../i18n/es');
const { enumerarParadas, limpiarNombreLinea } = require('../util/voz');
const comun = require('./comun');

/** Número de paradas que se enumeran de un recorrido sin pedir el "completo". */
const PARADAS_RECORRIDO = 8;

/** Pregunta por los próximos autobuses en una parada. */
const ConsultarLlegadasIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(handlerInput.requestEnvelope) === 'ConsultarLlegadasIntent';
  },
  async handle(handlerInput) {
    const linea = comun.leerSlot(handlerInput, 'linea');
    const valorParada = comun.leerSlot(handlerInput, 'parada');

    // Sin parada (o "mi parada"): usamos la favorita si existe.
    if (!valorParada || comun.esMiParada(valorParada)) {
      const favorita = await comun.leerFavorita(handlerInput);
      if (favorita) {
        const lineaFavorita = await comun.leerLineaFavorita(handlerInput);
        return comun.responderLlegadas(handlerInput, favorita, {
          linea,
          sugerirFavorita: { parada: false, linea: Boolean(linea) && !lineaFavorita },
        });
      }

      return handlerInput.responseBuilder
        .speak(textos.sinParada)
        .reprompt(textos.sinParada)
        .getResponse();
    }

    const resultado = comun.resolverParada(handlerInput);

    if (resultado.estado === 'ambiguo') {
      return comun.pedirConfirmacion(handlerInput, resultado, 'llegadas');
    }

    if (resultado.estado === 'sinResultados') {
      return handlerInput.responseBuilder
        .speak(textos.paradaNoEncontrada(resultado.valor))
        .reprompt(textos.repeticion)
        .getResponse();
    }

    const favorita = await comun.leerFavorita(handlerInput);
    const lineaFavorita = await comun.leerLineaFavorita(handlerInput);
    return comun.responderLlegadas(handlerInput, resultado.parada, {
      linea,
      sugerirFavorita: { parada: !favorita, linea: Boolean(linea) && !lineaFavorita },
    });
  },
};

/** Pregunta qué líneas pasan por una parada. */
const ConsultarLineasEnParadaIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(handlerInput.requestEnvelope) === 'ConsultarLineasEnParadaIntent';
  },
  async handle(handlerInput) {
    const valorParada = comun.leerSlot(handlerInput, 'parada');

    if (!valorParada || comun.esMiParada(valorParada)) {
      const favorita = await comun.leerFavorita(handlerInput);
      if (favorita) return respuestaLineasEnParada(handlerInput, favorita);

      return handlerInput.responseBuilder.speak(textos.sinParada).reprompt(textos.sinParada).getResponse();
    }

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

    const favorita = await comun.leerFavorita(handlerInput);
    return respuestaLineasEnParada(handlerInput, resultado.parada, { sugerirFavorita: !favorita });
  },
};

/**
 * @param {object} handlerInput
 * @param {object} parada
 * @param {{sugerirFavorita?: boolean}} [opciones]
 */
function respuestaLineasEnParada(handlerInput, parada, opciones = {}) {
  const etiqueta = comun.etiquetaParada(parada);
  const lineas = catalogo.lineasEnParada(parada.id);
  if (lineas.length === 0) {
    return handlerInput.responseBuilder
      .speak(textos.lineasSinServicio(etiqueta))
      .reprompt(textos.repeticion)
      .getResponse();
  }

  const codigos = lineas.map((l) => l.codigo);
  const listado = codigos.length <= 1
    ? codigos.join('')
    : `${codigos.slice(0, -1).join(', ')} y ${codigos[codigos.length - 1]}`;

  let extra = '';
  let reprompt = textos.repeticion;
  if (opciones.sugerirFavorita && comun.marcarFavoritaSugerida(handlerInput, { paradaId: parada.id })) {
    extra = ` ${textos.sugerirFavorita}`;
    reprompt = textos.sugerirFavorita;
  }

  return handlerInput.responseBuilder
    .speak(`${textos.lineasEnParada(etiqueta, listado)}${extra}`)
    .reprompt(reprompt)
    .getResponse();
}

/**
 * Construye la respuesta con el recorrido de una línea.
 *
 * @param {object} handlerInput
 * @param {string} codigo
 * @param {boolean} completo si es `true`, no recorta la lista de paradas
 * @returns {object}
 */
function responderRecorrido(handlerInput, codigo, completo) {
  if (!codigo) {
    return handlerInput.responseBuilder
      .speak('Dime de qué línea quieres el recorrido.')
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
      .speak(textos.recorridoNoDisponible(linea.codigo))
      .reprompt(textos.repeticion)
      .getResponse();
  }

  const nombreLargo = limpiarNombreLinea(linea);
  // Si el nombre largo ya empieza por uno de los destinos, no aporta nada
  // repetirlo (es el caso de las circulares y de muchas líneas radiales).
  const mostrarNombre = Boolean(nombreLargo)
    && !recorridos.some((r) => nombreLargo.toLowerCase().startsWith(r.destino.toLowerCase()));

  const maximo = (paradas) => (completo ? paradas.length : PARADAS_RECORRIDO);

  let respuesta;
  if (recorridos.length === 1) {
    respuesta = textos.recorridoLinea(
      linea.codigo,
      mostrarNombre ? nombreLargo : '',
      recorridos[0].destino,
      enumerarParadas(recorridos[0].paradas, maximo(recorridos[0].paradas), textos),
    );
  } else {
    const prefijo = `La línea ${linea.codigo}. `;
    const partes = recorridos.map((r) => textos.recorridoLinea(
      linea.codigo,
      '',
      r.destino,
      enumerarParadas(r.paradas, maximo(r.paradas), textos),
    ).replace(prefijo, ''));
    respuesta = textos.recorridoVariosSentidos(linea.codigo) + partes.join(' ');
  }

  return handlerInput.responseBuilder
    .speak(respuesta)
    .reprompt(textos.repeticion)
    .getResponse();
}

/** Pregunta por las paradas de una línea (recorrido resumido). */
const ConsultarParadasDeLineaIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(handlerInput.requestEnvelope) === 'ConsultarParadasDeLineaIntent';
  },
  handle(handlerInput) {
    return responderRecorrido(handlerInput, comun.leerSlot(handlerInput, 'linea'), false);
  },
};

/** Pregunta por el recorrido completo de una línea (sin recortar). */
const ConsultarRecorridoCompletoIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(handlerInput.requestEnvelope) === 'ConsultarRecorridoCompletoIntent';
  },
  handle(handlerInput) {
    return responderRecorrido(handlerInput, comun.leerSlot(handlerInput, 'linea'), true);
  },
};

module.exports = {
  ConsultarLlegadasIntentHandler,
  ConsultarLineasEnParadaIntentHandler,
  respuestaLineasEnParada,
  ConsultarParadasDeLineaIntentHandler,
  ConsultarRecorridoCompletoIntentHandler,
  responderRecorrido,
};
