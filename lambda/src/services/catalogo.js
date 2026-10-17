'use strict';

/**
 * Acceso al catálogo estático: paradas, líneas, viajes y calendario.
 * Todo se sirve desde los JSON generados por `tools/build-gtfs.mjs`.
 */

const almacen = require('../data/almacen');
const { normalizar, puntuar } = require('../util/texto');
const { sumarDias, diaSemana } = require('../util/tiempo');

let indiceParadaId = null;
let indiceParadaCodigo = null;
let indiceLineaCodigo = null;

function lineas() {
  return almacen.lineas();
}

function paradas() {
  return almacen.paradas();
}

function viajes() {
  return almacen.viajes();
}

/**
 * @param {string} id stop_id de GTFS
 * @returns {object|undefined}
 */
function paradaPorId(id) {
  if (!indiceParadaId) {
    indiceParadaId = new Map(paradas().map((p) => [p.id, p]));
  }
  return indiceParadaId.get(id);
}

/**
 * @param {string} codigo Número de parada visible en la marquesina (stop_code)
 * @returns {object|undefined}
 */
function paradaPorCodigo(codigo) {
  if (!indiceParadaCodigo) {
    indiceParadaCodigo = new Map(paradas().map((p) => [p.codigo, p]));
  }
  return indiceParadaCodigo.get(String(codigo).trim());
}

/**
 * @param {string} codigo Código corto de línea (1, C1, LP...)
 * @returns {object|undefined}
 */
function lineaPorCodigo(codigo) {
  if (!indiceLineaCodigo) {
    indiceLineaCodigo = new Map(lineas().map((l) => [normalizar(l.codigo), l]));
  }
  const limpio = normalizar(codigo).replace(/^linea /, '');
  return indiceLineaCodigo.get(limpio) || indiceLineaCodigo.get(normalizar(codigo));
}

/**
 * Busca paradas a partir de lo que ha dicho el usuario. Admite tanto el nombre
 * oficial (o un sinónimo, que Alexa ya resuelve al valor canónico) como el
 * número de parada.
 *
 * @param {string} consulta
 * @param {{limite?: number}} [opciones]
 * @returns {Array<{parada: object, puntuacion: number, motivo: string}>}
 */
function buscarParadas(consulta, opciones = {}) {
  const limite = opciones.limite ?? 5;
  const texto = (consulta || '').toString().trim();
  if (!texto) return [];

  // 1) Número de parada ("634", "1 0 0 0").
  const soloDigitos = normalizar(texto).replace(/\s+/g, '');
  if (/^\d{3,5}$/.test(soloDigitos)) {
    const p = paradaPorCodigo(soloDigitos);
    if (p) return [{ parada: p, puntuacion: 1000, motivo: 'codigo' }];
  }

  // 2) Puntuación por parecido.
  const resultados = [];
  for (const p of paradas()) {
    const { puntuacion } = puntuar(texto, p.buscable);
    if (puntuacion > 0) resultados.push({ parada: p, puntuacion, motivo: 'nombre' });
  }
  resultados.sort((a, b) => b.puntuacion - a.puntuacion || a.parada.nombre.localeCompare(b.parada.nombre));
  return resultados.slice(0, limite);
}

/**
 * Devuelve las líneas que tienen servicio en una parada, ordenadas por código.
 *
 * @param {string} paradaId
 * @returns {object[]}
 */
function lineasEnParada(paradaId) {
  const departamentos = almacen.llegadas()[paradaId] || [];
  const vistos = new Set();
  const salida = [];
  for (const [iV] of departamentos) {
    const l = viajes()[iV].l;
    if (vistos.has(l)) continue;
    vistos.add(l);
    salida.push(lineas()[l]);
  }
  return salida.sort((a, b) => compararCodigos(a.codigo, b.codigo));
}

/**
 * Sentidos de una línea: para cada uno, el destino final y las paradas.
 *
 * @param {object} linea
 * @returns {Array<{destino: string, paradas: object[]}>}
 */
function recorridosDeLinea(linea) {
  const indiceLinea = lineas().indexOf(linea);
  const porSentido = new Map();

  viajes().forEach((v, iV) => {
    if (v.l !== indiceLinea) return;
    const clave = v.dir;
    if (!porSentido.has(clave)) {
      porSentido.set(clave, { destino: v.d, viajeRepresentativo: iV });
    } else if (!porSentido.get(clave).destino) {
      porSentido.get(clave).destino = v.d;
    }
  });

  const trayectos = almacen.trayectos();
  const salida = [];
  for (const [, datos] of porSentido) {
    const paradasDeViaje = trayectos[datos.viajeRepresentativo] || [];
    salida.push({
      destino: datos.destino,
      paradas: paradasDeViaje.map(([, iP]) => paradas()[iP]),
    });
  }
  return salida;
}

/**
 * Servicios (líneas de `calendar_dates`) activos en una fecha AAAAMMDD.
 * Si la fecha no está en el calendario se busca el día equivalente más
 * cercano: mismo día de la semana, y si no, el más próximo.
 *
 * @param {string} fecha
 * @returns {{servicios: Set<number>, fechaUtilizada: string, exacta: boolean}}
 */
function serviciosActivos(fecha) {
  const cal = almacen.calendario();
  const mapa = cal.serviciosPorFecha;

  if (mapa[fecha]) {
    return { servicios: new Set(mapa[fecha]), fechaUtilizada: fecha, exacta: true };
  }

  const objetivo = diaSemana(fecha);

  // Mismo día de la semana en las 3 semanas anteriores.
  for (let i = 1; i <= 21; i++) {
    const f = sumarDias(fecha, -i);
    if (mapa[f] && diaSemana(f) === objetivo) {
      return { servicios: new Set(mapa[f]), fechaUtilizada: f, exacta: false };
    }
  }
  // La fecha anterior más próxima.
  const fechas = Object.keys(mapa).sort();
  const anterior = [...fechas].reverse().find((f) => f < fecha);
  if (anterior) return { servicios: new Set(mapa[anterior]), fechaUtilizada: anterior, exacta: false };

  const posterior = fechas.find((f) => f > fecha);
  if (posterior) return { servicios: new Set(mapa[posterior]), fechaUtilizada: posterior, exacta: false };

  return { servicios: new Set(), fechaUtilizada: fecha, exacta: false };
}

/**
 * Ordena códigos de línea de forma "natural": números primero por valor y
 * luego las líneas con letra (C1, LP, B2...).
 *
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function compararCodigos(a, b) {
  const na = /^\d+$/.test(a);
  const nb = /^\d+$/.test(b);
  if (na && nb) return Number(a) - Number(b);
  if (na !== nb) return na ? -1 : 1;
  return a.localeCompare(b, 'es');
}

module.exports = {
  lineas,
  paradas,
  viajes,
  paradaPorId,
  paradaPorCodigo,
  lineaPorCodigo,
  buscarParadas,
  lineasEnParada,
  recorridosDeLinea,
  serviciosActivos,
  compararCodigos,
};
