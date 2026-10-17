/**
 * build-interaction-model.mjs
 *
 * Genera `skill-package/interactionModels/custom/es-ES.json` a partir de los
 * datos procesados del GTFS. De esta forma el modelo de voz (las paradas y
 * líneas que Alexa reconoce) siempre está sincronizado con la red real: cuando
 * AUVASA cambia una parada, basta con volver a ejecutar `npm run datos`.
 *
 * Uso:
 *   node tools/build-interaction-model.mjs            # locales por defecto
 *   node tools/build-interaction-model.mjs es-ES es-MX
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { sinonimosParada, sinonimosLinea } from './lib/sinonimos.mjs';
import { cargarEnv } from './lib/dotenv.mjs';

cargarEnv();

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, '..');
const DIR_DATOS = path.join(RAIZ, 'lambda', 'data');
const DIR_SALIDA = path.join(RAIZ, 'skill-package', 'interactionModels', 'custom');

const INVOCATION_NAME = process.env.AUVASA_INVOCATION_NAME || 'bus valladolid';

const locales = process.argv.slice(2).filter((a) => /^[a-z]{2}-[A-Z]{2}$/.test(a));
if (locales.length === 0) locales.push('es-ES');

const log = (...args) => console.log('[modelo]', ...args);

/**
 * Intents personalizados. Los textos de ejemplo van sin acentos porque Alexa
 * los normaliza, y así evitamos problemas de codificación al copiar y pegar.
 */
