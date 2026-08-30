'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { normalize, redactConfig, ALLOWED_MODELS } = require('../src/configNormalize');

test('normalize: defaults quando vazio', () => {
  const c = normalize({});
  assert.strictEqual(c.host, '');
  assert.strictEqual(c.port, 993);
  assert.deepStrictEqual(c.mailboxes, []);
  assert.deepStrictEqual(c.senders, []);
  assert.strictEqual(c.scanLimit, 100);
  assert.strictEqual(c.scanWindowDays, 0);
  assert.strictEqual(c.scanIntervalHours, 1);
  assert.ok(ALLOWED_MODELS.includes(c.bedrockModelId));
});

test('normalize: clamp de scanLimit (1..1000)', () => {
  assert.strictEqual(normalize({ scanLimit: 0 }).scanLimit, 1);
  assert.strictEqual(normalize({ scanLimit: 5000 }).scanLimit, 1000);
  assert.strictEqual(normalize({ scanLimit: 250 }).scanLimit, 250);
  assert.strictEqual(normalize({ scanLimit: 'abc' }).scanLimit, 100); // default
});

test('normalize: clamp de scanIntervalHours (1..24)', () => {
  assert.strictEqual(normalize({ scanIntervalHours: 0 }).scanIntervalHours, 1);
  assert.strictEqual(normalize({ scanIntervalHours: 48 }).scanIntervalHours, 24);
  assert.strictEqual(normalize({ scanIntervalHours: 6 }).scanIntervalHours, 6);
});

test('normalize: scanWindowDays 0 (caixa toda) permitido', () => {
  assert.strictEqual(normalize({ scanWindowDays: 0 }).scanWindowDays, 0);
  assert.strictEqual(normalize({ scanWindowDays: 30 }).scanWindowDays, 30);
  assert.strictEqual(normalize({ scanWindowDays: -5 }).scanWindowDays, 0);
});

test('normalize: modelo invalido cai no default permitido', () => {
  assert.ok(ALLOWED_MODELS.includes(normalize({ bedrockModelId: 'inexistente' }).bedrockModelId));
  const valid = ALLOWED_MODELS[1];
  assert.strictEqual(normalize({ bedrockModelId: valid }).bedrockModelId, valid);
});

test('normalize: senders string vira lista unica minuscula', () => {
  const c = normalize({ senders: '@AWS.com\n@aws.com; Billing@Amazon.com' });
  assert.deepStrictEqual(c.senders, ['@aws.com', 'billing@amazon.com']);
});

test('normalize: mailboxes filtra invalidos e preserva senha', () => {
  const c = normalize({ mailboxes: [{ user: 'a@b.com', password: 'x' }, { user: 'semarroba' }, { user: 'c@d.com' }] });
  assert.strictEqual(c.mailboxes.length, 2);
  assert.strictEqual(c.mailboxes[0].password, 'x');
});

test('redactConfig: remove senhas e mantem hasPassword', () => {
  const c = normalize({ host: 'h', mailboxes: [{ user: 'a@b.com', password: 'secreta' }, { user: 'c@d.com', password: '' }] });
  const r = redactConfig(c);
  assert.strictEqual(r.mailboxes[0].hasPassword, true);
  assert.strictEqual(r.mailboxes[1].hasPassword, false);
  assert.strictEqual(r.mailboxes[0].password, undefined);
  assert.strictEqual(r.scanLimit, 100);
});
