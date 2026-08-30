'use strict';

/**
 * Lógica pura de montagem de prompt e parsing da resposta do modelo (sem AWS SDK),
 * para ser testável isoladamente.
 */

const URGENCIAS = ['alta', 'media', 'baixa', 'informativo'];

/**
 * Monta o prompt para o modelo. Pede SEMPRE um JSON estrito.
 * @param {{subject:string, from:string, text:string}} email
 * @returns {string}
 */
function buildPrompt(email) {
  return [
    'Você é um assistente que analisa e-mails automáticos da AWS (Amazon Web Services).',
    'Traduza para português do Brasil e resuma de forma objetiva, focando no que o destinatário precisa FAZER.',
    'Responda EXCLUSIVAMENTE com um objeto JSON válido, sem texto fora do JSON, com as chaves:',
    '{',
    '  "assuntoPt": "assunto traduzido em pt-BR",',
    '  "resumo": "resumo curto em pt-BR (2-4 frases)",',
    '  "acoes": ["lista de ações concretas a fazer; vazio se nenhuma"],',
    '  "urgencia": "alta|media|baixa|informativo",',
    '  "prazo": "prazo/data se houver, senão string vazia"',
    '}',
    '',
    `De: ${email.from || ''}`,
    `Assunto: ${email.subject || ''}`,
    '',
    'Corpo do e-mail:',
    (email.text || '').slice(0, 12000),
  ].join('\n');
}

/**
 * Extrai o texto de resposta do payload do modelo.
 * Suporta: Amazon Nova (output.message.content[].text), Anthropic Messages (content[].text)
 * e formato legado (completion).
 * @param {object} body corpo já parseado da resposta do Bedrock
 * @returns {string}
 */
function extractModelText(body) {
  if (!body) return '';
  // Amazon Nova
  const novaContent = body.output && body.output.message && body.output.message.content;
  if (Array.isArray(novaContent)) {
    return novaContent.map((c) => (c && c.text) || '').join('').trim();
  }
  // Anthropic (Claude) Messages
  if (Array.isArray(body.content)) {
    return body.content.map((c) => (c && c.text) || '').join('').trim();
  }
  if (typeof body.completion === 'string') return body.completion.trim();
  return '';
}

/**
 * Faz o parse robusto da resposta do modelo em um objeto de análise normalizado.
 * Aceita JSON possivelmente cercado por texto/markdown. Nunca lança.
 * @param {string} modelText
 * @returns {{assuntoPt:string, resumo:string, acoes:string[], urgencia:string, prazo:string}}
 */
function parseAnalysis(modelText) {
  const fallback = { assuntoPt: '', resumo: '', acoes: [], urgencia: 'informativo', prazo: '' };
  if (!modelText) return fallback;
  let jsonStr = String(modelText).trim();
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(jsonStr);
  if (fence) jsonStr = fence[1].trim();
  if (jsonStr[0] !== '{') {
    const first = jsonStr.indexOf('{');
    const last = jsonStr.lastIndexOf('}');
    if (first !== -1 && last !== -1 && last > first) {
      jsonStr = jsonStr.slice(first, last + 1);
    }
  }
  let obj;
  try {
    obj = JSON.parse(jsonStr);
  } catch {
    return { ...fallback, resumo: String(modelText).slice(0, 500) };
  }
  const urg = String(obj.urgencia || '').toLowerCase();
  return {
    assuntoPt: String(obj.assuntoPt || '').slice(0, 300),
    resumo: String(obj.resumo || '').slice(0, 2000),
    acoes: Array.isArray(obj.acoes)
      ? obj.acoes.map((a) => String(a).slice(0, 500)).filter(Boolean).slice(0, 20)
      : [],
    urgencia: URGENCIAS.includes(urg) ? urg : 'informativo',
    prazo: String(obj.prazo || '').slice(0, 120),
  };
}

module.exports = { buildPrompt, extractModelText, parseAnalysis, URGENCIAS };
