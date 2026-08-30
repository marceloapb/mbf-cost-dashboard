'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { parseAnalysis, extractModelText, buildPrompt } = require('../src/aiParse');

test('parseAnalysis: JSON limpo', () => {
  const out = parseAnalysis('{"assuntoPt":"Fatura","resumo":"Sua fatura fechou.","acoes":["Pagar"],"urgencia":"media","prazo":"10/09"}');
  assert.strictEqual(out.assuntoPt, 'Fatura');
  assert.strictEqual(out.resumo, 'Sua fatura fechou.');
  assert.deepStrictEqual(out.acoes, ['Pagar']);
  assert.strictEqual(out.urgencia, 'media');
  assert.strictEqual(out.prazo, '10/09');
});

test('parseAnalysis: JSON cercado por markdown ```json', () => {
  const txt = 'Claro!\n```json\n{"assuntoPt":"X","resumo":"Y","acoes":[],"urgencia":"alta","prazo":""}\n```';
  const out = parseAnalysis(txt);
  assert.strictEqual(out.assuntoPt, 'X');
  assert.strictEqual(out.urgencia, 'alta');
  assert.deepStrictEqual(out.acoes, []);
});

test('parseAnalysis: JSON com texto ao redor (sem cerca)', () => {
  const txt = 'Segue a análise: {"assuntoPt":"Z","resumo":"W","urgencia":"baixa"} fim.';
  const out = parseAnalysis(txt);
  assert.strictEqual(out.assuntoPt, 'Z');
  assert.strictEqual(out.urgencia, 'baixa');
});

test('parseAnalysis: urgência inválida vira informativo', () => {
  const out = parseAnalysis('{"urgencia":"urgentíssimo"}');
  assert.strictEqual(out.urgencia, 'informativo');
});

test('parseAnalysis: texto não-JSON vira fallback com resumo', () => {
  const out = parseAnalysis('desculpe, não consegui');
  assert.strictEqual(out.urgencia, 'informativo');
  assert.ok(out.resumo.length > 0);
  assert.deepStrictEqual(out.acoes, []);
});

test('parseAnalysis: vazio retorna fallback', () => {
  assert.deepStrictEqual(parseAnalysis(''), { assuntoPt: '', resumo: '', acoes: [], urgencia: 'informativo', prazo: '' });
});

test('parseAnalysis: acoes não-array vira []', () => {
  const out = parseAnalysis('{"acoes":"nao e array","urgencia":"alta"}');
  assert.deepStrictEqual(out.acoes, []);
});

test('extractModelText: formato Anthropic content[]', () => {
  assert.strictEqual(extractModelText({ content: [{ type: 'text', text: 'ola ' }, { type: 'text', text: 'mundo' }] }), 'ola mundo');
  assert.strictEqual(extractModelText({ completion: '  legado  ' }), 'legado');
  assert.strictEqual(extractModelText(null), '');
});

test('extractModelText: formato Amazon Nova output.message.content[]', () => {
  const nova = { output: { message: { role: 'assistant', content: [{ text: 'resposta ' }, { text: 'nova' }] } } };
  assert.strictEqual(extractModelText(nova), 'resposta nova');
});

test('buildPrompt: inclui assunto, remetente e pede JSON', () => {
  const p = buildPrompt({ subject: 'Assunto X', from: 'aws@amazon.com', text: 'corpo' });
  assert.ok(p.includes('Assunto X'));
  assert.ok(p.includes('aws@amazon.com'));
  assert.ok(p.includes('JSON'));
});
