'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { hashPassword, validatePasswordChange } = require('../src/auth');

const stored = hashPassword('SenhaAtual123');

test('validatePasswordChange: sucesso com dados válidos', () => {
  const r = validatePasswordChange({
    current: 'SenhaAtual123',
    novaSenha: 'NovaSenha456',
    confirmar: 'NovaSenha456',
    storedHash: stored,
  });
  assert.deepStrictEqual(r, { ok: true });
});

test('validatePasswordChange: rejeita senha atual incorreta', () => {
  const r = validatePasswordChange({
    current: 'errada',
    novaSenha: 'NovaSenha456',
    confirmar: 'NovaSenha456',
    storedHash: stored,
  });
  assert.strictEqual(r.ok, false);
  assert.match(r.error, /atual/i);
});

test('validatePasswordChange: rejeita nova senha curta (<8)', () => {
  const r = validatePasswordChange({
    current: 'SenhaAtual123',
    novaSenha: 'curta',
    confirmar: 'curta',
    storedHash: stored,
  });
  assert.strictEqual(r.ok, false);
  assert.match(r.error, /8/);
});

test('validatePasswordChange: rejeita confirmação diferente', () => {
  const r = validatePasswordChange({
    current: 'SenhaAtual123',
    novaSenha: 'NovaSenha456',
    confirmar: 'OutraCoisa789',
    storedHash: stored,
  });
  assert.strictEqual(r.ok, false);
  assert.match(r.error, /confirma/i);
});

test('validatePasswordChange: rejeita nova igual à atual', () => {
  const r = validatePasswordChange({
    current: 'SenhaAtual123',
    novaSenha: 'SenhaAtual123',
    confirmar: 'SenhaAtual123',
    storedHash: stored,
  });
  assert.strictEqual(r.ok, false);
  assert.match(r.error, /diferente/i);
});

test('validatePasswordChange: rejeita campos vazios', () => {
  const r = validatePasswordChange({ current: '', novaSenha: '', confirmar: '', storedHash: stored });
  assert.strictEqual(r.ok, false);
});
