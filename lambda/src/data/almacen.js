'use strict';

/**
 * Carga perezosa y memoizada de los ficheros de datos generados por
 * `tools/build-gtfs.mjs`. Como el contenedor de Lambda se reutiliza entre
 * invocaciones, los JSON se leen una sola vez por contenedor.
 */

const RUTAS = {
  lineas: '../../data/lineas.json',
  paradas: '../../data/paradas.json',
  viajes: '../../data/viajes.json',
  llegadas: '../../data/llegadas.json',
  trayectos: '../../data/trayectos.json',
  calendario: '../../data/calendario.json',
  meta: '../../data/meta.json',
};

const cache = new Map();

/**
 * @param {'lineas'|'paradas'|'viajes'|'llegadas'|'trayectos'|'calendario'|'meta'} nombre
 * @returns {any}
 */
function cargar(nombre) {
  if (!cache.has(nombre)) {
    // eslint-disable-next-line global-require, import/no-dynamic-require
    cache.set(nombre, require(RUTAS[nombre]));
  }
  return cache.get(nombre);
}

module.exports = {
  lineas: () => cargar('lineas'),
  paradas: () => cargar('paradas'),
  viajes: () => cargar('viajes'),
  llegadas: () => cargar('llegadas'),
  trayectos: () => cargar('trayectos'),
  calendario: () => cargar('calendario'),
  meta: () => cargar('meta'),
  /** Vacía la caché. Solo se usa en pruebas. */
  reiniciar: () => cache.clear(),
};
