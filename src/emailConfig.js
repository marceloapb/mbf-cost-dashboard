'use strict';

const {
  SSMClient,
  GetParameterCommand,
  PutParameterCommand,
} = require('@aws-sdk/client-ssm');

const ssm = new SSMClient({ region: 'us-east-1' });
const PREFIX = process.env.SSM_PREFIX || '/mbf/prod/cost-dashboard';
const IMAP_PARAM = `${PREFIX}/imap-config`; // SecureString com JSON das caixas

let cache = null;
let cacheAt = 0;
const TTL_MS = 30 * 1000;

/**
 * Estrutura salva (JSON) no SSM:
 * {
 *   "host": "imap.hostinger.com",
 *   "port": 993,
 *   "mailboxes": [
 *     { "user": "marcelo@bloise.com.br", "password": "..." },
 *     { "user": "contato@bloise.com.br", "password": "..." }
 *   ]
 * }
 */

/**
 * Carrega a config IMAP do SSM. Retorna objeto normalizado (nunca lança por ausência).
 * @returns {Promise<{host: string, port: number, mailboxes: Array<{user:string,password:string}>}>}
 */
async function loadImapConfig() {
  const now = Date.now();
  if (cache && now - cacheAt < TTL_MS) return cache;
  let cfg = { host: '', port: 993, mailboxes: [], senders: [] };
  try {
    const res = await ssm.send(
      new GetParameterCommand({ Name: IMAP_PARAM, WithDecryption: true })
    );
    const parsed = JSON.parse(res.Parameter?.Value || '{}');
    cfg = normalize(parsed);
  } catch (err) {
    if (err.name !== 'ParameterNotFound') {
      console.warn('Erro ao carregar imap-config:', err.message);
    }
  }
  cache = cfg;
  cacheAt = now;
  return cfg;
}

/**
 * Normaliza a config, garantindo tipos e campos.
 * @param {object} raw
 */
function normalize(raw) {
  const host = typeof raw.host === 'string' ? raw.host.trim() : '';
  const port = Number(raw.port) || 993;
  const mailboxes = Array.isArray(raw.mailboxes)
    ? raw.mailboxes
        .filter((m) => m && typeof m.user === 'string' && m.user.includes('@'))
        .map((m) => ({ user: m.user.trim(), password: String(m.password || '') }))
    : [];
  // Remetentes/domínios personalizados a monitorar. Vazio => usa o padrão AWS.
  // Aceita array ou string (linhas/vírgulas). Guarda em minúsculas, sem duplicatas.
  let senders = [];
  const rawSenders = raw.senders;
  if (Array.isArray(rawSenders)) {
    senders = rawSenders;
  } else if (typeof rawSenders === 'string') {
    senders = rawSenders.split(/[\n,;]+/);
  }
  senders = Array.from(
    new Set(
      senders
        .map((s) => String(s).trim().toLowerCase())
        .filter(Boolean)
    )
  ).slice(0, 50);
  return { host, port, mailboxes, senders };
}

/**
 * Grava a config IMAP no SSM como SecureString e invalida o cache.
 * Preserva a senha existente de uma caixa quando a nova senha vier vazia
 * (permite reeditar host/porta sem redigitar as senhas).
 * @param {object} incoming { host, port, mailboxes:[{user,password}] }
 * @returns {Promise<void>}
 */
async function saveImapConfig(incoming) {
  const current = await loadImapConfig();
  const next = normalize(incoming);
  // Mantém senhas anteriores quando o campo veio vazio (mascarado na tela).
  next.mailboxes = next.mailboxes.map((mb) => {
    if (mb.password) return mb;
    const prev = current.mailboxes.find((p) => p.user === mb.user);
    return { user: mb.user, password: prev ? prev.password : '' };
  });
  await ssm.send(
    new PutParameterCommand({
      Name: IMAP_PARAM,
      Value: JSON.stringify(next),
      Type: 'SecureString',
      Overwrite: true,
    })
  );
  cache = null;
  cacheAt = 0;
}

/**
 * Versão "segura para exibição": remove as senhas, indicando apenas se há senha configurada.
 * @param {object} cfg
 */
function redactConfig(cfg) {
  return {
    host: cfg.host,
    port: cfg.port,
    mailboxes: cfg.mailboxes.map((m) => ({ user: m.user, hasPassword: Boolean(m.password) })),
    senders: cfg.senders || [],
  };
}

module.exports = { loadImapConfig, saveImapConfig, redactConfig, normalize, IMAP_PARAM };
