import test from 'node:test';
import assert from 'node:assert/strict';

import { parseCsv, horaASegundos } from '../tools/lib/csv.mjs';
import { normalizar } from '../tools/lib/texto.mjs';
import { sinonimosParada, sinonimosLinea } from '../tools/lib/sinonimos.mjs';

test('parseCsv interpreta cabeceras y filas', () => {
  const csv = 'a,b,c\r\n1,2,3\r\n4,5,6\r\n';
  const filas = parseCsv(csv);
  assert.equal(filas.length, 2);
  assert.deepEqual(filas[0], { a: '1', b: '2', c: '3' });
  assert.deepEqual(filas[1], { a: '4', b: '5', c: '6' });
});

test('parseCsv respeta las comillas y las comas dentro de campos', () => {
  const csv = 'nombre,desc\n"Calle Mayor, 3","dice ""hola"""\n';
  const [fila] = parseCsv(csv);
  assert.equal(fila.nombre, 'Calle Mayor, 3');
  assert.equal(fila.desc, 'dice "hola"');
});

test('parseCsv ignora líneas vacías', () => {
  assert.equal(parseCsv('a,b\n1,2\n\n').length, 1);
});

test('horaASegundos admite horas de más de 24 h (viajes nocturnos)', () => {
  assert.equal(horaASegundos('00:00:00'), 0);
  assert.equal(horaASegundos('07:16:15'), 26175);
  assert.equal(horaASegundos('25:30:00'), 91800);
  assert.ok(Number.isNaN(horaASegundos('7:16')));
});

test('normalizar quita acentos, mayúsculas y puntuación', () => {
  assert.equal(normalizar('Paseo Zorrilla 198, La Rubia'), 'paseo zorrilla 198 la rubia');
  assert.equal(normalizar('Cigüeña'), 'ciguena');
});

test('sinonimosParada genera formas cortas útiles', () => {
  const s = sinonimosParada('Paseo Zorrilla 198 La Rubia');
  assert.ok(s.includes('Zorrilla 198'), `se esperaba "Zorrilla 198" en ${JSON.stringify(s)}`);

  const t = sinonimosParada('Calle Portillo Balboa frente 60 esquina Amor de Dios');
  assert.ok(t.includes('Calle Portillo Balboa'));
  assert.ok(t.includes('Portillo Balboa'));
});

test('sinonimosParada no repite el nombre oficial ni genera cadenas cortas', () => {
  for (const nombre of ['Calle Alamillos 11', 'Plaza Mayor 29 (La Cistérniga)']) {
    const s = sinonimosParada(nombre);
    assert.ok(!s.includes(nombre));
    assert.ok(s.every((x) => x.length >= 4));
  }
});

test('sinonimosLinea cubre líneas numéricas y con letra', () => {
  assert.ok(sinonimosLinea({ codigo: '3', nombre: '' }).includes('linea 3'));
  const c1 = sinonimosLinea({ codigo: 'C1', nombre: '' });
  assert.ok(c1.some((s) => s.includes('circular')), JSON.stringify(c1));
});
