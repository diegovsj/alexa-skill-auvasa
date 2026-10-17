/**
 * Lector de ZIP sin dependencias externas.
 *
 * Solo implementa lo necesario para extraer los ficheros de un ZIP estándar
 * (método 0 = almacenado, método 8 = deflate) usando el módulo `zlib` de Node.
 */

import zlib from 'node:zlib';

const FIRMA_EOCD = 0x06054b50;
const FIRMA_DIR_CENTRAL = 0x02014b50;

/**
 * Extrae todas las entradas de un ZIP en memoria.
 *
 * @param {Buffer} buf Contenido completo del fichero .zip
 * @returns {Map<string, Buffer>} nombre del fichero -> contenido
 */
export function descomprimirZip(buf) {
  let eocd = -1;
  // Buscamos el End Of Central Directory desde el final (puede haber comentario).
  const limite = Math.max(0, buf.length - 66000);
  for (let i = buf.length - 22; i >= limite; i--) {
    if (buf.readUInt32LE(i) === FIRMA_EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) {
    throw new Error('El fichero no parece un ZIP válido (no se encontró el EOCD).');
  }

  const total = buf.readUInt16LE(eocd + 10);
  let offset = buf.readUInt32LE(eocd + 16);
  const salida = new Map();

  for (let i = 0; i < total; i++) {
    if (buf.readUInt32LE(offset) !== FIRMA_DIR_CENTRAL) {
      throw new Error(`Entrada ${i} corrupta en el directorio central del ZIP.`);
    }
    const metodo = buf.readUInt16LE(offset + 10);
    const tamComprimido = buf.readUInt32LE(offset + 20);
    const longNombre = buf.readUInt16LE(offset + 28);
    const longExtra = buf.readUInt16LE(offset + 30);
    const longComentario = buf.readUInt16LE(offset + 32);
    const offsetLocal = buf.readUInt32LE(offset + 42);
    const nombre = buf.toString('utf8', offset + 46, offset + 46 + longNombre);

    // Cabecera local: necesitamos sus longitudes para saber dónde empiezan los datos.
    const longNombreLocal = buf.readUInt16LE(offsetLocal + 26);
    const longExtraLocal = buf.readUInt16LE(offsetLocal + 28);
    const inicioDatos = offsetLocal + 30 + longNombreLocal + longExtraLocal;
    const crudo = buf.subarray(inicioDatos, inicioDatos + tamComprimido);

    if (!nombre.endsWith('/')) {
      salida.set(nombre, metodo === 8 ? zlib.inflateRawSync(crudo) : Buffer.from(crudo));
    }

    offset += 46 + longNombre + longExtra + longComentario;
  }

  return salida;
}

/**
 * Extrae del ZIP únicamente los ficheros pedidos, ignorando la ruta interna.
 *
 * @param {Buffer} buf
 * @param {string[]} ficheros Nombres (sin ruta) que queremos, p. ej. ['stops.txt']
 * @returns {Record<string, Buffer>}
 */
export function extraerFicheros(buf, ficheros) {
  const deseados = new Set(ficheros);
  const salida = {};
  for (const [nombre, contenido] of descomprimirZip(buf)) {
    const base = nombre.replace(/^.*\//, '');
    if (deseados.has(base)) {
      salida[base] = contenido;
    }
  }
  return salida;
}
