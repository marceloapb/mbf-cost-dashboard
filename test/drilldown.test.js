'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { applyMarginToServices } = require('../src/margin');

test('applyMarginToServices: aplica margem por serviço e soma totais', () => {
  const services = [
    { service: 'Amazon EC2', cost: 10 },
    { service: 'Amazon S3', cost: 5 },
  ];
  const { items, totals } = applyMarginToServices(services, 1.5);
  assert.strictEqual(items.length, 2);
  assert.strictEqual(items[0].billable, 15); // 10 * 1.5
  assert.strictEqual(items[0].profit, 5);
  assert.strictEqual(items[1].billable, 7.5); // 5 * 1.5
  assert.strictEqual(totals.cost, 15);
  assert.strictEqual(totals.billable, 22.5);
  assert.strictEqual(totals.profit, 7.5);
});

test('applyMarginToServices: margem default 1.0 quando inválida', () => {
  const { items } = applyMarginToServices([{ service: 'X', cost: 8 }], undefined);
  assert.strictEqual(items[0].margin, 1.0);
  assert.strictEqual(items[0].billable, 8);
  assert.strictEqual(items[0].profit, 0);
});

test('applyMarginToServices: lista vazia zera totais', () => {
  const { items, totals } = applyMarginToServices([], 2);
  assert.strictEqual(items.length, 0);
  assert.deepStrictEqual(totals, { cost: 0, billable: 0, profit: 0 });
});
