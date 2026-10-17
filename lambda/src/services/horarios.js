'use strict';

/**
 * Cálculo de las próximas llegadas a una parada.
 *
 * Estrategia:
 *   1. Se toman los servicios (patrones de calendario) activos hoy y, para los
 *      viajes que cruzan la medianoche, los de ayer.
 *   2. Se recorren las salidas programadas de la parada y se descartan las que
 *      ya han pasado.
 *   3. Si el feed GTFS-Realtime está disponible, se corrige el horario teórico
 *      con el retraso real y se descartan los viajes cancelados o ya pasados.
 */

const almacen = require('../data/almacen');
const catalogo = require('./catalogo');
const tiempoReal = require('./gtfsRealtime');
const { ahora: ahoraEnMadrid, sumarDias, formatearHora, epochDiaServicio } = require('../util/tiempo');

/** Margen para no descartar un autobús que está llegando justo ahora. */
const MARGEN_PASADO_SEGUNDOS = 120;

/**
 * @typedef {object} Llegada
 * @property {object} linea
 * @property {string} destino
 * @property {number} segundos Segundos del día de servicio en los que pasa.
 * @property {number} minutos Minutos que faltan (redondeado a la baja).
 * @property {string} hora "HH:MM"
 * @property {boolean} tiempoReal Si el dato viene del feed en tiempo real.
 * @property {boolean} pasaYa Si está llegando en este momento.
 */

/**
 * @param {string} paradaId
 * @param {{linea?: string, limite?: number, horizonteSegundos?: number, referencia?: Date}} [opciones]
 * @returns {Promise<{parada: object|null, llegadas: Llegada[], tiempoRealDisponible: boolean, aviso: string|null}>}
 */
async function proximasLlegadas(paradaId, opciones = {}) {
  const parada = catalogo.paradaPorId(paradaId);
  if (!parada) {
    return { parada: null, llegadas: [], tiempoRealDisponible: false, aviso: null };
  }

  const limite = opciones.limite ?? 3;
  const horizonte = opciones.horizonteSegundos ?? 3 * 3600;
  const ahora = ahoraEnMadrid(opciones.referencia);
  const viajes = catalogo.viajes();
  const lineas = catalogo.lineas();
  const salidas = almacen.llegadas()[paradaId] || [];

  const serviciosHoy = catalogo.serviciosActivos(ahora.fecha);
  const serviciosAyer = catalogo.serviciosActivos(sumarDias(ahora.fecha, -1));

  // Filtramos la línea pedida, si la hay.
  let lineaFiltro = null;
  if (opciones.linea) {
    lineaFiltro = catalogo.lineaPorCodigo(opciones.linea);
    if (!lineaFiltro) {
      return { parada, llegadas: [], tiempoRealDisponible: false, aviso: 'lineaDesconocida' };
    }
  }

  /** @type {Array<{iV: number, secuencia: number, segundos: number, referencia: number, fechaServicio: string}>} */
  const candidatos = [];

  for (const grupo of [
    { servicios: serviciosHoy.servicios, offset: 0, fechaServicio: ahora.fecha },
    { servicios: serviciosAyer.servicios, offset: 86400, fechaServicio: sumarDias(ahora.fecha, -1) },
  ]) {
    const referencia = ahora.segundos + grupo.offset;
    for (const [iV, segundos, secuencia] of salidas) {
      const viaje = viajes[iV];
      if (!grupo.servicios.has(viaje.s)) continue;
      if (lineaFiltro && lineaFiltro.codigo !== lineas[viaje.l].codigo) continue;

      const delta = segundos - referencia;
      if (delta < -MARGEN_PASADO_SEGUNDOS) continue;
      if (delta > horizonte) continue;

      candidatos.push({
        iV,
        secuencia,
        segundos,
        referencia,
        fechaServicio: grupo.fechaServicio,
      });
    }
  }

  candidatos.sort(
    (a, b) => (a.segundos - a.referencia) - (b.segundos - b.referencia),
  );

  const indiceRt = await tiempoReal.obtenerIndice();

  /** @type {Llegada[]} */
  const resultado = [];
  const claves = new Set();

  for (const c of candidatos) {
    if (resultado.length >= limite) break;

    const viaje = viajes[c.iV];
    const linea = lineas[viaje.l];
    const evaluado = aplicarTiempoReal(c, viaje, indiceRt);

    if (evaluado.descartar) continue;

    const minutos = Math.max(0, Math.round((evaluado.segundos - c.referencia) / 60));
    const clave = `${linea.codigo}|${viaje.d}|${minutos}`;
    if (claves.has(clave)) continue;
    claves.add(clave);

    resultado.push({
      linea,
      destino: viaje.d,
      segundos: evaluado.segundos,
      minutos,
      hora: formatearHora(evaluado.segundos),
      tiempoReal: evaluado.tiempoReal,
      pasaYa: evaluado.segundos - c.referencia <= 60,
    });
  }

  return {
    parada,
    llegadas: resultado,
    tiempoRealDisponible: Boolean(indiceRt && indiceRt.size > 0),
    aviso: null,
  };
}

