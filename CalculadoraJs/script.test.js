const test = require('node:test');
const assert = require('node:assert/strict');

const { calculateResult, normalizeByte, parseInput, toBin } = require('./script.js');

test('convierte bytes a binario de 8 bits', () => {
  assert.equal(toBin(5), '00000101');
  assert.equal(toBin(255), '11111111');
});

test('valida entradas decimales completas', () => {
  assert.equal(parseInput(' 255 ', 'DEC'), 255);
  assert.throws(() => parseInput('12abc', 'DEC'));
  assert.throws(() => parseInput('1.5', 'DEC'));
  assert.throws(() => parseInput('256', 'DEC'));
});

test('valida entradas binarias de hasta 8 bits', () => {
  assert.equal(parseInput('00001011', 'BIN'), 11);
  assert.throws(() => parseInput('102', 'BIN'));
  assert.throws(() => parseInput('000000001', 'BIN'));
});

test('aplica aritmética de 8 bits y reporta desbordamiento', () => {
  assert.deepEqual(calculateResult('ADD', 5, 11), { raw: 16, byte: 16, overflow: false });
  assert.deepEqual(calculateResult('ADD', 250, 10), { raw: 260, byte: 4, overflow: true });
  assert.deepEqual(calculateResult('SUB', 2, 10), { raw: -8, byte: 248, overflow: true });
  assert.equal(normalizeByte(-1), 255);
});

test('usa división entera y rechaza división por cero', () => {
  assert.deepEqual(calculateResult('DIV', 11, 2), { raw: 5, byte: 5, overflow: false });
  assert.throws(() => calculateResult('DIV', 10, 0), /división por cero/i);
});