const INTENTS = [
  {
    name: 'ConsultarLlegadasIntent',
    slots: [
      { name: 'parada', type: 'PARADA' },
      { name: 'linea', type: 'LINEA' },
    ],
    samples: [
      'cuando pasa el proximo autobus en la parada {parada}',
      'cuando pasa el proximo autobus en {parada}',
      'cuando pasa el autobus en {parada}',
      'cuando pasa el bus en {parada}',
      'cuando pasa el proximo bus en {parada}',
      'cuando pasa el proximo bus por {parada}',
      'cuando pasa el autobus por {parada}',
      'dime cuando pasa el autobus en {parada}',
      'dime cuando pasa el autobus por {parada}',
      'dime cuando pasa el proximo autobus en {parada}',
      'dime a que hora pasa el autobus en {parada}',
      'a que hora pasa el proximo autobus en {parada}',
      'a que hora llega el proximo autobus a {parada}',
      'a que hora llega el autobus a {parada}',
      'proximo autobus en {parada}',
      'proximo autobus parada {parada}',
      'proximo autobus por {parada}',
      'cuando llega el autobus a {parada}',
      'cuando llega el proximo autobus a {parada}',
      'cuando llega el proximo bus a {parada}',
      'cuanto falta para el proximo autobus en {parada}',
      'cuanto falta para el proximo autobus en la parada {parada}',
      'cuando pasa el {linea} en la parada {parada}',
      'cuando pasa el {linea} por {parada}',
      'cuando pasa el {linea} por la parada {parada}',
      'cuando pasa el {linea} en {parada}',
      'cuando llega el {linea} a {parada}',
      'cuando llega el {linea} a la parada {parada}',
      'dime cuando pasa el {linea} en {parada}',
      'dime cuando pasa el {linea} por {parada}',
      'dime cuando pasa el {linea} por la parada {parada}',
      'dime a que hora pasa el {linea} en {parada}',
      'a que hora pasa el {linea} en {parada}',
      'a que hora llega el {linea} a {parada}',
      'proximo {linea} en {parada}',
      'proximo {linea} en la parada {parada}',
      'cuanto le queda a la linea {linea} para llegar a la parada {parada}',
      'cuanto le queda a la linea {linea} para llegar a {parada}',
      'cuanto le queda al {linea} para llegar a la parada {parada}',
      'cuanto le queda al {linea} para llegar a {parada}',
      'cuanto falta para que llegue el {linea} a la parada {parada}',
      'cuanto falta para que llegue el {linea} a {parada}',
      'cuanto tarda el {linea} en llegar a la parada {parada}',
      'cuanto tarda el {linea} en llegar a {parada}',
      'que autobus de la linea {linea} pasa por la parada {parada}',
      'cuanto le queda a la linea {linea} para llegar a la parada numero {parada}',
      'cuando pasa el proximo autobus en la parada numero {parada}',
      'cuando llega el proximo autobus a la parada numero {parada}',
      'a que hora llega el proximo autobus a la parada numero {parada}',
      'proximo autobus en la parada numero {parada}',
      // Lo mismo, pero en la parada favorita ("mi parada").
      'cuando pasa el {linea}',
      'cuando pasa el proximo {linea}',
      'proximo {linea}',
      'cuando pasa el {linea} por mi parada',
      'cuando pasa el {linea} en mi parada',
      'cuando llega el {linea} a mi parada',
      'cuanto le queda al {linea} en mi parada',
      'proximo {linea} en mi parada',
    ],
  },
  {
    name: 'ConsultarLineasEnParadaIntent',
    slots: [{ name: 'parada', type: 'PARADA' }],
    samples: [
      'que lineas pasan por {parada}',
      'que lineas pasan por la parada {parada}',
      'que autobuses pasan por {parada}',
      'que autobuses pasan por la parada {parada}',
      'que lineas paran en {parada}',
      'que lineas paran en la parada {parada}',
      'que autobuses paran en {parada}',
      'que lineas tiene la parada {parada}',
      'que lineas tiene {parada}',
      'lineas de la parada {parada}',
      'lineas de {parada}',
      'a donde puedo ir desde {parada}',
      'a donde puedo ir desde la parada {parada}',
      'que lineas puedo coger en {parada}',
      'que lineas puedo coger en la parada {parada}',
      'dime que lineas pasan por {parada}',
      'dime que lineas pasan por la parada {parada}',
      'lineas de la parada numero {parada}',
      'que lineas pasan por la parada numero {parada}',
      'que lineas pasan por mi parada',
      'que lineas tiene mi parada',
      'que autobuses pasan por mi parada',
      'que lineas paran en mi parada',
      'que lineas puedo coger en mi parada',
    ],
  },
  {
    name: 'ConsultarParadasDeLineaIntent',
    slots: [{ name: 'linea', type: 'LINEA' }],
    samples: [
      'por que paradas pasa la linea {linea}',
      'que paradas tiene la linea {linea}',
      'que paradas hace la linea {linea}',
      'recorrido de la linea {linea}',
      'por donde pasa la linea {linea}',
      'paradas de la linea {linea}',
      'a donde va la linea {linea}',
      'dime las paradas de la linea {linea}',
      'dime por donde pasa la linea {linea}',
      'que paradas tiene el {linea}',
      'por donde pasa el {linea}',
      'recorrido del {linea}',
    ],
  },
  {
    name: 'GuardarParadaFavoritaIntent',
    slots: [{ name: 'parada', type: 'PARADA' }],
    samples: [
      'guarda {parada} como mi parada favorita',
      'guarda la parada {parada} como mi parada favorita',
      'agrega {parada} como mi parada favorita',
      'agrega la parada {parada} como mi parada favorita',
      'agrega {parada} a mi parada favorita',
      'agrega la parada {parada} a mi parada favorita',
      'agrega {parada} a favoritos',
      'agrega la parada {parada} a favoritos',
      'anade {parada} a mi parada favorita',
      'anade la parada {parada} a mi parada favorita',
      'anade {parada} a favoritos',
      'anade la parada {parada} a favoritos',
      'mi parada favorita es {parada}',
      'configura {parada} como parada favorita',
      'configura la parada {parada} como favorita',
      'quiero que mi parada sea {parada}',
      'quiero que mi parada favorita sea {parada}',
      'guarda la parada {parada}',
      'guarda la parada numero {parada} como mi parada favorita',
      'marca {parada} como mi parada favorita',
      'marca la parada {parada} como favorita',
      'pon {parada} como mi parada favorita',
      'guarda {parada} en favoritos',
    ],
  },
  {
    name: 'ConsultarParadaFavoritaIntent',
    slots: [],
    samples: [
      'cuando pasa el proximo autobus en mi parada',
      'cuando pasa el proximo autobus en mi parada favorita',
      'cuando pasa el proximo bus en mi parada',
      'cuando pasa el proximo autobus por mi parada',
      'proximo autobus en mi parada',
      'mi parada favorita',
      'cual es mi parada favorita',
      'que parada tengo guardada',
      'recuerdame mi parada favorita',
      'dime mi parada favorita',
      'dime las llegadas en mi parada',
      'dime cuando pasa el autobus en mi parada',
      'dime cuando pasa el proximo autobus en mi parada',
    ],
  },
  {
    name: 'GuardarLineaFavoritaIntent',
    slots: [{ name: 'linea', type: 'LINEA' }],
    samples: [
      'guarda la linea {linea} como mi linea favorita',
      'guarda {linea} como mi linea favorita',
      'agrega la linea {linea} a mi linea favorita',
      'agrega la linea {linea} a favoritos',
      'anade la linea {linea} a mi linea favorita',
      'anade la linea {linea} a favoritos',
      'mi linea favorita es la {linea}',
      'configura la linea {linea} como mi linea favorita',
      'quiero que mi linea favorita sea la {linea}',
      'marca la linea {linea} como favorita',
      'guarda el {linea} como mi linea favorita',
    ],
  },
  {
    name: 'ConsultarLineaFavoritaIntent',
    slots: [],
    samples: [
      'cual es mi linea favorita',
      'que linea tengo guardada',
      'mi linea favorita',
      'recuerdame mi linea favorita',
      'dime mi linea favorita',
    ],
  },
  {
    name: 'OlvidarParadaFavoritaIntent',
    slots: [],
    samples: [
      'olvida mi parada favorita',
      'quita mi parada favorita',
      'borra mi parada favorita',
      'elimina mi parada favorita',
      'ya no quiero tener parada favorita',
      'borra la parada favorita',
    ],
  },
  {
    name: 'OlvidarLineaFavoritaIntent',
    slots: [],
    samples: [
      'olvida mi linea favorita',
      'quita mi linea favorita',
      'borra mi linea favorita',
      'elimina mi linea favorita',
      'ya no quiero tener linea favorita',
      'borra la linea favorita',
    ],
  },
  {
    name: 'ConsultarRecorridoCompletoIntent',
    slots: [{ name: 'linea', type: 'LINEA' }],
    samples: [
      'recorrido completo de la linea {linea}',
      'dime el recorrido completo de la linea {linea}',
      'todas las paradas de la linea {linea}',
      'el recorrido entero de la linea {linea}',
      'recorrido completo de la {linea}',
      'dime todas las paradas de la linea {linea}',
      'quiero el recorrido completo de la linea {linea}',
    ],
  },
  {
    name: 'AyudaIntent',
    slots: [],
    samples: ['ayuda', 'que puedo decir', 'como funciona'],
  },
];

