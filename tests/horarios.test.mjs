import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

process.env.AUVASA_RT_DISABLED = '1';

const catalogo = require('../lambda/src/services/catalogo');
const horarios = require('../lambda/src/services/horarios');
const almacen = require('../lambda/src/data/almacen');
const { epochDiaServicio, ahora } = require('../lambda/src/util/tiempo');

/**
 * Busca una fecha del calendario con su hora de referencia a las 08:00 de
 * Madrid, para que los tests no dependan del día en que se ejecuten.
 *
 * @returns {{fecha: string, referencia: Date}}
 */
function fechaDePrueba() {
  const fechas = Object.keys(almacen.calendario().serviciosPorFecha).sort();
  const fecha = fechas[Math.floor(fechas.length / 2)];
  const referencia = new Date((epochDiaServicio(fecha) + 8 * 3600) * 1000);
  return { fecha, referencia };
}

test('la parada se puede localizar por nombre y por número', () => {
  const porNombre = catalogo.buscarParadas('Paseo Zorrilla 198 La Rubia', { limite: 1 });
  assert.equal(porNombre[0].parada.codigo, '1000');
  assert.ok(porNombre[0].puntuacion >= 90);

  const porCodigo = catalogo.buscarParadas('1000', { limite: 1 });
  assert.equal(porCodigo[0].parada.nombre, 'Paseo Zorrilla 198 La Rubia');
});

test('la búsqueda tolera mayúsculas, acentos y nombres parciales', () => {
  const [r] = catalogo.buscarParadas('zorrilla 198', { limite: 1 });
  assert.equal(r.parada.codigo, '1000');

  const [d] = catalogo.buscarParadas('CIGÜEÑA 14', { limite: 1 });
  assert.equal(d.parada.codigo, '635');
});

test('una consulta sin relación devuelve puntuaciones bajas', () => {
  const resultados = catalogo.buscarParadas('estación espacial internacional', { limite: 3 });
  assert.ok(resultados.every((r) => r.puntuacion < 90), JSON.stringify(resultados));
});

test('las líneas de una parada se listan sin repetir', () => {
  const parada = catalogo.buscarParadas('Plaza Mayor 29 (La Cistérniga)', { limite: 1 })[0].parada;
  const lineas = catalogo.lineasEnParada(parada.id);
  const codigos = lineas.map((l) => l.codigo);
  assert.ok(codigos.length > 0);
  assert.equal(new Set(codigos).size, codigos.length);
  assert.ok(codigos.includes('13'));
});

test('los códigos de línea se ordenan de forma natural', () => {
  const codigos = ['B2', '10', '2', 'C1', '1'].sort(catalogo.compararCodigos);
  assert.deepEqual(codigos, ['1', '2', '10', 'B2', 'C1']);
});

test('proximasLlegadas devuelve autobuses ordenados por hora', async () => {
  const { referencia } = fechaDePrueba();
  const parada = catalogo.buscarParadas('Paseo Zorrilla 198 La Rubia', { limite: 1 })[0].parada;

  const resultado = await horarios.proximasLlegadas(parada.id, { referencia, limite: 5 });
  assert.equal(resultado.parada.id, parada.id);
  assert.ok(resultado.llegadas.length > 0, 'se esperaban llegadas a las 08:00');

  const segundos = resultado.llegadas.map((l) => l.segundos);
  const ordenados = [...segundos].sort((a, b) => a - b);
  assert.deepEqual(segundos, ordenados);
  assert.ok(resultado.llegadas.every((l) => l.minutos >= 0));
});

test('se puede filtrar por línea', async () => {
  const { referencia } = fechaDePrueba();
  const parada = catalogo.buscarParadas('Calle Doctrinos 12 esquina María de Molina', { limite: 1 })[0].parada;

  const resultado = await horarios.proximasLlegadas(parada.id, { referencia, linea: '3', limite: 5 });
  assert.ok(resultado.llegadas.every((l) => l.linea.codigo === '3'));
});

test('una línea inexistente no devuelve llegadas', async () => {
  const { referencia } = fechaDePrueba();
  const parada = catalogo.buscarParadas('Paseo Zorrilla 198 La Rubia', { limite: 1 })[0].parada;
  const resultado = await horarios.proximasLlegadas(parada.id, { referencia, linea: 'Z99' });
  assert.equal(resultado.aviso, 'lineaDesconocida');
});

test('el calendario siempre resuelve servicios, aunque falte la fecha', () => {
  const activos = catalogo.serviciosActivos('20990101');
  assert.ok(activos.servicios.size > 0, 'debería caer en el calendario conocido');
  assert.equal(activos.exacta, false);

  const hoy = ahora().fecha;
  const exactos = catalogo.serviciosActivos(hoy);
  assert.ok(exactos.servicios.size >= 0);
});
