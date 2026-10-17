'use strict';

/**
 * Normalización de texto y búsqueda difusa de paradas.
 *
 * Alexa entrega el slot `parada` tal cual lo ha oído el usuario ("zorrilla
 * ciento noventa y ocho", "parada seiscientos treinta y cuatro", "plaza
 * mayor"), así que necesitamos comparar de forma tolerante: sin acentos, sin
 * mayúsculas, sin puntuación y por palabras sueltas.
 */

/** Palabras vacías que no aportan información para discriminar paradas. */
const VACIAS = new Set([
  'de', 'del', 'la', 'el', 'los', 'las', 'y', 'en', 'a', 'al', 'frente',
  'esquina', 'parada', 'calle', 'avenida', 'paseo', 'plaza', 'cerca', 'junto',
]);

/**
 * Normaliza un texto: minúsculas, sin diacríticos y con separadores simples.
 *
 * @param {unknown} texto
 * @returns {string}
 */
function normalizar(texto) {
  return (texto ?? '')
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Divide un texto normalizado en palabras significativas.
 *
 * @param {string} texto
 * @param {{conservarVacias?: boolean}} [opciones]
 * @returns {string[]}
 */
function palabras(texto, opciones = {}) {
  const todas = normalizar(texto).split(' ').filter(Boolean);
  if (opciones.conservarVacias) return todas;
  const utiles = todas.filter((p) => !VACIAS.has(p));
  // Si al quitar las vacías no queda nada (p. ej. "la plaza"), usamos todas.
  return utiles.length > 0 ? utiles : todas;
}

/**
 * Puntuación de parecido entre una consulta y un texto candidato.
 *
 * @param {string} consulta
 * @param {string} candidatoTexto Texto ya normalizado del candidato.
 * @returns {{puntuacion: number, coincidencias: number, total: number}}
 */
function puntuar(consulta, candidatoTexto) {
  const cP = palabras(consulta);
  const candP = new Set(palabras(candidatoTexto));

  if (cP.length === 0) return { puntuacion: 0, coincidencias: 0, total: 0 };

  let coincidencias = 0;
  for (const p of cP) {
    if (candP.has(p)) {
      coincidencias += 1;
    } else if (p.length >= 4) {
      // Tolerancia a singular/plural y a palabras truncadas por el ASR.
      for (const q of candP) {
        if (q.startsWith(p) || p.startsWith(q)) {
          coincidencias += 0.5;
          break;
        }
      }
    }
  }

  const cobertura = coincidencias / cP.length;
  const precision = coincidencias / Math.max(candP.size, 1);

  // La cobertura manda; la precisión desempata entre paradas parecidas.
  let puntuacion = cobertura * 100 + precision * 25;

  // Bonus si el nombre contiene la consulta literal.
  const consultaNorm = palabras(consulta).join(' ');
  if (consultaNorm.length >= 3 && candidatoTexto.includes(consultaNorm)) {
    puntuacion += 40;
  }

  return { puntuacion: Math.round(puntuacion * 10) / 10, coincidencias, total: cP.length };
}

/**
 * Escapa los caracteres especiales de XML/SSML.
 *
 * El SDK de Alexa envuelve SIEMPRE el texto hablado en `<speak>...</speak>`, de
 * modo que un `&` o un `<` suelto (por ejemplo, en un texto que repite lo que
 * ha dicho el usuario) invalidaría toda la respuesta. Los textos que provienen
 * de los datos de AUVASA son seguros, pero los que vienen del reconocimiento de
 * voz conviene escaparlos.
 *
 * @param {unknown} texto
 * @returns {string}
 */
function escaparSsml(texto) {
  return (texto ?? '')
    .toString()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Formatea una lista de elementos en lenguaje natural.
 *
 * @param {string[]} elementos
 * @returns {string}
 */
function enumerar(elementos) {
  if (elementos.length === 0) return '';
  if (elementos.length === 1) return elementos[0];
  return `${elementos.slice(0, -1).join(', ')} y ${elementos[elementos.length - 1]}`;
}

module.exports = { normalizar, palabras, puntuar, enumerar, escaparSsml, VACIAS };