/** Intents integrados que la skill debe implementar. */
const INTENTS_INTEGRADOS = [
  'AMAZON.HelpIntent',
  'AMAZON.CancelIntent',
  'AMAZON.StopIntent',
  'AMAZON.FallbackIntent',
  'AMAZON.NavigateHomeIntent',
  'AMAZON.YesIntent',
  'AMAZON.NoIntent',
];

function main() {
  const paradas = leer('paradas.json');
  const lineas = leer('lineas.json');

  log(`${paradas.length} paradas y ${lineas.length} líneas`);

  // Los slot types se serializan con el formato EXACTO que espera SMAPI:
  // cada valor es `{ name: { value, synonyms } }`. El formato "plano"
  // (`{ name, synonyms }` de la CLI v1) hace que SMAPI rechace el modelo con
  // un 400 MALFORMED_INPUT, así que no se puede usar.
  const tipoParada = construirTipoParada(paradas);
  const tipoLinea = construirTipoLinea(lineas);

  log(`slot PARADA: ${tipoParada.values.length} valores (${tipoParada.values.filter((v) => v.name.synonyms.length).length} con sinónimos)`);
  log(`slot LINEA:  ${tipoLinea.values.length} valores`);

  fs.mkdirSync(DIR_SALIDA, { recursive: true });

  const modelo = {
    interactionModel: {
      languageModel: {
        invocationName: INVOCATION_NAME,
        intents: [
          ...INTENTS.map((i) => ({
            name: i.name,
            slots: i.slots,
            samples: i.samples,
          })),
          ...INTENTS_INTEGRADOS.map((name) => ({ name })),
        ],
        types: [tipoParada, tipoLinea],
      },
    },
  };

  for (const locale of locales) {
    const destino = path.join(DIR_SALIDA, `${locale}.json`);
    fs.writeFileSync(destino, `${JSON.stringify(modelo, null, 2)}\n`);
    log(`escrito ${path.relative(RAIZ, destino)} (${(fs.statSync(destino).size / 1024).toFixed(0)} KB)`);
  }
}

/**
 * Construye el slot type PARADA. Los sinónimos que podrían referirse a más de
 * una parada se descartan para no introducir ambigüedad.
 *
 * El número de parada que aparece en la marquesina (por ejemplo 400) se añade
 * también como sinónimo, de modo que el usuario pueda pedir «la parada 400».
 *
 * @param {Array<{codigo: string, nombre: string}>} paradas
 */
function construirTipoParada(paradas) {
  const propuestas = new Map();
  for (const p of paradas) {
    const sinonimos = sinonimosParada(p.nombre);
    const codigo = String(p.codigo ?? '').trim();
    if (codigo && !sinonimos.includes(codigo)) sinonimos.push(codigo);
    propuestas.set(p.nombre, sinonimos);
  }

  const cuenta = new Map();
  for (const lista of propuestas.values()) {
    for (const s of lista) {
      const clave = s.toLowerCase();
      cuenta.set(clave, (cuenta.get(clave) || 0) + 1);
    }
  }

  const values = paradas.map((p) => ({
    name: {
      value: p.nombre,
      synonyms: (propuestas.get(p.nombre) || []).filter((s) => cuenta.get(s.toLowerCase()) === 1),
    },
  }));

  return { name: 'PARADA', values };
}

/**
 * Construye el slot type LINEA.
 *
 * @param {Array<{codigo: string, nombre: string}>} lineas
 */
function construirTipoLinea(lineas) {
  const propuestas = lineas.map((l) => ({
    value: l.codigo,
    synonyms: sinonimosLinea(l),
  }));

  // Eliminamos sinónimos duplicados entre líneas distintas.
  const cuenta = new Map();
  for (const v of propuestas) {
    for (const s of v.synonyms) {
      const clave = s.toLowerCase();
      cuenta.set(clave, (cuenta.get(clave) || 0) + 1);
    }
  }
  const values = propuestas.map((v) => ({
    name: {
      value: v.value,
      synonyms: v.synonyms.filter((s) => cuenta.get(s.toLowerCase()) === 1),
    },
  }));

  return { name: 'LINEA', values };
}

/**
 * @param {string} nombre
 */
function leer(nombre) {
  return JSON.parse(fs.readFileSync(path.join(DIR_DATOS, nombre), 'utf8'));
}

main();
