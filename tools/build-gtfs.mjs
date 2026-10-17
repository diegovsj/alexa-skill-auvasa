/**
 * build-gtfs.mjs
 *
 * Descarga el GTFS estático oficial de AUVASA, lo normaliza y genera los
 * ficheros JSON compactos que consume la Lambda de la skill.
 *
 * Uso:
 *   node tools/build-gtfs.mjs            # descarga el GTFS y genera lambda/data
 *   node tools/build-gtfs.mjs --offline  # usa tools/gtfs/gtfs.zip si existe
 *
 * Endpoint oficial (publicado en https://www.auvasa.es/empresa/datos-abiertos/):
 *   http://212.170.201.204:50080/GTFSRTapi/api/GTFSFile
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseCsv, horaASegundos } from './lib/csv.mjs';
import { extraerFicheros } from './lib/zip.mjs';
import { normalizar, redondear } from './lib/texto.mjs';
import { cargarEnv } from './lib/dotenv.mjs';

cargarEnv();

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, '..');
const DIR_DATOS = path.join(RAIZ, 'lambda', 'data');
const DIR_CACHE = path.join(AQUI, 'gtfs');
const ZIP_CACHE = path.join(DIR_CACHE, 'gtfs.zip');

const ENDPOINT_GTFS = process.env.AUVASA_GTFS_URL
  || 'http://212.170.201.204:50080/GTFSRTapi/api/GTFSFile';

/** Ficheros del GTFS que realmente utilizamos. */
const FICHEROS_GTFS = [
  'agency.txt',
  'stops.txt',
  'routes.txt',
  'trips.txt',
  'stop_times.txt',
  'calendar_dates.txt',
];

const offline = process.argv.includes('--offline');
const log = (...args) => console.log('[gtfs]', ...args);

