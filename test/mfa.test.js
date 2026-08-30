'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const { createMfaToken, verifyMfaToken } = require('../src/auth');

const SECRET = 'session-secret-de-teste';

test('mfa round-trip: recupera o username', () => {
  const token = createMfaToken('marcelo', SECRET);
  assert.deepStrictEqual(verifyMfaToken(token, SECRET), { username: 'marcelo' });
});

test('mfa: rejeita assinatura com segredo errado', () => {
  const token = createMfaToken('marcelo', SECRET);
  assert.strictEqual(verifyMfaToken(token, 'outro-segredo'), null);
});

test('mfa: rejeita token adulterado', () => {
  const token = createMfaToken('marcelo', SECRET);
  const tampered = token.slice(0, -2) + 'zz';
  assert.strictEqual(verifyMfaToken(tampered, SECRET), null);
});

test('mfa: rejeita token expirado', () => {
  const token = createMfaToken('marcelo', SECRET, -1);
  assert.strictEqual(verifyMfaToken(token, SECRET), null);
});

test('mfa: rejeita token de outro tipo (k != mfa)', () => {
  // Um token de enrollment (k=enroll) não pode ser aceito como desafio de MFA.
  const payload = { u: 'marcelo', s: 'ABCDEF234567', exp: Math.floor(Date.now() / 1000) + 600, k: 'enroll' };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  assert.strictEqual(verifyMfaToken(`${body}.${sig}`, SECRET), null);
});

test('mfa: rejeita formato inválido', () => {
  assert.strictEqual(verifyMfaToken('', SECRET), null);
  assert.strictEqual(verifyMfaToken('semponto', SECRET), null);
});
