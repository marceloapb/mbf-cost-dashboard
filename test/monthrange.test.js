'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { monthRange, monthRangeFromLabel, cleanUnit } = require('../src/dates');

test('monthRangeFromLabel: constrói range correto de um mês', () => {
  const r = monthRangeFromLabel('2026-08');
  assert.strictEqual(r.Start, '2026-08-01');
  assert.strictEqual(r.End, '2026-09-01'); // End exclusivo
  assert.strictEqual(r.label, '2026-08');
});

test('monthRangeFromLabel: vira janeiro do ano seguinte no fim do ano', () => {
  const r = monthRangeFromLabel('2026-12');
  assert.strictEqual(r.Start, '2026-12-01');
  assert.strictEqual(r.End, '2027-01-01');
  assert.strictEqual(r.label, '2026-12');
});

test('monthRangeFromLabel: label inválido cai no mês atual', () => {
  const now = monthRange(new Date());
  assert.strictEqual(monthRangeFromLabel('abc').label, now.label);
  assert.strictEqual(monthRangeFromLabel('2026-13').label, now.label);
  assert.strictEqual(monthRangeFromLabel('').label, now.label);
});

test('cleanUnit: remove N/A e vazios, preserva unidades reais', () => {
  assert.strictEqual(cleanUnit('N/A'), '');
  assert.strictEqual(cleanUnit('n/a'), '');
  assert.strictEqual(cleanUnit(''), '');
  assert.strictEqual(cleanUnit(undefined), '');
  assert.strictEqual(cleanUnit('  '), '');
  assert.strictEqual(cleanUnit('GB-Mo'), 'GB-Mo');
  assert.strictEqual(cleanUnit(' Requests '), 'Requests');
});
