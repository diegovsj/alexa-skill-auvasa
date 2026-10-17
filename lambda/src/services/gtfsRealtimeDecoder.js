'use strict';

/**
 * Decodificación de los feeds GTFS-Realtime de AUVASA.
 *
 * AUVASA publica tres feeds en tiempo real (documentados en
 * https://www.auvasa.es/empresa/datos-abiertos/, "Links GTFS Dinámicos"):
 *
 *   TripUpdates       -> retrasos previstos de cada viaje (lo que usamos)
 *   VehiclePositions  -> posición de cada autobús (informativo)
 *   Alerts            -> avisos e incidencias de servicio
 *
 * El formato es GTFS-Realtime v2 (Protocol Buffers). Aquí solo se extraen los
 * campos que necesita la skill.
 */

const { leerCampos, campo, campos, comoTexto, comoEntero, comoFloat, comoMensaje } = require('./protobuf');

/** TripDescriptor.ScheduleRelationship */
const RELACION_VIAJE = {
  0: 'SCHEDULED',
  1: 'ADDED',
  2: 'UNSCHEDULED',
  3: 'CANCELED',
  5: 'REPLACEMENT',
  6: 'DUPLICATED',
  7: 'DELETED',
};

/** StopTimeUpdate.ScheduleRelationship */
const RELACION_PARADA = {
  0: 'SCHEDULED',
  1: 'SKIPPED',
  2: 'NO_DATA',
  3: 'UNSCHEDULED',
};

/** VehiclePosition.OccupancyStatus */
const OCUPACION = {
  0: 'EMPTY',
  1: 'MANY_SEATS_AVAILABLE',
  2: 'FEW_SEATS_AVAILABLE',
  3: 'STANDING_ROOM_ONLY',
  4: 'CRUSHED_STANDING_ROOM_ONLY',
  5: 'FULL',
  6: 'NOT_ACCEPTING_PASSENGERS',
};

/** VehiclePosition.VehicleStopStatus */
const ESTADO_VEHICULO = {
  0: 'INCOMING_AT',
  1: 'STOPPED_AT',
  2: 'IN_TRANSIT_TO',
};

/**
 * Decodifica un FeedMessage completo.
 *
 * @param {Buffer} buffer
 * @returns {{version: string|undefined, timestamp: number|undefined, entidades: object[]}}
 */
function decodificarFeed(buffer) {
  const raiz = leerCampos(buffer);

  const cabecera = comoMensaje(campo(raiz, 1));

  const entidades = campos(raiz, 2).map((c) => {
    const cuerpo = comoMensaje(c) || [];
    const entidad = { id: comoTexto(campo(cuerpo, 1)) };

    if (comoEntero(campo(cuerpo, 2))) entidad.borrada = true;

    const tu = comoMensaje(campo(cuerpo, 3));
    if (tu) entidad.actualizacionViaje = decodificarTripUpdate(tu);

    const vp = comoMensaje(campo(cuerpo, 4));
    if (vp) entidad.vehiculo = decodificarVehiclePosition(vp);

    return entidad;
  });

  return {
    version: cabecera ? comoTexto(campo(cabecera, 1)) : undefined,
    timestamp: cabecera ? comoEntero(campo(cabecera, 3)) : undefined,
    entidades,
  };
}

/**
 * @param {import('./protobuf').CampoProto[]} cuerpo
 * @returns {object}
 */
function decodificarTripUpdate(cuerpo) {
  const trip = comoMensaje(campo(cuerpo, 1)) || [];
  const relacion = comoEntero(campo(trip, 4));

  return {
    tripId: comoTexto(campo(trip, 1)),
    routeId: comoTexto(campo(trip, 5)),
    startDate: comoTexto(campo(trip, 3)),
    startTime: comoTexto(campo(trip, 2)),
    relacion: RELACION_VIAJE[relacion] || 'SCHEDULED',
    retraso: comoEntero(campo(cuerpo, 5), true),
    timestamp: comoEntero(campo(cuerpo, 4)),
    paradas: campos(cuerpo, 2).map((c) => decodificarStopTimeUpdate(comoMensaje(c) || [])),
  };
}

/**
 * @param {import('./protobuf').CampoProto[]} cuerpo
 * @returns {object}
 */
function decodificarStopTimeUpdate(cuerpo) {
  const relacion = comoEntero(campo(cuerpo, 5));
  return {
    stopId: comoTexto(campo(cuerpo, 4)),
    secuencia: comoEntero(campo(cuerpo, 1)),
    llegada: decodificarStopTimeEvent(comoMensaje(campo(cuerpo, 2))),
    salida: decodificarStopTimeEvent(comoMensaje(campo(cuerpo, 3))),
    relacion: RELACION_PARADA[relacion] || 'SCHEDULED',
  };
}

/**
 * @param {import('./protobuf').CampoProto[]|undefined} cuerpo
 * @returns {{retraso?: number, hora?: number, incertidumbre?: number}|undefined}
 */
function decodificarStopTimeEvent(cuerpo) {
  if (!cuerpo) return undefined;
  const evento = {
    retraso: comoEntero(campo(cuerpo, 1), true),
    hora: comoEntero(campo(cuerpo, 2), true),
    incertidumbre: comoEntero(campo(cuerpo, 3), true),
  };
  if (evento.retraso === undefined && evento.hora === undefined) return undefined;
  return evento;
}

/**
 * @param {import('./protobuf').CampoProto[]} cuerpo
 * @returns {object}
 */
function decodificarVehiclePosition(cuerpo) {
  const trip = comoMensaje(campo(cuerpo, 1)) || [];
  const posicion = comoMensaje(campo(cuerpo, 2)) || [];

  return {
    tripId: comoTexto(campo(trip, 1)),
    routeId: comoTexto(campo(trip, 5)),
    stopId: comoTexto(campo(cuerpo, 7)),
    secuencia: comoEntero(campo(cuerpo, 3)),
    lat: comoFloat(campo(posicion, 1)),
    lon: comoFloat(campo(posicion, 2)),
    rumbo: comoFloat(campo(posicion, 3)),
    velocidad: comoFloat(campo(posicion, 5)),
    ocupacion: OCUPACION[comoEntero(campo(cuerpo, 9))] || undefined,
    estado: ESTADO_VEHICULO[comoEntero(campo(cuerpo, 4))] || undefined,
    timestamp: comoEntero(campo(cuerpo, 5)),
  };
}

module.exports = {
  decodificarFeed,
  decodificarTripUpdate,
  decodificarVehiclePosition,
  RELACION_VIAJE,
  RELACION_PARADA,
  OCUPACION,
};
