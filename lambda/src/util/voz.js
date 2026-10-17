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
 * Pone en mayúscula la primera letra.
 *
 * @param {string} texto
 * @returns {string}
 */
function capitalizar(texto) {
  return texto ? texto[0].toUpperCase() + texto.slice(1) : texto;
}

/**
 * Describe una llegada (o varias de la misma línea y destino) en lenguaje
 * natural. Agrupa los minutos: "el 5 hacia Centro, en 3 y 10 minutos".
 *
 * @param {object[]} lista llegadas de la misma línea y destino
 * @param {object} textos
 * @returns {string}
 */
function describirGrupo(lista, textos) {
  const etiqueta = nombrarLinea(lista[0].linea.codigo);
  const destino = lista[0].destino;

  const hayAhora = lista.some((l) => l.pasaYa);
  const minutos = lista.filter((l) => !l.pasaYa).map((l) => l.minutos);

  if (hayAhora && minutos.length === 0) {
    return textos.llegadaAhora(etiqueta, destino);
  }

  const tiempos = hayAhora
    ? `ahora y en ${textos.listaMinutos(minutos)}`
    : `en ${textos.listaMinutos(minutos)}`;
  return textos.llegadaConTiempos(etiqueta, destino, tiempos);
}

/**
 * Une las descripciones de varias llegadas, agrupándolas por línea y destino.
 *
 * @param {object[]} llegadas
 * @param {object} textos
 * @returns {string}
 */
function describirLlegadas(llegadas, textos) {
  const grupos = new Map();
  for (const llegada of llegadas) {
    const clave = `${llegada.linea.codigo}|${llegada.destino}`;
    if (!grupos.has(clave)) grupos.set(clave, []);
    grupos.get(clave).push(llegada);
  }

  const partes = [...grupos.values()].map((lista) => describirGrupo(lista, textos));
  if (partes.length === 1) return `${capitalizar(partes[0])}.`;

  const primera = capitalizar(partes[0]);
  const ultima = partes[partes.length - 1];
  const intermedias = partes.slice(1, -1);
  const resto = intermedias.length ? ` ${intermedias.map((p) => `${p}.`).join(' ')}` : '';
  return `${primera}.${resto} Y ${ultima}.`;
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
  return paradas.length > maximo ? `${listado}, ${textos.recorridoDemasiadoLargo}` : listado;
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

module.exports = { nombrarLinea, describirLlegadas, enumerarParadas, limpiarNombreLinea, hora };
