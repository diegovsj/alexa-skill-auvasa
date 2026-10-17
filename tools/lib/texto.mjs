/**
 * Utilidades de texto compartidas por las herramientas de build.
 * Se mantienen sin dependencias para poder reutilizarlas en los tests.
 */

/**
 * Normaliza un texto para comparaciones: minúsculas, sin acentos y sin
 * puntuación. Es la misma normalización que usa la Lambda en tiempo de
 * ejecución, por eso vive en un fichero independiente y sencillo.
 *
 * @param {string} texto
 * @returns {string}
 */
export function normalizar(texto) {
  return (texto ?? '')
    .toString()
    .toLowerCase()
    .normalize('NFD')
    // Elimina los diacríticos (tildes, diéresis...).
    .replace(/[\u0300-\u036f]/g, '')
    // Sustituye cualquier carácter no alfanumérico por un espacio.
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Redondea un número a `decimales` cifras.
 *
 * @param {number} valor
 * @param {number} decimales
 * @returns {number}
 */
export function redondear(valor, decimales = 6) {
  const factor = 10 ** decimales;
  return Math.round(valor * factor) / factor;
}
