'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const totp = require('../src/totp');

// Vetor conhecido: secret ASCII "12345678901234567890" em Base32 = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"
// RFC 6238 (SHA1), tempo T=59s → contador=1 → código de 8 dígitos 94287082;
// para 6 dígitos, os 6 finais = 287082.
const RFC_SECRET_B32 = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

test('base32 round-trip preserva os bytes', () => {
  const buf = Buffer.from('12345678901234567890');
  const enc = totp.base32Encode(buf);
  assert.strictEqual(enc, RFC_SECRET_B32);
  assert.deepStrictEqual(totp.base32Decode(enc), buf);
});

test('TOTP bate com o vetor conhecido do RFC 6238 (T=59s)', () => {
  const code = totp.generate(RFC_SECRET_B32, 59 * 1000);
  assert.strictEqual(code, '287082');
});

test('generate produz sempre 6 dígitos', () => {
  const s = totp.generateSecret();
  const code = totp.generate(s);
  assert.match(code, /^\d{6}$/);
});

test('verify aceita o código gerado no mesmo instante', () => {
  const s = totp.generateSecret();
  const now = Date.now();
  const code = totp.generate(s, now);
  assert.strictEqual(totp.verify(code, s, { forTime: now }), true);
});

test('verify aceita código do período anterior (janela ±1)', () => {
  const s = totp.generateSecret();
  const now = Date.now();
  const prevCode = totp.generate(s, now - 30 * 1000);
  assert.strictEqual(totp.verify(prevCode, s, { forTime: now }), true);
});

test('verify rejeita código fora da janela', () => {
  const s = totp.generateSecret();
  const now = Date.now();
  const oldCode = totp.generate(s, now - 5 * 60 * 1000);
  assert.strictEqual(totp.verify(oldCode, s, { forTime: now }), false);
});

test('verify rejeita formato inválido e vazio', () => {
  const s = totp.generateSecret();
  assert.strictEqual(totp.verify('', s), false);
  assert.strictEqual(totp.verify('12345', s), false);
  assert.strictEqual(totp.verify('abcdef', s), false);
  assert.strictEqual(totp.verify('123456', ''), false);
});

test('verify tolera espaços no código digitado', () => {
  const s = totp.generateSecret();
  const now = Date.now();
  const code = totp.generate(s, now);
  const spaced = `${code.slice(0, 3)} ${code.slice(3)}`;
  assert.strictEqual(totp.verify(spaced, s, { forTime: now }), true);
});

test('otpauthURL contém issuer, secret e parâmetros esperados', () => {
  const s = totp.generateSecret();
  const url = totp.otpauthURL(s, { issuer: 'MBF Cost Dashboard', account: 'marcelo' });
  assert.ok(url.startsWith('otpauth://totp/'));
  assert.ok(url.includes(`secret=${s}`));
  assert.ok(url.includes('digits=6'));
  assert.ok(url.includes('period=30'));
  assert.ok(url.includes('algorithm=SHA1'));
});