/**
 * Corrige una salida programada con la información en tiempo real del viaje.
 *
 * @param {{iV: number, secuencia: number, segundos: number, fechaServicio: string}} candidato
 * @param {object} viaje
 * @param {Map<string, object>|null} indiceRt
 * @returns {{segundos: number, tiempoReal: boolean, descartar: boolean}}
 */
function aplicarTiempoReal(candidato, viaje, indiceRt) {
  const porDefecto = { segundos: candidato.segundos, tiempoReal: false, descartar: false };
  if (!indiceRt) return porDefecto;

  const info = indiceRt.get(viaje.t);
  if (!info) return porDefecto;
  if (info.relacion === 'CANCELED') return { ...porDefecto, descartar: true };

  // El autobús ya ha pasado nuestra parada.
  if (info.minSecuencia > candidato.secuencia) return { ...porDefecto, descartar: true };

  // Predicción exacta para esta misma parada.
  const exacto = info.puntos.get(candidato.secuencia);
  if (exacto) {
    const retraso = retrasoEnPunto(candidato, exacto);
    if (retraso !== null) {
      return { segundos: candidato.segundos + retraso, tiempoReal: true, descartar: false };
    }
  }

  // Si no, usamos el retraso del último punto conocido anterior.
  let mejorSecuencia = -Infinity;
  let mejorEvento = null;
  for (const [secuencia, evento] of info.puntos) {
    if (secuencia < candidato.secuencia && secuencia > mejorSecuencia) {
      mejorSecuencia = secuencia;
      mejorEvento = evento;
    }
  }

  if (mejorEvento) {
    const retraso = retrasoEnPunto({ ...candidato, secuencia: mejorSecuencia }, mejorEvento);
    if (retraso !== null && Math.abs(retraso) < 3600) {
      return { segundos: candidato.segundos + retraso, tiempoReal: true, descartar: false };
    }
  }

  return porDefecto;
}

/**
 * Diferencia entre la hora prevista por el tiempo real y el horario teórico en
 * un punto de control concreto.
 *
 * @param {{iV: number, secuencia: number, fechaServicio: string}} candidato
 * @param {{llegada?: number, salida?: number}} evento
 * @returns {number|null} segundos de retraso (positivo = va tarde)
 */
function retrasoEnPunto(candidato, evento) {
  const previsto = evento.llegada ?? evento.salida;
  if (previsto === undefined) return null;

  const teorico = segundosTeoricos(candidato.iV, candidato.secuencia);
  if (teorico === null) return null;

  const epochTeorico = epochDiaServicio(candidato.fechaServicio) + teorico;
  return Math.round(previsto - epochTeorico);
}

/**
 * Instante teórico (segundos desde medianoche del día de servicio) en el que
 * un viaje pasa por una secuencia concreta.
 *
 * @param {number} iV
 * @param {number} secuencia
 * @returns {number|null}
 */
function segundosTeoricos(iV, secuencia) {
  const trayecto = almacen.trayectos()[iV];
  if (!trayecto) return null;
  const punto = trayecto.find(([s]) => s === secuencia);
  return punto ? punto[2] : null;
}

module.exports = { proximasLlegadas, MARGEN_PASADO_SEGUNDOS };
