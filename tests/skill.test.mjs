import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// ---------------------------------------------------------------- entorno --
// Desactivamos el feed en tiempo real (determinista y sin red) y fijamos el
// instante de referencia a las 08:00 de un día con servicio del calendario.
process.env.AUVASA_RT_DISABLED = '1';

const almacen = require('../lambda/src/data/almacen');
const { epochDiaServicio } = require('../lambda/src/util/tiempo');
const catalogo = require('../lambda/src/services/catalogo');
const horarios = require('../lambda/src/services/horarios');

/** Fecha del calendario con servicio, a las 08:00 de Madrid. */
const FECHAS = Object.keys(almacen.calendario().serviciosPorFecha).sort();
const FECHA = FECHAS[Math.floor(FECHAS.length / 2)];
const REFERENCIA = new Date((epochDiaServicio(FECHA) + 8 * 3600) * 1000);
process.env.AUVASA_REFERENCIA = REFERENCIA.toISOString();

// El handler se carga DESPUÉS de fijar el entorno.
const { handler } = require('../lambda/index.js');

// --------------------------------------------------------------- utilidades --

const USUARIO = 'amzn1.ask.account.test';
const APLICACION = 'amzn1.ask.skill.test';

/**
 * Construye un IntentRequest con los slots indicados.
 *
 * @param {string} intent
 * @param {Record<string, string>} [slots]
 * @returns {object}
 */
function peticionIntent(intent, slots = {}, usuario = USUARIO) {
  const slotsAlexa = {};
  for (const [nombre, valor] of Object.entries(slots)) {
    slotsAlexa[nombre] = { name: nombre, value: valor, confirmationStatus: 'NONE' };
  }
  return envolver({
    type: 'IntentRequest',
    requestId: 'amzn1.echo-api.request.test',
    timestamp: REFERENCIA.toISOString(),
    locale: 'es-ES',
    intent: { name: intent, confirmationStatus: 'NONE', slots: slotsAlexa },
  }, usuario);
}

/**
 * @param {string} [usuario]
 * @returns {object}
 */
function peticionLanzamiento(usuario = USUARIO) {
  return envolver({
    type: 'LaunchRequest',
    requestId: 'amzn1.echo-api.request.test',
    timestamp: REFERENCIA.toISOString(),
    locale: 'es-ES',
  }, usuario);
}

/**
 * @param {object} request
 * @param {string} [usuario]
 * @returns {object}
 */
function envolver(request, usuario = USUARIO) {
  return {
    version: '1.0',
    session: {
      new: true,
      sessionId: 'amzn1.echo-api.session.test',
      application: { applicationId: APLICACION },
      attributes: {},
      user: { userId: usuario },
    },
    context: {
      System: {
        application: { applicationId: APLICACION },
        user: { userId: usuario },
        device: { deviceId: 'amzn1.ask.device.test', supportedInterfaces: {} },
        apiEndpoint: 'https://api.eu.amazonalexa.com',
        apiAccessToken: 'token-test',
      },
    },
    request,
  };
}

/**
 * Invoca la Lambda real y devuelve el texto que pronunciaría Alexa.
 *
 * @param {object} peticion
 * @returns {Promise<{habla: string, reprompt: string|undefined, fin: boolean, respuesta: object}>}
 */
async function decir(peticion) {
  const respuesta = await handler(peticion, { awsRequestId: 'test' });
  return {
    habla: textoHablado(respuesta?.response?.outputSpeech),
    reprompt: textoHablado(respuesta?.response?.reprompt?.outputSpeech),
    fin: Boolean(respuesta?.response?.shouldEndSession),
    respuesta,
  };
}

/**
 * El SDK envuelve siempre el texto en `<speak>` (SSML); lo desenvolvemos para
 * poder comparar el texto plano.
 *
 * @param {{text?: string, ssml?: string}|undefined} salida
 * @returns {string}
 */
function textoHablado(salida) {
  const bruto = salida?.text || salida?.ssml || '';
  return bruto.replace(/^<speak>/, '').replace(/<\/speak>$/, '').trim();
}

/**
 * Busca una parada con código de 3 dígitos que tenga llegadas reales a la hora
 * de referencia, y devuelve también una de sus líneas. Así el test de "pedir
 * por número" usa un número realista de la red.
 *
 * @returns {Promise<{parada: object, linea: string}|undefined>}
 */
async function paradaTresDigitosConServicio() {
  for (const parada of almacen.paradas()) {
    if (String(parada.codigo).length !== 3) continue;
    // Mismo horizonte que usa el handler (3 h) para que la respuesta coincida.
    const resultado = await horarios.proximasLlegadas(parada.id, {
      referencia: REFERENCIA,
      limite: 1,
    });
    if (resultado.llegadas.length > 0) {
      return { parada, linea: resultado.llegadas[0].linea.codigo };
    }
  }
  return undefined;
}

const CASO_NUMERO = await paradaTresDigitosConServicio();

// ------------------------------------------------------------------- tests --

