'use strict';

/**
 * Adaptadores de persistencia de atributos (la parada favorita del usuario).
 *
 * ¿Por qué no `ask-sdk-dynamodb-persistence-adapter`?
 *   Ese paquete depende del AWS SDK para JavaScript v2, que pesa ~100 MB y
 *   multiplica el tamaño del paquete de despliegue. El runtime de Lambda ya
 *   incluye el AWS SDK v3, así que basta con usarlo directamente.
 *
 * Estructura del registro en DynamoDB:
 *   { id: "<userId>", attributes: { paradaFavorita: {...} } }
 *
 * Cuando no hay tabla configurada (desarrollo local) se usa
 * `PersistenciaMemoria`, que recuerda la parada favorita mientras viva el
 * contenedor. Y si el SDK v3 de AWS no está disponible, `PersistenciaDynamoDB`
 * cae también a memoria: la skill nunca se rompe por no poder persistir.
 */

/** @type {Map<string, object>} */
const memoria = new Map();

let cliente;
let comandos;
let intentoSdk = false;

/**
 * Carga perezosa de `@aws-sdk/client-dynamodb`.
 *
 * @returns {{cliente: object, comandos: object}|null}
 */
function cargarSdk() {
  if (!intentoSdk) {
    intentoSdk = true;
    try {
      // eslint-disable-next-line global-require
      const { DynamoDBClient, GetItemCommand, PutItemCommand } = require('@aws-sdk/client-dynamodb');
      cliente = new DynamoDBClient({});
      comandos = { GetItemCommand, PutItemCommand };
    } catch (error) {
      console.warn('[auvasa] AWS SDK v3 no disponible, persistencia desactivada:', error.message);
      cliente = null;
      comandos = null;
    }
  }
  return cliente ? { cliente, comandos } : null;
}

/**
 * @param {object} requestEnvelope
 * @returns {string}
 */
function idUsuario(requestEnvelope) {
  return requestEnvelope?.session?.user?.userId
    || requestEnvelope?.context?.System?.user?.userId
    || 'anonimo';
}

/**
 * Adaptador en memoria. Es el que se usa en local y el que sirve de respaldo
 * cuando DynamoDB no está disponible.
 */
class PersistenciaMemoria {
  /**
   * @param {object} requestEnvelope
   * @returns {Promise<object>}
   */
  async getAttributes(requestEnvelope) {
    return memoria.get(idUsuario(requestEnvelope)) || {};
  }

  /**
   * @param {object} requestEnvelope
   * @param {object} attributes
   * @returns {Promise<void>}
   */
  async saveAttributes(requestEnvelope, attributes) {
    memoria.set(idUsuario(requestEnvelope), attributes);
  }
}

class PersistenciaDynamoDB {
  /**
   * @param {{tableName: string, attributesName?: string}} opciones
   */
  constructor(opciones) {
    this.tableName = opciones.tableName;
    this.attributesName = opciones.attributesName || 'attributes';
    this.respaldo = new PersistenciaMemoria();
  }

  /**
   * @param {object} requestEnvelope
   * @returns {Promise<object>}
   */
  async getAttributes(requestEnvelope) {
    const sdk = cargarSdk();
    if (!sdk) return this.respaldo.getAttributes(requestEnvelope);

    try {
      const respuesta = await sdk.cliente.send(new sdk.comandos.GetItemCommand({
        TableName: this.tableName,
        Key: { id: { S: idUsuario(requestEnvelope) } },
      }));

      const guardado = respuesta.Item?.[this.attributesName]?.S;
      return guardado ? JSON.parse(guardado) : {};
    } catch (error) {
      console.warn('[auvasa] error leyendo atributos persistentes:', error.message);
      return this.respaldo.getAttributes(requestEnvelope);
    }
  }

  /**
   * @param {object} requestEnvelope
   * @param {object} attributes
   * @returns {Promise<void>}
   */
  async saveAttributes(requestEnvelope, attributes) {
    await this.respaldo.saveAttributes(requestEnvelope, attributes);

    const sdk = cargarSdk();
    if (!sdk) return;

    try {
      const ttlSegundos = Number(process.env.AUVASA_TTL_SEGUNDOS || 0);
      const item = {
        id: { S: idUsuario(requestEnvelope) },
        [this.attributesName]: { S: JSON.stringify(attributes) },
        actualizado: { N: String(Math.floor(Date.now() / 1000)) },
      };
      if (ttlSegundos > 0) {
        item.expira = { N: String(Math.floor(Date.now() / 1000) + ttlSegundos) };
      }

      await sdk.cliente.send(new sdk.comandos.PutItemCommand({
        TableName: this.tableName,
        Item: item,
      }));
    } catch (error) {
      console.warn('[auvasa] error guardando atributos persistentes:', error.message);
    }
  }
}

module.exports = { PersistenciaMemoria, PersistenciaDynamoDB };
