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
 * Decide se um e-mail deve ser coletado.
 *
 * Regra:
 * - Se houver `senders` e/ou `keywords` configurados, o e-mail é aceito quando
 *   o REMETENTE casa com algum `senders` (substring) OU o ASSUNTO contém alguma `keywords`.
 * - Se AMBOS estiverem vazios, aplica a detecção padrão de e-mails da AWS.
 *
 * @param {{from?: string, subject?: string}} email
 * @param {{senders?: string[], keywords?: string[]}|string[]} [opts]
 *        aceita objeto {senders,keywords} ou (retrocompat) um array = senders
 * @returns {boolean}
 */
function isAwsEmail(email, opts) {
  const addr = extractAddress(email && email.from);
  const subject = ((email && email.subject) || '').toLowerCase();

  // Retrocompatibilidade: se vier um array, trata como lista de senders.
  let senders = [];
  let keywords = [];
  if (Array.isArray(opts)) {
    senders = opts;
  } else if (opts && typeof opts === 'object') {
    senders = Array.isArray(opts.senders) ? opts.senders : [];
    keywords = Array.isArray(opts.keywords) ? opts.keywords : [];
  }

  const hasCustom = senders.length > 0 || keywords.length > 0;

  if (hasCustom) {
    const senderMatch =
      addr && senders.some((t) => t && addr.includes(String(t).toLowerCase()));
    const subjectMatch =
      subject && keywords.some((k) => k && subject.includes(String(k).toLowerCase()));
    return Boolean(senderMatch || subjectMatch);
  }

  // Modo padrão (AWS).
  if (addr && AWS_SENDER_PATTERNS.some((re) => re.test(addr))) return true;
  const subjRaw = (email && email.subject) || '';
  if (/amazon|aws/i.test(addr) && AWS_SUBJECT_HINTS.some((re) => re.test(subjRaw))) {
    return true;
  }
  return false;
}

module.exports = { isAwsEmail, extractAddress, AWS_SENDER_PATTERNS, AWS_SUBJECT_HINTS };
