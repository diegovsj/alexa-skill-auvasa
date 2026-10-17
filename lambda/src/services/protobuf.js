'use strict';

/**
 * Lector mínimo de Protocol Buffers (proto2/proto3) suficiente para
 * interpretar los feeds GTFS-Realtime de AUVASA.
 *
 * ¿Por qué no usamos `gtfs-realtime-bindings`?
 *   - Ese paquete arrastra `protobufjs` (~1 MB) y un coste de arranque en frío
 *     innecesario para un Lambda que solo lee unos pocos campos.
 *   - Este lector son ~80 líneas auditables y sin dependencias, lo que además
 *     facilita las pruebas unitarias.
 */

/**
 * @typedef {object} CampoProto
 * @property {number} numero Número de campo declarado en el .proto
 * @property {number} wire   Tipo de wire (0=varint, 1=64bit, 2=length-delimited, 5=32bit)
 * @property {number|bigint|Buffer} valor Valor ya decodificado
 */

/**
 * Decodifica un mensaje protobuf en una lista plana de campos.
 *
 * @param {Buffer|Uint8Array} buffer
 * @returns {CampoProto[]}
 */
function leerCampos(buffer) {
  const lista = [];
  let i = 0;

  while (i < buffer.length) {
    const clave = leerVarint(buffer, i);
    i = clave.fin;

    const numero = Number(clave.valor >> 3n);
    const wire = Number(clave.valor & 7n);

    if (numero === 0) {
      throw new Error('Campo protobuf inválido (número 0).');
    }

    switch (wire) {
      case 0: {
        const v = leerVarint(buffer, i);
        i = v.fin;
        lista.push({ numero, wire, valor: v.valor });
        break;
      }
      case 1: {
        lista.push({ numero, wire, valor: buffer.subarray(i, i + 8) });
        i += 8;
        break;
      }
      case 2: {
        const l = leerVarint(buffer, i);
        i = l.fin;
        const longitud = Number(l.valor);
        lista.push({ numero, wire, valor: buffer.subarray(i, i + longitud) });
        i += longitud;
        break;
      }
      case 5: {
        lista.push({ numero, wire, valor: buffer.subarray(i, i + 4) });
        i += 4;
        break;
      }
      default:
        throw new Error(`Tipo de wire no soportado: ${wire}`);
    }
  }

  return lista;
}

/**
 * Lee un varint (entero de longitud variable) desde la posición `inicio`.
 *
 * @param {Buffer|Uint8Array} buffer
 * @param {number} inicio
 * @returns {{valor: bigint, fin: number}}
 */
function leerVarint(buffer, inicio) {
  let resultado = 0n;
  let desplazamiento = 0n;
  let i = inicio;

  while (i < buffer.length) {
    const byte = buffer[i];
    i += 1;
    resultado |= BigInt(byte & 0x7f) << desplazamiento;
    if ((byte & 0x80) === 0) {
      return { valor: resultado, fin: i };
    }
    desplazamiento += 7n;
    if (desplazamiento > 63n) {
      throw new Error('Varint demasiado largo.');
    }
  }

  throw new Error('Varint truncado.');
}

/**
 * Primer campo con el número indicado, o `undefined`.
 *
 * @param {CampoProto[]} lista
 * @param {number} numero
 * @returns {CampoProto|undefined}
 */
function campo(lista, numero) {
  return lista.find((c) => c.numero === numero);
}

/**
 * Todos los campos con el número indicado (para campos `repeated`).
 *
 * @param {CampoProto[]} lista
 * @param {number} numero
 * @returns {CampoProto[]}
 */
function campos(lista, numero) {
  return lista.filter((c) => c.numero === numero);
}

/**
 * String UTF-8 de un campo length-delimited.
 *
 * @param {CampoProto|undefined} c
 * @returns {string|undefined}
 */
function comoTexto(c) {
  if (!c || !Buffer.isBuffer(c.valor)) return undefined;
  return c.valor.toString('utf8');
}

/**
 * Entero de un campo varint, con conversión segura de BigInt a Number.
 * Los `int32` de GTFS-RT llegan como varint de 64 bits en complemento a dos.
 *
 * @param {CampoProto|undefined} c
 * @param {boolean} [conSigno]
 * @returns {number|undefined}
 */
function comoEntero(c, conSigno = false) {
  if (!c) return undefined;
  const v = typeof c.valor === 'bigint' ? c.valor : BigInt(c.valor);
  return conSigno ? Number(BigInt.asIntN(64, v)) : Number(BigInt.asUintN(64, v));
}

/**
 * `float` de 32 bits (wire type 5).
 *
 * @param {CampoProto|undefined} c
 * @returns {number|undefined}
 */
function comoFloat(c) {
  if (!c || !Buffer.isBuffer(c.valor) || c.valor.length !== 4) return undefined;
  return c.valor.readFloatLE(0);
}

/**
 * Mensaje anidado (length-delimited que a su vez es un protobuf).
 *
 * @param {CampoProto|undefined} c
 * @returns {CampoProto[]|undefined}
 */
function comoMensaje(c) {
  if (!c || !Buffer.isBuffer(c.valor)) return undefined;
  return leerCampos(c.valor);
}

module.exports = {
  leerCampos,
  campo,
  campos,
  comoTexto,
  comoEntero,
  comoFloat,
  comoMensaje,
};