test('el lanzamiento da la bienvenida y no cierra la sesión', async () => {
  const { habla, fin } = await decir(peticionLanzamiento('amzn1.ask.account.nuevousuario'));
  assert.match(habla, /bienvenido a AUVASA/i);
  assert.match(habla, /parada/i);
  assert.equal(fin, false);
});

test('la ayuda explica las consultas y menciona el número de parada', async () => {
  const { habla } = await decir(peticionIntent('AMAZON.HelpIntent'));
  assert.match(habla, /parada/i);
  assert.match(habla, /n[uú]mero/i);
});

test('se piden las llegadas por nombre de parada', async () => {
  const parada = catalogo.buscarParadas('Paseo Zorrilla 198 La Rubia', { limite: 1 })[0].parada;
  const { habla } = await decir(peticionIntent('ConsultarLlegadasIntent', { parada: parada.nombre }));
  assert.match(habla, /^Parada 1000 en Paseo Zorrilla 198 La Rubia\./);
  assert.match(habla, /hacia/);
});

test('se piden las llegadas por número de parada', async () => {
  assert.ok(CASO_NUMERO, 'debería existir una parada de 3 dígitos con servicio');

  const { habla } = await decir(peticionIntent('ConsultarLlegadasIntent', {
    parada: String(CASO_NUMERO.parada.codigo),
  }));
  assert.match(habla, new RegExp(`^Parada ${CASO_NUMERO.parada.codigo} en `));
  assert.match(habla, /hacia/);
});

test('se piden las llegadas por número de parada y línea concreta', async () => {
  assert.ok(CASO_NUMERO);

  const { habla } = await decir(peticionIntent('ConsultarLlegadasIntent', {
    parada: String(CASO_NUMERO.parada.codigo),
    linea: CASO_NUMERO.linea,
  }));
  assert.match(habla, new RegExp(`^Parada ${CASO_NUMERO.parada.codigo} en `));
  assert.ok(
    habla.includes(`El ${CASO_NUMERO.linea} hacia`) || habla.includes(`La ${CASO_NUMERO.linea} hacia`),
    `respuesta inesperada: ${habla}`,
  );
});

test('se listan las líneas que pasan por una parada (dicha por número)', async () => {
  const { habla } = await decir(peticionIntent('ConsultarLineasEnParadaIntent', {
    parada: String(CASO_NUMERO.parada.codigo),
  }));
  assert.match(habla, /paran las líneas/);
});

test('se describe el recorrido de una línea', async () => {
  const { habla } = await decir(peticionIntent('ConsultarParadasDeLineaIntent', { linea: 'C1' }));
  assert.match(habla, /La línea C1/);
  assert.match(habla, /Hacia /);
});

test('pedir el recorrido sin línea pide que se diga cuál', async () => {
  const { habla } = await decir(peticionIntent('ConsultarParadasDeLineaIntent'));
  assert.match(habla, /qué línea|qué linea/i);
});

test('una línea desconocida se avisa con claridad', async () => {
  const { habla } = await decir(peticionIntent('ConsultarLlegadasIntent', {
    parada: 'Paseo Zorrilla 198 La Rubia',
    linea: 'Z99',
  }));
  assert.match(habla, /No conozco ninguna línea Z99/);
});

test('una parada irreconocible no encuentra resultados', async () => {
  const { habla } = await decir(peticionIntent('ConsultarLlegadasIntent', {
    parada: 'wubba lubba dub dub',
  }));
  assert.match(habla, /No he encontrado ninguna parada/);
});

test('una parada dudosa pide confirmación', async () => {
  const { habla, reprompt } = await decir(peticionIntent('ConsultarLlegadasIntent', {
    parada: 'estación espacial internacional',
  }));
  assert.match(habla, /¿Te refieres a la parada/);
  assert.ok(reprompt, 'debería haber reprompt con alternativas');
});

test('el fallback invita a repetir', async () => {
  const { habla } = await decir(peticionIntent('AMAZON.FallbackIntent'));
  assert.match(habla, /No te he entendido/);
});

test('despedirse cierra la sesión', async () => {
  const { habla, fin } = await decir(peticionIntent('AMAZON.StopIntent'));
  assert.match(habla, /Hasta luego/);
  assert.equal(fin, true);
});

test('se guarda y se consulta la parada favorita', async () => {
  const usuario = 'amzn1.ask.account.favorita';
  const parada = catalogo.buscarParadas('Paseo Zorrilla 198 La Rubia', { limite: 1 })[0].parada;

  const guardar = await decir(peticionIntent('GuardarParadaFavoritaIntent', { parada: parada.nombre }, usuario));
  assert.match(guardar.habla, /favorita/i);

  const consultar = await decir(peticionIntent('ConsultarParadaFavoritaIntent', {}, usuario));
  assert.match(consultar.habla, new RegExp(parada.nombre.split(' ')[0]));
});

test('sin parada y sin favorita se pide una parada', async () => {
  const usuario = 'amzn1.ask.account.sinparada';
  const { habla } = await decir(peticionIntent('ConsultarLlegadasIntent', {}, usuario));
  assert.match(habla, /Dime el nombre o el número de la parada/);
});

