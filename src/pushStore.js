'use strict';

const {
  SSMClient,
  GetParameterCommand,
  PutParameterCommand,
} = require('@aws-sdk/client-ssm');

const ssm = new SSMClient({ region: 'us-east-1' });
const PREFIX = process.env.SSM_PREFIX || '/mbf/prod/cost-dashboard';
const TOKENS_PARAM = `${PREFIX}/push-tokens`; // JSON array de tokens FCM

let cache = null;
let cacheAt = 0;
const TTL_MS = 30 * 1000;

/**
 * Carrega os tokens FCM registrados (dedupe). Falha suave => [].
 * @returns {Promise<string[]>}
 */
async function listTokens() {
  const now = Date.now();
  if (cache && now - cacheAt < TTL_MS) return cache;
  let tokens = [];
  try {
    const res = await ssm.send(new GetParameterCommand({ Name: TOKENS_PARAM }));
    const parsed = JSON.parse(res.Parameter?.Value || '[]');
    if (Array.isArray(parsed)) tokens = parsed.filter((t) => typeof t === 'string' && t);
  } catch (err) {
    if (err.name !== 'ParameterNotFound') console.warn('Erro ao ler push-tokens:', err.message);
  }
  cache = tokens;
  cacheAt = now;
  return tokens;
}

async function saveTokens(tokens) {
  const unique = Array.from(new Set(tokens.filter(Boolean))).slice(0, 100);
  await ssm.send(
    new PutParameterCommand({
      Name: TOKENS_PARAM,
      Value: JSON.stringify(unique),
      Type: 'String',
      Overwrite: true,
    })
  );
  cache = null;
  cacheAt = 0;
}

/**
 * Registra um token de dispositivo (idempotente).
 * @param {string} token
 * @returns {Promise<boolean>} true se novo
 */
async function registerToken(token) {
  if (!token || typeof token !== 'string') throw new Error('token inválido');
  const tokens = await listTokens();
  if (tokens.includes(token)) return false;
  await saveTokens([...tokens, token]);
  return true;
}

/**
 * Remove tokens (ex.: inválidos/expirados retornados pelo FCM).
 * @param {string[]} bad
 */
async function removeTokens(bad) {
  if (!bad || !bad.length) return;
  const tokens = await listTokens();
  const set = new Set(bad);
  await saveTokens(tokens.filter((t) => !set.has(t)));
}

module.exports = { listTokens, registerToken, removeTokens, TOKENS_PARAM };
