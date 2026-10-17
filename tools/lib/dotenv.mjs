/**
 * dotenv.mjs
 *
 * Lector mínimo de ficheros `.env` (sin dependencias). Lo usan las
 * herramientas de desarrollo (simulador, build del GTFS) para que puedas
 * configurar el entorno con un fichero en lugar de exportar variables a mano.
 *
 * En producción (AWS Lambda / Alexa-hosted) las variables las define el
 * runtime, así que este módulo no se usa allí.
 *
 * Formato admitido:
 *   CLAVE=valor
 *   CLAVE="valor con espacios"
 *   # comentario
 *   export CLAVE=valor
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, '..', '..');

/**
 * Carga el fichero `.env` de la raíz del proyecto, si existe. Las variables
 * que ya estén definidas en el entorno NO se sobrescriben.
 *
 * @param {string} [ruta]
 * @returns {number} número de variables aplicadas
 */
export function cargarEnv(ruta = path.join(RAIZ, '.env')) {
  if (!fs.existsSync(ruta)) return 0;

  let aplicadas = 0;
  const contenido = fs.readFileSync(ruta, 'utf8');
  for (const linea of contenido.split(/\r?\n/)) {
    const limpia = linea.trim();
    if (!limpia || limpia.startsWith('#')) continue;

    const sinExport = limpia.replace(/^export\s+/, '');
    const igual = sinExport.indexOf('=');
    if (igual === -1) continue;

    const clave = sinExport.slice(0, igual).trim();
    let valor = sinExport.slice(igual + 1).trim();
    if (!clave) continue;

    if ((valor.startsWith('"') && valor.endsWith('"'))
      || (valor.startsWith("'") && valor.endsWith("'"))) {
      valor = valor.slice(1, -1);
    }

    if (process.env[clave] === undefined) {
      process.env[clave] = valor;
      aplicadas += 1;
    }
  }
  return aplicadas;
}
