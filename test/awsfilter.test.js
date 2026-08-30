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