async function main() {
  const inicio = Date.now();
  fs.mkdirSync(DIR_DATOS, { recursive: true });
  fs.mkdirSync(DIR_CACHE, { recursive: true });

  const zip = await obtenerZip();
  log(`ZIP del GTFS disponible (${(zip.length / 1024 / 1024).toFixed(2)} MB)`);

  const ficheros = extraerFicheros(zip, FICHEROS_GTFS);
  const faltan = FICHEROS_GTFS.filter((f) => !ficheros[f]);
  if (faltan.length > 0) {
    throw new Error(`Faltan ficheros en el GTFS: ${faltan.join(', ')}`);
  }

  const leer = (nombre) => parseCsv(ficheros[nombre].toString('utf8'));

  const agency = leer('agency.txt');
  const stopsRaw = leer('stops.txt');
  const routesRaw = leer('routes.txt');
  const tripsRaw = leer('trips.txt');
  const stopTimesRaw = leer('stop_times.txt');
  const calendarDatesRaw = leer('calendar_dates.txt');

  log(`stops=${stopsRaw.length} routes=${routesRaw.length} trips=${tripsRaw.length} stop_times=${stopTimesRaw.length}`);

  // ---------------------------------------------------------------- líneas --
  const lineas = [];
  const indiceLinea = new Map();
  for (const r of routesRaw) {
    const corto = (r.route_short_name || r.route_id || '').trim();
    indiceLinea.set(r.route_id, lineas.length);
    lineas.push({
      id: r.route_id,
      codigo: corto,
      nombre: (r.route_long_name || '').trim(),
      color: normalizarColor(r.route_color) || '0057B8',
      colorTexto: normalizarColor(r.route_text_color) || 'FFFFFF',
      tipo: Number(r.route_type) || 3,
    });
  }

  // ---------------------------------------------------------------- viajes --
  // Cada viaje guarda: identificador GTFS, línea (índice), servicio, destino y sentido.
  const viajes = [];
  const indiceViaje = new Map();
  for (const t of tripsRaw) {
    if (!indiceLinea.has(t.route_id)) continue;
    indiceViaje.set(t.trip_id, viajes.length);
    viajes.push({
      t: t.trip_id,
      l: indiceLinea.get(t.route_id),
      s: t.service_id || '',
      d: limpiarDestino(t.trip_headsign || ''),
      dir: Number(t.direction_id) || 0,
    });
  }

  // --------------------------------------------------------------- paradas --
  const paradas = [];
  const indiceParada = new Map();
  for (const s of stopsRaw) {
    if (s.location_type && s.location_type !== '0') continue;
    const nombre = (s.stop_name || '').replace(/\s+/g, ' ').trim();
    indiceParada.set(s.stop_id, paradas.length);
    paradas.push({
      id: s.stop_id,
      codigo: (s.stop_code || '').trim(),
      nombre,
      buscable: normalizar(nombre),
      lat: redondear(Number(s.stop_lat)),
      lon: redondear(Number(s.stop_lon)),
    });
  }

  // -------------------------------------------------------- horarios/llegadas
  /** @type {Map<number, Array<[number, number, number]>>} índice de parada -> [viaje, segundos, secuencia] */
  const llegadas = new Map();
  /** @type {Array<Array<[number, number, number]>>} índice de viaje -> [secuencia, parada, segundos] */
  const trayectos = viajes.map(() => []);
  let descartadas = 0;

  for (const st of stopTimesRaw) {
    const iP = indiceParada.get(st.stop_id);
    const iV = indiceViaje.get(st.trip_id);
    if (iP === undefined || iV === undefined) {
      descartadas++;
      continue;
    }
    const segundos = horaASegundos(st.arrival_time || st.departure_time);
    if (!Number.isFinite(segundos)) continue;
    const secuencia = Number(st.stop_sequence) || 0;

    if (!llegadas.has(iP)) llegadas.set(iP, []);
    llegadas.get(iP).push([iV, segundos, secuencia]);
    trayectos[iV].push([secuencia, iP, segundos]);
  }

  for (const lista of llegadas.values()) {
    lista.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  }
  for (const lista of trayectos) {
    lista.sort((a, b) => a[0] - b[0]);
  }

  const llegadasObj = {};
  for (const [iP, lista] of llegadas) {
    llegadasObj[paradas[iP].id] = lista;
  }

  // Los índices de parada se guardan como posición en `paradas`, más compacto
  // que repetir el stop_id en cada entrada.
  const trayectosObj = {};
  for (let iV = 0; iV < trayectos.length; iV++) {
    if (trayectos[iV].length > 0) trayectosObj[iV] = trayectos[iV];
  }

  // ------------------------------------------------------------ calendario --
  // calendar_dates.txt relaciona cada fecha con los servicios activos.
  // Generamos dos vistas:
  //   serviciosPorFecha: "AAAAMMDD" -> [índice de servicio]
  //   servicios:          lista de identificadores de servicio (por índice)
  const indiceServicio = new Map();
  const servicios = [];
  const idServicio = (sid) => {
    if (!indiceServicio.has(sid)) {
      indiceServicio.set(sid, servicios.length);
      servicios.push(sid);
    }
    return indiceServicio.get(sid);
  };

  // Los viajes referencian el servicio por su nombre; lo traducimos a índice.
  for (const v of viajes) {
    v.s = idServicio(v.s);
  }

  const serviciosPorFecha = {};
  for (const c of calendarDatesRaw) {
    const fecha = (c.date || '').trim();
    if (!/^\d{8}$/.test(fecha)) continue;
    const idx = idServicio((c.service_id || '').trim());
    // exception_type 1 = servicio añadido, 2 = servicio eliminado.
    if (c.exception_type === '2') {
      const actuales = serviciosPorFecha[fecha];
      if (actuales) serviciosPorFecha[fecha] = actuales.filter((s) => s !== idx);
      continue;
    }
    if (!serviciosPorFecha[fecha]) serviciosPorFecha[fecha] = [];
    if (!serviciosPorFecha[fecha].includes(idx)) serviciosPorFecha[fecha].push(idx);
  }
  for (const fecha of Object.keys(serviciosPorFecha)) {
    serviciosPorFecha[fecha].sort((a, b) => a - b);
  }

  // ------------------------------------------------------------ estadísticas
  const paradasConServicio = Object.keys(llegadasObj).length;

  const meta = {
    generado: new Date().toISOString(),
    fuente: ENDPOINT_GTFS,
    origen: 'AUVASA - Datos abiertos (CC BY 3.0 ES)',
    agencia: agency[0]?.agency_name || 'AUVASA',
    cuenta: {
      lineas: lineas.length,
      paradas: paradas.length,
      paradasConServicio,
      viajes: viajes.length,
      servicios: servicios.length,
      fechas: Object.keys(serviciosPorFecha).length,
      stopTimes: stopTimesRaw.length,
      stopTimesDescartadas: descartadas,
    },
  };

  escribir('lineas.json', lineas);
  escribir('paradas.json', paradas);
  escribir('viajes.json', viajes);
  escribir('llegadas.json', llegadasObj);
  escribir('trayectos.json', trayectosObj);
  escribir('calendario.json', { servicios, serviciosPorFecha });
  escribir('meta.json', meta);

  log(`Generado en ${path.relative(RAIZ, DIR_DATOS)} en ${((Date.now() - inicio) / 1000).toFixed(1)}s`);
  log(JSON.stringify(meta.cuenta, null, 2));
}

