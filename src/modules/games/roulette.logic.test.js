// Pruebas de la lógica pura de la ruleta. Ejecutar con:
//   node --test src/modules/games/roulette.logic.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  colorDe,
  generarNumeroGanador,
  numerosCubiertos,
  apuestaGana,
  calcularPremio,
  DOBLE_CERO,
} from './roulette.logic.js';

test('colores: 0 y 00 son verdes, 1 rojo, 2 negro', () => {
  assert.equal(colorDe(0), 'verde');
  assert.equal(colorDe(DOBLE_CERO), 'verde');
  assert.equal(colorDe(1), 'rojo');
  assert.equal(colorDe(2), 'negro');
  assert.equal(colorDe(17), 'negro');
});

test('número ganador siempre entre 0 y 37', () => {
  for (let i = 0; i < 2000; i++) {
    const n = generarNumeroGanador();
    assert.ok(Number.isInteger(n) && n >= 0 && n <= 37);
  }
});

test('pleno 17 gana con 17 y pierde con 18', () => {
  assert.equal(apuestaGana('pleno', { numeros: [17] }, 17), true);
  assert.equal(apuestaGana('pleno', { numeros: [17] }, 18), false);
});

test('pleno al 00 (37)', () => {
  assert.equal(apuestaGana('pleno', { numeros: [37] }, 37), true);
  assert.equal(apuestaGana('pleno', { numeros: [37] }, 0), false);
});

test('0 y 00 pierden en todas las apuestas externas', () => {
  for (const tipo of ['rojo', 'negro', 'par', 'impar', 'bajo', 'alto']) {
    assert.equal(apuestaGana(tipo, {}, 0), false, tipo);
    assert.equal(apuestaGana(tipo, {}, 37), false, tipo);
  }
  assert.equal(apuestaGana('docena', { valor: 1 }, 0), false);
  assert.equal(apuestaGana('columna', { valor: 3 }, 37), false);
});

test('externas cubren 18 números', () => {
  for (const tipo of ['rojo', 'negro', 'par', 'impar', 'bajo', 'alto']) {
    assert.equal(numerosCubiertos(tipo, {}).length, 18, tipo);
  }
});

test('docenas y columnas', () => {
  assert.deepEqual(numerosCubiertos('docena', { valor: 2 }), [13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24]);
  assert.equal(apuestaGana('columna', { valor: 1 }, 34), true);
  assert.equal(apuestaGana('columna', { valor: 3 }, 36), true);
  assert.throws(() => numerosCubiertos('docena', { valor: 4 }), { code: 'SELECCION_INVALIDA' });
});

test('splits válidos e inválidos', () => {
  assert.doesNotThrow(() => numerosCubiertos('split', { numeros: [1, 2] }));
  assert.doesNotThrow(() => numerosCubiertos('split', { numeros: [1, 4] }));
  assert.doesNotThrow(() => numerosCubiertos('split', { numeros: [0, 37] }));
  assert.throws(() => numerosCubiertos('split', { numeros: [3, 4] }), { code: 'SELECCION_INVALIDA' });
  assert.throws(() => numerosCubiertos('split', { numeros: [1, 3] }), { code: 'SELECCION_INVALIDA' });
});

test('calle y esquina', () => {
  assert.doesNotThrow(() => numerosCubiertos('calle', { numeros: [4, 5, 6] }));
  assert.throws(() => numerosCubiertos('calle', { numeros: [5, 6, 7] }), { code: 'SELECCION_INVALIDA' });
  assert.doesNotThrow(() => numerosCubiertos('esquina', { numeros: [1, 2, 4, 5] }));
  assert.throws(() => numerosCubiertos('esquina', { numeros: [3, 4, 6, 7] }), { code: 'SELECCION_INVALIDA' });
});

test('selecciones mal formadas', () => {
  assert.throws(() => numerosCubiertos('pleno', {}), { code: 'SELECCION_INVALIDA' });
  assert.throws(() => numerosCubiertos('pleno', { numeros: [38] }), { code: 'SELECCION_INVALIDA' });
  assert.throws(() => numerosCubiertos('pleno', { numeros: [1, 2] }), { code: 'SELECCION_INVALIDA' });
  assert.throws(() => numerosCubiertos('split', { numeros: [5, 5] }), { code: 'SELECCION_INVALIDA' });
  assert.throws(() => numerosCubiertos('ruso', {}), { code: 'TIPO_APUESTA_DESCONOCIDO' });
});

test('premio = monto × (multiplicador + 1), acepta NUMERIC como texto', () => {
  assert.equal(calcularPremio(10, 35), 360);
  assert.equal(calcularPremio('10.00', '35.00'), 360);
  assert.equal(calcularPremio(25.5, 1), 51);
  assert.equal(calcularPremio(0.1, 2), 0.3);
});
