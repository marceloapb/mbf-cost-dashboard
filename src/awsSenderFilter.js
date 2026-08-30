'use strict';

/**
 * Heurística pura para decidir se um e-mail é "da AWS" (alertas, billing, health,
 * security, deprecações, marketing técnico, etc.), sem depender de IMAP.
 */

// Domínios/remetentes típicos da AWS/Amazon.
const AWS_SENDER_PATTERNS = [
  /@amazonaws\.com$/i,
  /@aws\.amazon\.com$/i,
  /@amazon\.com$/i,
  /aws-marketing@/i,
  /no-reply@sns\.amazonaws\.com$/i,
  /@costalerts\.amazonaws\.com$/i,
  /@email\.aws\.amazon\.com$/i,
];

// Palavras-chave de assunto que reforçam a origem AWS (fallback quando o From não bate).
const AWS_SUBJECT_HINTS = [
  /\baws\b/i,
  /amazon web services/i,
  /\bec2\b/i,
  /\bs3\b/i,
  /\brds\b/i,
  /\blambda\b/i,
  /cost (and|&) usage|billing|budget/i,
  /health dashboard|service health/i,
  /security|abuse|deprecat/i,
];

/**
 * Extrai o endereço de e-mail cru de um campo "From" (ex.: 'AWS <no-reply@aws.amazon.com>').
 * @param {string} from
 * @returns {string} endereço em minúsculas, ou string vazia
 */
function extractAddress(from) {
  if (!from) return '';
  const m = /<([^>]+)>/.exec(from);
  const addr = (m ? m[1] : from).trim().toLowerCase();
  return addr;
}

/**
 * Decide se um e-mail deve ser processado.
 * Se `customSenders` for uma lista não vazia, usa EXCLUSIVAMENTE ela (substitui o padrão AWS):
 * o e-mail é aceito se o endereço do remetente contiver qualquer um dos termos informados
 * (ex.: "@amazonaws.com", "aws-marketing@amazon.com", "billing@").
 * Se `customSenders` for vazio/ausente, aplica a heurística padrão de remetentes AWS.
 * @param {{from?: string, subject?: string}} email
 * @param {string[]} [customSenders] lista de remetentes/domínios (minúsculas) a monitorar
 * @returns {boolean}
 */
function isAwsEmail(email, customSenders) {
  const addr = extractAddress(email && email.from);

  // Modo personalizado: substitui a lista padrão.
  if (Array.isArray(customSenders) && customSenders.length) {
    if (!addr) return false;
    return customSenders.some((term) => term && addr.includes(String(term).toLowerCase()));
  }

  // Modo padrão (AWS).
  if (addr && AWS_SENDER_PATTERNS.some((re) => re.test(addr))) return true;
  // Fallback: remetente não bateu, mas o assunto sugere fortemente AWS
  // E o domínio contém "amazon" ou "aws".
  const subject = (email && email.subject) || '';
  if (/amazon|aws/i.test(addr) && AWS_SUBJECT_HINTS.some((re) => re.test(subject))) {
    return true;
  }
  return false;
}

module.exports = { isAwsEmail, extractAddress, AWS_SENDER_PATTERNS, AWS_SUBJECT_HINTS };
