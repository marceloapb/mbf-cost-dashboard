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
  let cfg = normalize({});
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
 * Normaliza a config, garantindo tipos e campos. (importado de configNormalize)
 */
const { normalize, redactConfig, MODEL_OPTIONS } = require('./configNormalize');

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

module.exports = { loadImapConfig, saveImapConfig, redactConfig, normalize, MODEL_OPTIONS, IMAP_PARAM };
