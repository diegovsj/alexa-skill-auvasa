/**
 * simular.mjs
 *
 * Envía peticiones falsas a la Lambda de la skill para probarla en local, sin
 * necesidad de cuenta de desarrollador de Amazon.
 *
 * Ejemplos:
 *   node tools/simular.mjs --lanzar
 *   node tools/simular.mjs --intent ConsultarLlegadasIntent --texto "zorrilla 198"
 *   node tools/simular.mjs --intent ConsultarLlegadasIntent --parada "Calle Doctrinos 12 esquina María de Molina" --linea 3
 *   node tools/simular.mjs --intent ConsultarLineasEnParadaIntent --texto "plaza mayor"
 *   node tools/simular.mjs --intent ConsultarParadasDeLineaIntent --linea C1
 *   node tools/simular.mjs --intent GuardarParadaFavoritaIntent --texto "zorrilla 198"
 *   node tools/simular.mjs --intent ConsultarParadaFavoritaIntent
 *   node tools/simular.mjs --intent ConsultarLlegadasIntent --texto "zorrilla 198" --json
 */

import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { cargarEnv } from './lib/dotenv.mjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, '..');
const require = createRequire(import.meta.url);

// Cargamos `.env` ANTES de requerir la Lambda: algunos módulos leen variables
// de entorno al cargarse (zona horaria, URLs del feed...).
cargarEnv();

const catalogo = require('../lambda/src/services/catalogo');
const { handler } = require('../lambda/index.js');

/**
 * @param {string[]} argv
 */
function opciones(argv) {
  const o = { intent: 'ConsultarLlegadasIntent' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') o.json = true;
    else if (a === '--lanzar') o.lanzar = true;
    else if (a.startsWith('--')) o[a.slice(2)] = argv[++i];
  }
  return o;
}

/**
 * Alexa entrega siempre el valor canónico del slot (el `name` del tipo). Para
 * parecernos a Alexa, resolvemos el texto libre a la parada más parecida.
 *
 * @param {string|undefined} texto
 * @returns {string|undefined}
 */
function canonizarParada(texto) {
  if (!texto) return undefined;
  const [mejor] = catalogo.buscarParadas(texto, { limite: 1 });
  if (!mejor) return texto;
  if (opcionesActivas?.debug) {
    console.log(`   (slot PARADA resuelto a "${mejor.parada.nombre}" con puntuación ${mejor.puntuacion})`);
  }
  return mejor.parada.nombre;
}

/**
 * El SDK envuelve siempre el texto en `<speak>`; lo desenvolvemos para leerlo.
 *
 * @param {{text?: string, ssml?: string}|undefined} salida
 * @returns {string}
 */
function desnudar(salida) {
  const bruto = salida?.text || salida?.ssml || '';
  return bruto.replace(/^<speak>/, '').replace(/<\/speak>$/, '').trim();
}

let opcionesActivas;

function construirPeticion(o) {
  const slots = {};
  const parada = canonizarParada(o.texto || o.parada);
  if (parada) slots.parada = { name: 'parada', value: parada, confirmationStatus: 'NONE' };
  if (o.linea) slots.linea = { name: 'linea', value: String(o.linea), confirmationStatus: 'NONE' };

  return {
    version: '1.0',
    session: {
      new: true,
      sessionId: 'amzn1.echo-api.session.simulada',
      application: { applicationId: 'amzn1.ask.skill.simulada' },
      attributes: {},
      user: { userId: 'amzn1.ask.account.simulada' },
    },
    context: {
      System: {
        application: { applicationId: 'amzn1.ask.skill.simulada' },
        user: { userId: 'amzn1.ask.account.simulada' },
        device: { deviceId: 'amzn1.ask.device.simulada', supportedInterfaces: {} },
        apiEndpoint: 'https://api.eu.amazonalexa.com',
        apiAccessToken: 'token-simulado',
      },
    },
    request: {
      type: 'IntentRequest',
      requestId: 'amzn1.echo-api.request.simulada',
      timestamp: new Date().toISOString(),
      locale: 'es-ES',
      intent: { name: o.intent, confirmationStatus: 'NONE', slots },
    },
  };
}

function construirLanzamiento() {
  return {
    version: '1.0',
    session: {
      new: true,
      sessionId: 'amzn1.echo-api.session.simulada',
      application: { applicationId: 'amzn1.ask.skill.simulada' },
      attributes: {},
      user: { userId: 'amzn1.ask.account.simulada' },
    },
    context: {
      System: {
        application: { applicationId: 'amzn1.ask.skill.simulada' },
        user: { userId: 'amzn1.ask.account.simulada' },
        device: { deviceId: 'amzn1.ask.device.simulada', supportedInterfaces: {} },
        apiEndpoint: 'https://api.eu.amazonalexa.com',
        apiAccessToken: 'token-simulado',
      },
    },
    request: {
      type: 'LaunchRequest',
      requestId: 'amzn1.echo-api.request.simulada',
      timestamp: new Date().toISOString(),
      locale: 'es-ES',
    },
  };
}

const o = opciones(process.argv.slice(2));
opcionesActivas = o;

const peticion = o.lanzar ? construirLanzamiento() : construirPeticion(o);

const respuesta = await handler(peticion, { awsRequestId: 'simulada' });

const texto = desnudar(respuesta?.response?.outputSpeech) || '(sin respuesta hablada)';

if (o.json) {
  console.log(JSON.stringify(respuesta, null, 2));
} else {
  console.log('Alexa dice:');
  console.log(`  «${texto}»`);
  const reprompt = desnudar(respuesta?.response?.reprompt?.outputSpeech);
  if (reprompt) {
    console.log(`  (reprompt: «${reprompt}»)`);
  }
  if (respuesta?.response?.shouldEndSession) {
    console.log('  (la sesión termina)');
  }
}
