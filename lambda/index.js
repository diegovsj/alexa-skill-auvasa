'use strict';

/**
 * Punto de entrada de la AWS Lambda de la skill AUVASA.
 *
 * El handler se construye una sola vez por contenedor, de modo que las
 * conexiones y los datos estáticos se reutilizan entre invocaciones.
 */

const Alexa = require('ask-sdk-core');

const handlers = require('./src/handlers');
const { ErrorHandler } = require('./src/handlers/sistema');
const { PersistenciaMemoria, PersistenciaDynamoDB } = require('./src/persistence/dynamodb');
const meta = require('./data/meta.json');

/**
 * Alexa-hosted crea automáticamente una tabla de DynamoDB para la skill y
 * expone el nombre en la variable de entorno DYNAMODB_TABLE. Si la variable no
 * existe (desarrollo local, pruebas) se usa un adaptador en memoria: la skill
 * funciona igual, solo que la parada favorita no sobrevive al contenedor.
 *
 * Es importante devolver SIEMPRE un adaptador: sin él, el SDK lanza un error
 * al pedir los atributos persistentes.
 *
 * @returns {object}
 */
function crearAdaptadorPersistencia() {
  const tabla = process.env.DYNAMODB_TABLE
    || process.env.DYNAMODB_TABLE_NAME
    || process.env.AUVASA_DYNAMODB_TABLE;
  if (!tabla) return new PersistenciaMemoria();
  return new PersistenciaDynamoDB({ tableName: tabla });
}

let skill;

/**
 * @returns {object}
 */
function construirSkill() {
  return Alexa.SkillBuilders.custom()
    .addRequestHandlers(...handlers)
    .addErrorHandlers(ErrorHandler)
    .withPersistenceAdapter(crearAdaptadorPersistencia())
    .lambda();
}

/**
 * Handler de la Lambda. Se envuelve la API de callbacks del SDK en una
 * promesa para poder probarlo cómodamente en local.
 *
 * @param {object} event
 * @param {object} context
 * @returns {Promise<object>}
 */
exports.handler = async (event, context) => {
  if (!skill) skill = construirSkill();
  return new Promise((resolve, reject) => {
    skill(event, context, (error, respuesta) => {
      if (error) reject(error);
      else resolve(respuesta);
    });
  });
};

/** Información de la versión de los datos, útil para diagnósticos. */
exports.infoDatos = () => meta;
