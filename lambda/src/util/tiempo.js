'use strict';

/**
 * Utilidades de fecha y hora en la zona horaria de Valladolid (Europe/Madrid).
 *
 * El GTFS de AUVASA expresa los horarios como "segundos desde medianoche" del
 * día de servicio, y permite valores >= 86400 para los viajes que terminan
 * después de medianoche. Trabajar en segundos evita todos los problemas de
 * cambio de hora y de formato.
 */

const ZONA = process.env.AUVASA_TZ || 'Europe/Madrid';

const FORMATO = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZONA,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

/**
 * Instante de referencia para las pruebas. Si existe la variable de entorno
 * `AUVASA_REFERENCIA` (una fecha ISO 8601), la skill "cree" que es ese momento.
 * Resulta muy útil para los tests y para el simulador local, ya que permite
 * obtener siempre las mismas llegadas.
 *
 * @returns {Date|undefined}
 */
function referenciaDeEntorno() {
  const valor = process.env.AUVASA_REFERENCIA;
  if (!valor) return undefined;
  const fecha = new Date(valor);
  return Number.isNaN(fecha.getTime()) ? undefined : fecha;
}

/**
 * Fecha y hora actuales en la zona de Valladolid.
 *
 * @param {Date} [referencia]
 * @returns {{fecha: string, anio: number, mes: number, dia: number, segundos: number, hora: string}}
 *   `fecha` en formato AAAAMMDD y `segundos` desde medianoche.
 */
function ahora(referencia = referenciaDeEntorno() || new Date()) {
  const p = {};
  for (const parte of FORMATO.formatToParts(referencia)) {
    p[parte.type] = parte.value;
  }
  const anio = Number(p.year);
  const mes = Number(p.month);
  const dia = Number(p.day);
  const segundos = Number(p.hour) * 3600 + Number(p.minute) * 60 + Number(p.second);

  return {
    fecha: `${p.year}${p.month}${p.day}`,
    anio,
    mes,
    dia,
    segundos,
    hora: `${p.hour}:${p.minute}`,
  };
}

/**
 * Resta (o suma) días a una fecha AAAAMMDD.
 *
 * @param {string} fecha
 * @param {number} dias
 * @returns {string}
 */
function sumarDias(fecha, dias) {
  const anio = Number(fecha.slice(0, 4));
  const mes = Number(fecha.slice(4, 6));
  const dia = Number(fecha.slice(6, 8));
  const d = new Date(Date.UTC(anio, mes - 1, dia));
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

/**
 * Día de la semana (0 = domingo) de una fecha AAAAMMDD.
 *
 * @param {string} fecha
 * @returns {number}
 */
function diaSemana(fecha) {
  const anio = Number(fecha.slice(0, 4));
  const mes = Number(fecha.slice(4, 6));
  const dia = Number(fecha.slice(6, 8));
  return new Date(Date.UTC(anio, mes - 1, dia)).getUTCDay();
}

/**
 * Convierte segundos desde medianoche en "HH:MM".
 * Los valores >= 86400 se muestran con módulo 24 h.
 *
 * @param {number} segundos
 * @returns {string}
 */
function formatearHora(segundos) {
  const s = ((Math.round(segundos) % 86400) + 86400) % 86400;
  const hh = String(Math.floor(s / 3600)).padStart(2, '0');
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  return `${hh}:${mm}`;
}

/**
 * Segundos que faltan hasta un instante del día de servicio.
 *
 * @param {number} objetivo Segundos desde medianoche del día de servicio.
 * @param {number} referencia Segundos desde medianoche actuales (ya ajustados).
 * @returns {number}
 */
function segundosHasta(objetivo, referencia) {
  return objetivo - referencia;
}

const FORMATO_UTC = new Intl.DateTimeFormat('en-US', {
  timeZone: ZONA,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

/**
 * Desplazamiento de la zona horaria de Madrid respecto a UTC, en segundos.
 * Tiene en cuenta el horario de verano porque se calcula para una fecha
 * concreta.
 *
 * @param {Date} fecha
 * @returns {number}
 */
function offsetSegundos(fecha) {
  const p = {};
  for (const parte of FORMATO_UTC.formatToParts(fecha)) p[parte.type] = parte.value;
  const comoSiFueseUtc = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(p.hour),
    Number(p.minute),
    Number(p.second),
  );
  return Math.round((comoSiFueseUtc - fecha.getTime()) / 1000);
}

/**
 * Instante (epoch en segundos) en el que empieza un día de servicio.
 *
 * @param {string} fechaAAAAMMDD
 * @returns {number}
 */
function epochDiaServicio(fechaAAAAMMDD) {
  const anio = Number(fechaAAAAMMDD.slice(0, 4));
  const mes = Number(fechaAAAAMMDD.slice(4, 6));
  const dia = Number(fechaAAAAMMDD.slice(6, 8));
  const medianocheUtc = Date.UTC(anio, mes - 1, dia) / 1000;
  // Mediodía de ese día: referencia estable para calcular el desplazamiento.
  const offset = offsetSegundos(new Date((medianocheUtc + 12 * 3600) * 1000));
  return medianocheUtc - offset;
}

module.exports = {
  ZONA,
  ahora,
  referenciaDeEntorno,
  sumarDias,
  diaSemana,
  formatearHora,
  segundosHasta,
  offsetSegundos,
  epochDiaServicio,
};
