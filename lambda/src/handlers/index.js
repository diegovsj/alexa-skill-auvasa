'use strict';

/**
 * Lista ordenada de handlers. El orden importa: el primero que responde
 * `canHandle` con `true` es el que atiende la petición.
 */

const consultas = require('./consultas');
const favorita = require('./favorita');
const sistema = require('./sistema');

module.exports = [
  sistema.LanzamientoHandler,
  sistema.AyudaIntentHandler,
  consultas.ConsultarLlegadasIntentHandler,
  consultas.ConsultarLineasEnParadaIntentHandler,
  consultas.ConsultarParadasDeLineaIntentHandler,
  favorita.GuardarParadaFavoritaIntentHandler,
  favorita.ConsultarParadaFavoritaIntentHandler,
  sistema.SiIntentHandler,
  sistema.NoIntentHandler,
  sistema.SalirIntentHandler,
  sistema.NoEntendidoHandler,
  sistema.FinSesionHandler,
];
