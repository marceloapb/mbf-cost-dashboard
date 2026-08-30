'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { parseMarginMap, marginFor, applyMargins, applyMarginToServices, applyMarginToUsageTypes, round2 } = require('../src/margin');

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

test('applyMarginToServices: preserva usage/unit e calcula billable/profit', () => {
  const svc = [
    { service: 'AWS Lambda', cost: 10, usage: 1500, unit: 'Requests' },
    { service: 'Amazon S3', cost: 5, usage: 20, unit: 'GB-Mo' },
  ];
  const { items, totals } = applyMarginToServices(svc, 1.5);
  const lambda = items.find((i) => i.service === 'AWS Lambda');
  assert.strictEqual(lambda.usage, 1500);
  assert.strictEqual(lambda.unit, 'Requests');
  assert.strictEqual(lambda.billable, 15); // 10 * 1.5
  assert.strictEqual(lambda.profit, 5);
  assert.strictEqual(totals.cost, 15);
  assert.strictEqual(totals.billable, 22.5);
  assert.strictEqual(totals.profit, 7.5);
});

test('applyMarginToServices: usage ausente vira 0 e unit vazia', () => {
  const { items } = applyMarginToServices([{ service: 'X', cost: 1 }], 1.0);
  assert.strictEqual(items[0].usage, 0);
  assert.strictEqual(items[0].unit, '');
});

test('applyMarginToUsageTypes: preserva usageType/usage/unit e aplica margem', () => {
  const rows = [
    { usageType: 'Requests-Tier1', cost: 8, usage: 1000000, unit: 'Requests' },
    { usageType: 'DataTransfer-Out', cost: 2, usage: 12.5, unit: 'GB' },
  ];
  const { items, totals } = applyMarginToUsageTypes(rows, 2.0);
  const t1 = items.find((i) => i.usageType === 'Requests-Tier1');
  assert.strictEqual(t1.usage, 1000000);
  assert.strictEqual(t1.unit, 'Requests');
  assert.strictEqual(t1.billable, 16); // 8 * 2.0
  assert.strictEqual(t1.profit, 8);
  assert.strictEqual(totals.cost, 10);
  assert.strictEqual(totals.billable, 20);
  assert.strictEqual(totals.profit, 10);
});

test('applyMarginToUsageTypes: margem inválida cai para 1.0', () => {
  const { items } = applyMarginToUsageTypes([{ usageType: 'X', cost: 5, usage: 1, unit: 'u' }], 'abc');
  assert.strictEqual(items[0].margin, 1.0);
  assert.strictEqual(items[0].billable, 5);
});