/**
 * Devuelve una línea con servicio real en una parada a la hora de referencia.
 *
 * @param {object} parada
 * @returns {Promise<object|undefined>}
 */
async function lineaConServicio(parada) {
  for (const linea of catalogo.lineasEnParada(parada.id)) {
    const resultado = await horarios.proximasLlegadas(parada.id, {
      referencia: REFERENCIA,
      linea: linea.codigo,
      limite: 1,
    });
    if (resultado.llegadas.length > 0) return linea;
  }
  return undefined;
}

test('al abrir con parada favorita da directamente las llegadas', async () => {
  const usuario = 'amzn1.ask.account.lanzamientoparada';
  const parada = catalogo.buscarParadas('Paseo Zorrilla 198 La Rubia', { limite: 1 })[0].parada;
  await decir(peticionIntent('GuardarParadaFavoritaIntent', { parada: parada.nombre }, usuario));

  const { habla } = await decir(peticionLanzamiento(usuario));
  assert.match(habla, /^Hola, bienvenido a AUVASA\. /);
  assert.match(habla, new RegExp(`Parada ${parada.codigo} en `));
});

test('al abrir con parada y línea favoritas usa solo esa línea y avisa de las demás', async () => {
  const usuario = 'amzn1.ask.account.lanzamientolinea';
  const parada = catalogo.buscarParadas('Paseo Zorrilla 198 La Rubia', { limite: 1 })[0].parada;
  const linea = await lineaConServicio(parada);
  assert.ok(linea, 'debería haber una línea con servicio');

  await decir(peticionIntent('GuardarParadaFavoritaIntent', { parada: parada.nombre }, usuario));
  await decir(peticionIntent('GuardarLineaFavoritaIntent', { linea: linea.codigo }, usuario));

  const { habla } = await decir(peticionLanzamiento(usuario));
  const articulo = /^[A-Za-z]/.test(linea.codigo) ? 'La' : 'El';
  assert.match(habla, new RegExp(`${articulo} ${linea.codigo} hacia`));
  assert.match(habla, /También hay otras líneas/);
});

test('“mi parada” consulta las llegadas de la parada favorita', async () => {
  const usuario = 'amzn1.ask.account.miparada';
  const parada = catalogo.buscarParadas('Paseo Zorrilla 198 La Rubia', { limite: 1 })[0].parada;
  await decir(peticionIntent('GuardarParadaFavoritaIntent', { parada: parada.nombre }, usuario));

  const { habla } = await decir(peticionIntent('ConsultarLlegadasIntent', { parada: 'mi parada' }, usuario));
  assert.match(habla, new RegExp(`^Parada ${parada.codigo} en `));
});

test('una línea que no pasa por la parada se avisa con claridad', async () => {
  const parada = catalogo.buscarParadas('Paseo Zorrilla 198 La Rubia', { limite: 1 })[0].parada;
  const sirven = new Set(catalogo.lineasEnParada(parada.id).map((l) => l.codigo));
  const otra = catalogo.lineas().find((l) => !sirven.has(l.codigo));
  assert.ok(otra, 'debería existir alguna línea que no pase por la parada');

  const { habla } = await decir(peticionIntent('ConsultarLlegadasIntent', {
    parada: parada.nombre,
    linea: otra.codigo,
  }));
  assert.match(habla, /no pasa por la parada/);
});

test('se guarda y se consulta la línea favorita', async () => {
  const usuario = 'amzn1.ask.account.lineafavorita';
  const guardar = await decir(peticionIntent('GuardarLineaFavoritaIntent', { linea: '5' }, usuario));
  assert.match(guardar.habla, /línea 5 como tu línea favorita/i);

  const consultar = await decir(peticionIntent('ConsultarLineaFavoritaIntent', {}, usuario));
  assert.match(consultar.habla, /Tu línea favorita es la 5/);
});

test('se pueden olvidar los favoritos', async () => {
  const usuario = 'amzn1.ask.account.olvidar';
  const parada = catalogo.buscarParadas('Paseo Zorrilla 198 La Rubia', { limite: 1 })[0].parada;
  await decir(peticionIntent('GuardarParadaFavoritaIntent', { parada: parada.nombre }, usuario));

  const borrar = await decir(peticionIntent('OlvidarParadaFavoritaIntent', {}, usuario));
  assert.match(borrar.habla, /He borrado tu parada favorita/);

  const consultar = await decir(peticionIntent('ConsultarParadaFavoritaIntent', {}, usuario));
  assert.match(consultar.habla, /Todavía no has guardado/);
});

test('el recorrido normal se recorta y el completo no', async () => {
  const normal = await decir(peticionIntent('ConsultarParadasDeLineaIntent', { linea: 'C1' }));
  assert.match(normal.habla, /y hay más paradas/);

  const completo = await decir(peticionIntent('ConsultarRecorridoCompletoIntent', { linea: 'C1' }));
  assert.match(completo.habla, /La línea C1/);
  assert.doesNotMatch(completo.habla, /y hay más paradas/);
});
