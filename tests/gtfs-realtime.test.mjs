import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { decodificarFeed, decodificarTripUpdate } = require('../lambda/src/services/gtfsRealtimeDecoder');
const { construirIndice } = require('../lambda/src/services/gtfsRealtime');
const { leerCampos, campo, comoEntero } = require('../lambda/src/services/protobuf');

// --------------------------------------------------- codificador de apoyo
// Sirve para construir feeds GTFS-RT sintéticos en los tests.

function varint(valor) {
  let v = BigInt(valor);
  // Los negativos se codifican en complemento a dos de 64 bits (10 bytes).
  if (v < 0n) v = BigInt.asUintN(64, v);
  const bytes = [];
  do {
    let byte = Number(v & 0x7fn);
    v >>= 7n;
    if (v > 0n) byte |= 0x80;
    bytes.push(byte);
  } while (v > 0n);
  return Buffer.from(bytes);
}

const tag = (numero, wire) => varint(BigInt(numero) * 8n + BigInt(wire));
const entero = (numero, valor) => Buffer.concat([tag(numero, 0), varint(valor)]);
const texto = (numero, s) => {
  const b = Buffer.from(s, 'utf8');
  return Buffer.concat([tag(numero, 2), varint(b.length), b]);
};
const mensaje = (numero, buf) => Buffer.concat([tag(numero, 2), varint(buf.length), buf]);
const flotante = (numero, valor) => {
  const b = Buffer.alloc(4);
  b.writeFloatLE(valor);
  return Buffer.concat([tag(numero, 5), b]);
};

test('leerCampos decodifica varints, texto y mensajes anidados', () => {
  const buf = Buffer.concat([entero(1, 150), texto(2, 'hola')]);
  const campos = leerCampos(buf);
  assert.equal(comoEntero(campo(campos, 1)), 150);
  assert.equal(campo(campos, 2).valor.toString('utf8'), 'hola');
});

test('leerCampos interpreta negativos (complemento a dos)', () => {
  const buf = entero(1, -30n);
  const campos = leerCampos(buf);
  assert.equal(comoEntero(campo(campos, 1), true), -30);
});

test('decodificarFeed extrae viajes, paradas y vehículos', () => {
  const llegada = mensaje(2, entero(2, 1792140545));
  const parada1 = Buffer.concat([entero(1, 8), llegada]);
  const parada2 = Buffer.concat([entero(1, 13), mensaje(3, entero(1, 60))]);

  const trip = Buffer.concat([texto(1, 'L24A1_L24A1_8'), texto(5, '24')]);
  const tripUpdate = Buffer.concat([mensaje(1, trip), mensaje(2, parada1), mensaje(2, parada2)]);

  const vehiculo = Buffer.concat([
    mensaje(1, trip),
    mensaje(2, Buffer.concat([flotante(1, 41.65), flotante(2, -4.72)])),
    entero(9, 1),
  ]);

  const entidadTu = Buffer.concat([texto(1, 'e1'), mensaje(3, tripUpdate)]);
  const entidadVp = Buffer.concat([texto(1, 'e2'), mensaje(4, vehiculo)]);
  const cabecera = Buffer.concat([texto(1, '2.0'), entero(3, 1792140563)]);
  const feed = Buffer.concat([mensaje(1, cabecera), mensaje(2, entidadTu), mensaje(2, entidadVp)]);

  const decodificado = decodificarFeed(feed);
  assert.equal(decodificado.version, '2.0');
  assert.equal(decodificado.timestamp, 1792140563);
  assert.equal(decodificado.entidades.length, 2);

  const [tu, vp] = decodificado.entidades;
  assert.equal(tu.actualizacionViaje.tripId, 'L24A1_L24A1_8');
  assert.equal(tu.actualizacionViaje.routeId, '24');
  assert.equal(tu.actualizacionViaje.paradas.length, 2);
  assert.equal(tu.actualizacionViaje.paradas[0].llegada.hora, 1792140545);
  assert.equal(tu.actualizacionViaje.paradas[1].salida.retraso, 60);

  assert.equal(vp.vehiculo.tripId, 'L24A1_L24A1_8');
  assert.ok(Math.abs(vp.vehiculo.lat - 41.65) < 1e-4);
  assert.ok(Math.abs(vp.vehiculo.lon + 4.72) < 1e-4);
  assert.equal(vp.vehiculo.ocupacion, 'MANY_SEATS_AVAILABLE');
});

test('construirIndice resume los puntos de control por viaje', () => {
  const trip = texto(1, 'L3A_1');
  const tripUpdate = Buffer.concat([
    mensaje(1, trip),
    mensaje(2, Buffer.concat([entero(1, 5), mensaje(2, entero(2, 1000))])),
    mensaje(2, Buffer.concat([entero(1, 9), mensaje(2, entero(2, 1200))])),
  ]);
  const feed = decodificarFeed(mensaje(2, Buffer.concat([texto(1, 'e'), mensaje(3, tripUpdate)])));

  const indice = construirIndice(feed);
  const info = indice.get('L3A_1');
  assert.equal(info.minSecuencia, 5);
  assert.equal(info.maxSecuencia, 9);
  assert.equal(info.puntos.get(5).llegada, 1000);
  assert.equal(info.puntos.get(9).llegada, 1200);
});

test('un viaje cancelado se marca como CANCELED', () => {
  const trip = Buffer.concat([texto(1, 'L1A_1'), entero(4, 3)]);
  const tripUpdate = Buffer.concat([
    mensaje(1, trip),
    mensaje(2, Buffer.concat([entero(1, 1), mensaje(2, entero(2, 500))])),
  ]);
  const tu = decodificarTripUpdate(leerCampos(tripUpdate));
  assert.equal(tu.relacion, 'CANCELED');
});
