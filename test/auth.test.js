'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const {
  hashPassword,
  verifyPassword,
  createSession,
  verifySession,
  readCookie,
} = require('../src/auth');

test('hashPassword: gera formato salt:hash e é verificável', () => {
  const stored = hashPassword('minhaSenha123');
  assert.ok(stored.includes(':'));
  assert.strictEqual(verifyPassword('minhaSenha123', stored), true);
});

test('verifyPassword: rejeita senha errada', () => {
  const stored = hashPassword('correta');
  assert.strictEqual(verifyPassword('errada', stored), false);
});

test('verifyPassword: rejeita hash malformado', () => {
  assert.strictEqual(verifyPassword('x', 'semdoispontos'), false);
});

test('createSession/verifySession: round-trip válido', () => {
  const secret = 'segredo-super-secreto';
  const token = createSession('marcelo', secret);
  assert.strictEqual(verifySession(token, secret), 'marcelo');
});

test('verifySession: rejeita assinatura com segredo errado', () => {
  const token = createSession('marcelo', 'segredo-a');
  assert.strictEqual(verifySession(token, 'segredo-b'), null);
});

test('verifySession: rejeita token adulterado', () => {
  const token = createSession('marcelo', 'seg');
  const tampered = token.slice(0, -2) + 'xy';
  assert.strictEqual(verifySession(tampered, 'seg'), null);
});

test('verifySession: rejeita sessão expirada', () => {
  const crypto = require('crypto');
  const secret = 'seg';
  const payload = { u: 'marcelo', exp: Math.floor(Date.now() / 1000) - 10 };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  assert.strictEqual(verifySession(`${body}.${sig}`, secret), null);
});

test('readCookie: extrai o cookie correto', () => {
  const header = 'foo=1; mbf_session=abc.def; bar=2';
  assert.strictEqual(readCookie(header, 'mbf_session'), 'abc.def');
  assert.strictEqual(readCookie(header, 'inexistente'), undefined);
});
