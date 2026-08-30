'use strict';

/**
 * Normalização pura da configuração da aplicação (sem AWS SDK), testável isoladamente.
 */

const ALLOWED_MODELS = [
  'amazon.nova-lite-v1:0',
  'amazon.nova-pro-v1:0',
  'amazon.nova-micro-v1:0',
];

const MODEL_OPTIONS = [
  { id: 'amazon.nova-micro-v1:0', label: 'Amazon Nova Micro — menor custo (rápido)' },
  { id: 'amazon.nova-lite-v1:0', label: 'Amazon Nova Lite — custo médio (recomendado)' },
  { id: 'amazon.nova-pro-v1:0', label: 'Amazon Nova Pro — maior custo (mais capaz)' },
];

function clampInt(v, def, min, max) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, n));
}

/**
 * Normaliza a config, garantindo tipos, defaults e limites.
 * @param {object} raw
 */
function normalize(raw) {
  raw = raw || {};
  const host = typeof raw.host === 'string' ? raw.host.trim() : '';
  const port = Number(raw.port) || 993;
  const mailboxes = Array.isArray(raw.mailboxes)
    ? raw.mailboxes
        .filter((m) => m && typeof m.user === 'string' && m.user.includes('@'))
        .map((m) => ({ user: m.user.trim(), password: String(m.password || '') }))
    : [];

  // Remetentes/domínios personalizados. Vazio => padrão AWS. Aceita array ou string.
  let senders = [];
  const rawSenders = raw.senders;
  if (Array.isArray(rawSenders)) {
    senders = rawSenders;
  } else if (typeof rawSenders === 'string') {
    senders = rawSenders.split(/[\n,;]+/);
  }
  senders = Array.from(
    new Set(senders.map((s) => String(s).trim().toLowerCase()).filter(Boolean))
  ).slice(0, 50);

  // Palavras-chave no assunto. Vazio => não usa. Aceita array ou string.
  let keywords = [];
  const rawKw = raw.subjectKeywords;
  if (Array.isArray(rawKw)) {
    keywords = rawKw;
  } else if (typeof rawKw === 'string') {
    keywords = rawKw.split(/[\n,;]+/);
  }
  const subjectKeywords = Array.from(
    new Set(keywords.map((s) => String(s).trim().toLowerCase()).filter(Boolean))
  ).slice(0, 50);

  const scanLimit = clampInt(raw.scanLimit, 100, 1, 1000);
  const scanWindowDays = clampInt(raw.scanWindowDays, 0, 0, 3650);
  const scanIntervalHours = clampInt(raw.scanIntervalHours, 1, 1, 24);
  const DEFAULT_MODEL = process.env.BEDROCK_MODEL_ID || ALLOWED_MODELS[0];
  const bedrockModelId = ALLOWED_MODELS.includes(raw.bedrockModelId)
    ? raw.bedrockModelId
    : DEFAULT_MODEL;

  return { host, port, mailboxes, senders, subjectKeywords, scanLimit, scanWindowDays, scanIntervalHours, bedrockModelId };
}

/**
 * Versão "segura para exibição": remove as senhas.
 * @param {object} cfg
 */
function redactConfig(cfg) {
  return {
    host: cfg.host,
    port: cfg.port,
    mailboxes: (cfg.mailboxes || []).map((m) => ({ user: m.user, hasPassword: Boolean(m.password) })),
    senders: cfg.senders || [],
    subjectKeywords: cfg.subjectKeywords || [],
    scanLimit: cfg.scanLimit,
    scanWindowDays: cfg.scanWindowDays,
    scanIntervalHours: cfg.scanIntervalHours,
    bedrockModelId: cfg.bedrockModelId,
  };
}

module.exports = { normalize, redactConfig, MODEL_OPTIONS, ALLOWED_MODELS };