/**
 * Descarga el GTFS o reutiliza la copia local en modo --offline.
 * @returns {Promise<Buffer>}
 */
async function obtenerZip() {
  if (offline) {
    if (!fs.existsSync(ZIP_CACHE)) {
      throw new Error(`Modo --offline pero no existe ${ZIP_CACHE}`);
    }
    log('Modo offline: usando la copia local del GTFS');
    return fs.readFileSync(ZIP_CACHE);
  }

  log(`Descargando GTFS desde ${ENDPOINT_GTFS}`);
  const respuesta = await fetch(ENDPOINT_GTFS, { redirect: 'follow' });
  if (!respuesta.ok) {
    throw new Error(`El endpoint devolvió HTTP ${respuesta.status}`);
  }
  const buffer = Buffer.from(await respuesta.arrayBuffer());
  fs.writeFileSync(ZIP_CACHE, buffer);
  return buffer;
}

/**
 * @param {string} nombre
 * @param {unknown} contenido
 */
function escribir(nombre, contenido) {
  const destino = path.join(DIR_DATOS, nombre);
  fs.writeFileSync(destino, JSON.stringify(contenido));
  const kb = (fs.statSync(destino).size / 1024).toFixed(0);
  log(`escrito ${nombre} (${kb} KB)`);
}

/**
 * Convierte el `trip_headsign` en un destino pronunciable por Alexa.
 * Los GTFS de AUVASA vienen en mayúsculas y con abreviaturas ("B. EspaÑA"),
 * así que aquí se expanden las más habituales de la red.
 *
 * @param {string} texto
 * @returns {string}
 */
function limpiarDestino(texto) {
  const base = (texto || '').trim().replace(/\s+/g, ' ').toLowerCase();
  if (DESTINOS[base]) return DESTINOS[base];
  // Capitaliza el inicio de cada palabra conservando el resto en minúsculas.
  return base.replace(/(^|[\s.\-])(\p{L})/gu, (_, prefijo, letra) => prefijo + letra.toUpperCase());
}

/** Abreviaturas de destino más frecuentes en la red de AUVASA. */
const DESTINOS = {
  'b. españa': 'Barrio España',
  'b. belen': 'Barrio Belén',
  'san pedro r': 'San Pedro Regalado',
  'los santos p': 'Los Santos Pilarica',
  'art. eyries': 'Arturo Eyries',
  'pgno. s. crist': 'Polígono San Cristóbal',
  'pgno. argales': 'Polígono Argales',
  'pgno. la mora': 'Polígono La Mora',
  cisterniga: 'La Cistérniga',
  'zorrilla 71': 'Paseo Zorrilla 71',
  giron: 'Girón',
  'c. contiendas': 'Cementerio de Contiendas',
  'pinar jalon': 'Pinar de Jalón',
  'pza. españa': 'Plaza de España',
  'rio hortega': 'Hospital Río Hortega',
  'fte. berrocal': 'Fuente Berrocal',
  'fte. dorada': 'Fuente Dorada',
  'estad. futbol': 'Estadio',
  'pza. poniente': 'Plaza del Poniente',
  'villa prado': 'Villa de Prado',
  pinarillo: 'El Pinarillo',
  'col. s. j. dios': 'Colegio San Juan de Dios',
  'estac-centro': 'Estación de autobuses',
  'pza circular': 'Plaza Circular',
  'duq. victoria': 'Duque de la Victoria',
  'covaresa-can': 'Covaresa Cañada Real',
  'p. arg-rubia': 'Polígono Argales La Rubia',
  'p. arg-covare': 'Polígono Argales Covaresa',
  'feria vall': 'Feria de Valladolid',
  overuela: 'La Overuela',
  'delic-cister': 'Delicias La Cistérniga',
};

/**
 * @param {string} color
 * @returns {string} Color hexadecimal de 6 dígitos o cadena vacía.
 */
function normalizarColor(color) {
  const limpio = (color || '').trim().replace(/^#/, '').toUpperCase();
  return /^[0-9A-F]{6}$/.test(limpio) ? limpio : '';
}

main().catch((err) => {
  console.error('[gtfs] ERROR:', err.message);
  process.exitCode = 1;
});
