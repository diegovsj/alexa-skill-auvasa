'use strict';

/**
 * Utilidades para construir texto que suene bien al leerlo Alexa en voz alta.
 */

const { formatearHora } = require('./tiempo');

/**
 * Devuelve el artículo y el código de línea tal y como se pronuncia:
 * "el 3", "la C1", "la B2".
 *
 * @param {string} codigo
 * @returns {string}
 */
function nombrarLinea(codigo) {
  const letra = /^[A-Za-z]/.test(codigo);
  return `${letra ? 'la' : 'el'} ${codigo}`;
}

/**
 * Describe una llegada en lenguaje natural.
 *
 * @param {object} llegada
 * @param {object} textos
 * @returns {string}
 */
function describirLlegada(llegada, textos) {
  const { codigo } = llegada.linea;
  if (llegada.pasaYa) {
    return textos.llegadaAhora(codigo, llegada.destino);
  }
  const base = textos.llegadaMinutos(codigo, llegada.destino, llegada.minutos);
  return base;
}

/**
 * Une las descripciones de varias llegadas.
 *
 * @param {object[]} llegadas
 * @param {object} textos
 * @returns {string}
 */
function describirLlegadas(llegadas, textos) {
  const partes = llegadas.map((l) => describirLlegada(l, textos).replace(/\.$/, ''));
  if (partes.length === 1) return `${partes[0]}.`;

  const ultima = partes[partes.length - 1]
    .replace(/^El /, 'el ')
    .replace(/^La /, 'la ');
  return `${partes.slice(0, -1).join('. ')}. Y ${ultima}.`;
}

/**
 * Nombre "largo" de la línea, limpiado para leerlo en voz alta.
 *
 * @param {object} linea
 * @returns {string}
 */
function limpiarNombreLinea(linea) {
  return (linea.nombre || '').replace(/\s+/g, ' ').replace(/\s*:\s*/g, ', ').trim();
}

/**
 * Lista de paradas recortada: si hay demasiadas solo se enumeran las primeras.
 *
 * @param {object[]} paradas
 * @param {number} maximo
 * @param {object} textos
 * @returns {string}
 */
function enumerarParadas(paradas, maximo, textos) {
  const nombres = paradas.slice(0, maximo).map((p) => p.nombre);
  const listado = nombres.length <= 1
    ? nombres.join('')
    : `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`;
  return paradas.length > maximo ? `${listado}, ${textos.recorridoDemasiadoLargo.toLowerCase()}` : listado;
}

/**
 * Hora "HH:MM" de un instante del día de servicio.
 *
 * @param {number} segundos
 * @returns {string}
 */
function hora(segundos) {
  return formatearHora(segundos);
}

module.exports = { nombrarLinea, describirLlegada, describirLlegadas, enumerarParadas, limpiarNombreLinea, hora };
