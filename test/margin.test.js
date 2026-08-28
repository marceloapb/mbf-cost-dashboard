'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { parseMarginMap, marginFor, applyMargins, round2 } = require('../src/margin');

test('parseMarginMap: vazio retorna default 1.0', () => {
  assert.deepStrictEqual(parseMarginMap(undefined), { default: 1.0 });
});

test('parseMarginMap: injeta default se ausente', () => {
  const m = parseMarginMap('{"532404260870":1.5}');
  assert.strictEqual(m['532404260870'], 1.5);
  assert.strictEqual(m.default, 1.0);
});

test('parseMarginMap: JSON inválido lança erro', () => {
  assert.throws(() => parseMarginMap('{nao-json'), /MARGIN_MAP inválido/);
});

test('parseMarginMap: margem negativa lança erro', () => {
  assert.throws(() => parseMarginMap('{"x":-1}'), /Margem inválida/);
});

test('marginFor: usa default quando conta não mapeada', () => {
  const m = { default: 1.2, '111': 2.0 };
  assert.strictEqual(marginFor(m, '999'), 1.2);
  assert.strictEqual(marginFor(m, '111'), 2.0);
});

test('applyMargins: calcula billable e profit corretamente', () => {
  const map = { default: 1.0, '532404260870': 1.5 };
  const raw = [
    { accountId: '975877354440', accountName: 'MBF', cost: 100 },
    { accountId: '532404260870', accountName: 'Expresso do Maua', cost: 40 },
  ];
  const { items, totals } = applyMargins(raw, map);

  const mbf = items.find((i) => i.accountId === '975877354440');
  assert.strictEqual(mbf.billable, 100); // margem 1.0
  assert.strictEqual(mbf.profit, 0);

  const exp = items.find((i) => i.accountId === '532404260870');
  assert.strictEqual(exp.billable, 60); // 40 * 1.5
  assert.strictEqual(exp.profit, 20);

  assert.strictEqual(totals.cost, 140);
  assert.strictEqual(totals.billable, 160);
  assert.strictEqual(totals.profit, 20);
});

test('round2: arredonda para 2 casas', () => {
  assert.strictEqual(round2(1.005), 1.01);
  assert.strictEqual(round2(2.344), 2.34);
});
