'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { isAwsEmail, extractAddress } = require('../src/awsSenderFilter');

test('extractAddress: extrai endereço de "Nome <email>"', () => {
  assert.strictEqual(extractAddress('AWS <no-reply@aws.amazon.com>'), 'no-reply@aws.amazon.com');
  assert.strictEqual(extractAddress('billing@amazonaws.com'), 'billing@amazonaws.com');
  assert.strictEqual(extractAddress(''), '');
});

test('isAwsEmail: aceita remetentes AWS conhecidos', () => {
  assert.ok(isAwsEmail({ from: 'AWS <no-reply@aws.amazon.com>', subject: 'x' }));
  assert.ok(isAwsEmail({ from: 'no-reply@sns.amazonaws.com', subject: 'Alarme' }));
  assert.ok(isAwsEmail({ from: 'aws-marketing@amazon.com', subject: 'Novidades' }));
  assert.ok(isAwsEmail({ from: 'alerts@costalerts.amazonaws.com', subject: 'Budget' }));
});

test('isAwsEmail: rejeita remetentes não-AWS', () => {
  assert.strictEqual(isAwsEmail({ from: 'contato@fornecedor.com.br', subject: 'Boleto' }), false);
  assert.strictEqual(isAwsEmail({ from: 'newsletter@gmail.com', subject: 'Promoção' }), false);
  assert.strictEqual(isAwsEmail({ from: '', subject: '' }), false);
});

test('isAwsEmail: fallback por assunto quando domínio contém amazon/aws', () => {
  // domínio contém "amazon" e assunto sugere AWS → aceita
  assert.ok(isAwsEmail({ from: 'noreply@marketing.amazon.com', subject: 'Your AWS bill is ready' }));
  // domínio não contém amazon/aws → não entra pelo fallback mesmo com assunto AWS
  assert.strictEqual(isAwsEmail({ from: 'x@outro.com', subject: 'AWS EC2 news' }), false);
});

test('isAwsEmail: remetentes personalizados (objeto) casam por substring', () => {
  const opts = { senders: ['@bloise.com.br', 'faturas@fornecedor.com'], keywords: [] };
  assert.ok(isAwsEmail({ from: 'Marcelo <marcelo@bloise.com.br>', subject: 'x' }, opts));
  assert.ok(isAwsEmail({ from: 'faturas@fornecedor.com', subject: 'Boleto' }, opts));
  // remetente AWS NÃO entra quando há lista custom que não o inclui e assunto não casa
  assert.strictEqual(isAwsEmail({ from: 'no-reply@aws.amazon.com', subject: 'x' }, opts), false);
});

test('isAwsEmail: palavra-chave no assunto casa (regra OU)', () => {
  const opts = { senders: ['@amazonaws.com'], keywords: ['fatura', 'security'] };
  // casa por assunto mesmo com remetente qualquer
  assert.ok(isAwsEmail({ from: 'qualquer@x.com', subject: 'Sua FATURA chegou' }, opts));
  assert.ok(isAwsEmail({ from: 'z@y.com', subject: 'Security alert' }, opts));
  // casa por remetente mesmo sem keyword no assunto
  assert.ok(isAwsEmail({ from: 'billing@amazonaws.com', subject: 'algo' }, opts));
  // não casa nem remetente nem assunto
  assert.strictEqual(isAwsEmail({ from: 'z@y.com', subject: 'nada aqui' }, opts), false);
});

test('isAwsEmail: retrocompat com array = senders', () => {
  assert.ok(isAwsEmail({ from: 'marcelo@bloise.com.br', subject: 'x' }, ['@bloise.com.br']));
});

test('isAwsEmail: sem custom (objeto vazio) cai no padrão AWS', () => {
  assert.ok(isAwsEmail({ from: 'no-reply@aws.amazon.com', subject: 'x' }, { senders: [], keywords: [] }));
  assert.strictEqual(isAwsEmail({ from: 'x@outro.com', subject: 'y' }, { senders: [], keywords: [] }), false);
});
