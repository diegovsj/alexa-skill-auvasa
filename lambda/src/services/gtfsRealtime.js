'use strict';

/**
 * Cliente de los feeds GTFS-Realtime de AUVASA.
 *
 * - Los feeds se descargan con `fetch` (o con `http`/`https` cuando el runtime
 *   no trae `fetch`; ver `descargar`) y se cachean en memoria del contenedor
 *   durante unos segundos (configurable con AUVASA_RT_TTL_MS), de modo que una
 *   ráfaga de peticiones no genera tráfico innecesario hacia AUVASA.
 * - Si el feed falla, la skill sigue funcionando con el horario teórico: el
 *   tiempo real es un extra, nunca un requisito.
 */

const http = require('http');
const https = require('https');

const { decodificarFeed } = require('./gtfsRealtimeDecoder');

const URL_VIAJES = process.env.AUVASA_RT_URL
  || 'http://212.170.201.204:50080/GTFSRTapi/api/tripupdate';

const TTL_MS = Number(process.env.AUVASA_RT_TTL_MS || 20000);
const TIEMPO_LIMITE_MS = Number(process.env.AUVASA_RT_TIMEOUT_MS || 4000);
const ESPERA_TRAS_FALLO_MS = Number(process.env.AUVASA_RT_BACKOFF_MS || 30000);

/** @type {{indice: Map<string, object>|null, expira: number, reintentarEn: number}} */
const cache = { indice: null, expira: 0, reintentarEn: 0 };

/**
 * Permite desactivar por completo el tiempo real (tests, entornos sin red).
 *
 * @returns {boolean}
 */
function desactivado() {
  const v = (process.env.AUVASA_RT_DISABLED || '').toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

/**
 * Descarga una URL y devuelve el cuerpo como Buffer.
 *
 * Usa `fetch` si el runtime lo incorpora (Node.js ≥ 18) y recurre a los
 * módulos `http`/`https` cuando no existe. Las skills Alexa-hosted de Node.js
 * usan la versión 16, que **no** trae `fetch` global: sin este respaldo, el
 * tiempo real nunca funcionaría en producción.
 *
 * @param {string} url
 * @param {number} tiempoLimiteMs
 * @returns {Promise<Buffer>}
 */
async function descargar(url, tiempoLimiteMs) {
  if (typeof fetch === 'function') {
    const controlador = new AbortController();
    const temporizador = setTimeout(() => controlador.abort(), tiempoLimiteMs);
    try {
      const respuesta = await fetch(url, { signal: controlador.signal, redirect: 'follow' });
      if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
      return Buffer.from(await respuesta.arrayBuffer());
    } finally {
      clearTimeout(temporizador);
    }
  }
  return descargarConHttp(url, tiempoLimiteMs);
}

/**
 * Respaldo de `descargar` para runtimes sin `fetch`. Sigue redirecciones.
 *
 * @param {string} url
 * @param {number} tiempoLimiteMs
 * @returns {Promise<Buffer>}
 */
function descargarConHttp(url, tiempoLimiteMs) {
  return new Promise((resolve, reject) => {
    const modulo = url.startsWith('https:') ? https : http;
    const peticion = modulo.get(url, (respuesta) => {
      const codigo = respuesta.statusCode || 0;
      if (codigo >= 300 && codigo < 400 && respuesta.headers.location) {
        respuesta.resume();
        descargarConHttp(respuesta.headers.location, tiempoLimiteMs).then(resolve, reject);
        return;
      }
      if (codigo < 200 || codigo >= 300) {
        respuesta.resume();
        reject(new Error(`HTTP ${codigo}`));
        return;
      }
      const trozos = [];
      respuesta.on('data', (trozo) => trozos.push(trozo));
      respuesta.on('end', () => resolve(Buffer.concat(trozos)));
      respuesta.on('error', reject);
    });
    peticion.on('error', reject);
    peticion.setTimeout(tiempoLimiteMs, () => {
      peticion.destroy(new Error('tiempo de espera agotado'));
    });
  });
}

/**
 * Índice de tiempo real: trip_id -> puntos de control conocidos.
 *
 * @typedef {object} InfoTiempoReal
 * @property {Map<number, {llegada?: number, salida?: number}>} puntos
 *   secuencia de parada -> instante previsto (epoch en segundos)
 * @property {number} minSecuencia
 * @property {number} maxSecuencia
 * @property {string} relacion
 */

/**
 * Devuelve el índice de tiempo real, usando la caché si está vigente.
 * Nunca lanza: en caso de error devuelve `null` (o la última copia válida).
 *
 * @param {{forzar?: boolean}} [opciones]
 * @returns {Promise<Map<string, InfoTiempoReal>|null>}
 */
async function obtenerIndice(opciones = {}) {
  if (desactivado()) return null;

  const ahoraMs = Date.now();

  if (!opciones.forzar) {
    if (cache.indice && ahoraMs < cache.expira) return cache.indice;
    if (ahoraMs < cache.reintentarEn) return cache.indice;
  }

  try {
    const buffer = await descargar(URL_VIAJES, TIEMPO_LIMITE_MS);
    const feed = decodificarFeed(buffer);
    cache.indice = construirIndice(feed);
    cache.expira = ahoraMs + TTL_MS;
    cache.reintentarEn = 0;
    return cache.indice;
  } catch (error) {
    // Registramos el fallo una sola vez y evitamos martillear el endpoint.
    console.warn('[auvasa] tiempo real no disponible:', error.message);
    cache.reintentarEn = ahoraMs + ESPERA_TRAS_FALLO_MS;
    return cache.indice;
  }
}

/**
 * Convierte el FeedMessage en un índice por trip_id.
 *
 * @param {{entidades: object[]}} feed
 * @returns {Map<string, InfoTiempoReal>}
 */
function construirIndice(feed) {
  const indice = new Map();

  for (const entidad of feed.entidades) {
    const tu = entidad.actualizacionViaje;
    if (!tu || !tu.tripId) continue;

    /** @type {Map<number, {llegada?: number, salida?: number}>} */
    const puntos = new Map();
    let min = Infinity;
    let max = -Infinity;

    for (const p of tu.paradas) {
      if (p.secuencia === undefined) continue;
      const entrada = {};
      if (p.llegada?.hora) entrada.llegada = p.llegada.hora;
      if (p.salida?.hora) entrada.salida = p.salida.hora;
      if (entrada.llegada === undefined && entrada.salida === undefined) continue;

      puntos.set(p.secuencia, entrada);
      if (p.secuencia < min) min = p.secuencia;
      if (p.secuencia > max) max = p.secuencia;
    }

    if (puntos.size === 0) continue;

    indice.set(tu.tripId, {
      puntos,
      minSecuencia: min,
      maxSecuencia: max,
      relacion: tu.relacion,
    });
  }

  return indice;
}

/** Vacía la caché. Solo para pruebas. */
function reiniciar() {
  cache.indice = null;
  cache.expira = 0;
  cache.reintentarEn = 0;
}

module.exports = {
  obtenerIndice,
  construirIndice,
  reiniciar,
  URL_VIAJES,
  TTL_MS,
};
