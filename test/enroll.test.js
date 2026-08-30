'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const { createEnrollmentToken, verifyEnrollmentToken } = require('../src/auth');

const SECRET = 'session-secret-de-teste';

test('enrollment round-trip: recupera username e totpSecret', () => {
  const token = createEnrollmentToken('marcelo', 'ABCDEF234567', SECRET);
  const out = verifyEnrollmentToken(token, SECRET);
  assert.deepStrictEqual(out, { username: 'marcelo', totpSecret: 'ABCDEF234567' });
});

test('enrollment: rejeita assinatura com segredo errado', () => {
  const token = createEnrollmentToken('marcelo', 'ABCDEF234567', SECRET);
  assert.strictEqual(verifyEnrollmentToken(token, 'outro-segredo'), null);
});

test('enrollment: rejeita token adulterado', () => {
  const token = createEnrollmentToken('marcelo', 'ABCDEF234567', SECRET);
  const tampered = token.slice(0, -2) + 'zz';
  assert.strictEqual(verifyEnrollmentToken(tampered, SECRET), null);
});

test('enrollment: rejeita token expirado', () => {
  const token = createEnrollmentToken('marcelo', 'ABCDEF234567', SECRET, -1);
  assert.strictEqual(verifyEnrollmentToken(token, SECRET), null);
});

test('enrollment: rejeita token de outro tipo (k != enroll)', () => {
  // Simula um token de sessão comum (sem k=enroll) e garante que não é aceito como enrollment.
  const payload = { u: 'marcelo', exp: Math.floor(Date.now() / 1000) + 600 };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  assert.strictEqual(verifyEnrollmentToken(`${body}.${sig}`, SECRET), null);
});

test('enrollment: rejeita formato inválido', () => {
  assert.strictEqual(verifyEnrollmentToken('', SECRET), null);
  assert.strictEqual(verifyEnrollmentToken('semponto', SECRET), null);
});
