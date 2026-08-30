'use strict';

const { SSMClient, GetParametersByPathCommand, PutParameterCommand } = require('@aws-sdk/client-ssm');

const ssm = new SSMClient({ region: 'us-east-1' });
const PREFIX = process.env.SSM_PREFIX || '/mbf/prod/cost-dashboard';

// Cache simples em memória (a Lambda reaproveita entre invocações "quentes")
let cache = null;
let cacheAt = 0;
const TTL_MS = 60 * 1000;

/**
 * Carrega credenciais do SSM sob o prefixo configurado.
 * Espera: <prefix>/username, <prefix>/password-hash, <prefix>/session-secret
 * Opcional: <prefix>/totp-secret (Base32) — se presente, o MFA TOTP é exigido no login.
 * @returns {Promise<{username: string, passwordHash: string, sessionSecret: string, totpSecret: string}>}
 */
async function loadCredentials() {
  const now = Date.now();
  if (cache && now - cacheAt < TTL_MS) return cache;

  const res = await ssm.send(
    new GetParametersByPathCommand({
      Path: PREFIX,
      Recursive: true,
      WithDecryption: true,
    })
  );

  const map = {};
  for (const p of res.Parameters || []) {
    const key = p.Name.split('/').pop();
    map[key] = p.Value;
  }

  cache = {
    username: map['username'] || '',
    passwordHash: map['password-hash'] || '',
    sessionSecret: map['session-secret'] || '',
    totpSecret: map['totp-secret'] || '',
    accessToken: map['access-token'] || '',
  };
  cacheAt = now;
  return cache;
}

module.exports = { loadCredentials, saveTotpSecret, PREFIX };

/**
 * Grava o secret TOTP no SSM como SecureString e invalida o cache local.
 * Usado no enrollment de MFA (primeiro login).
 * @param {string} totpSecret secret em Base32
 * @returns {Promise<void>}
 */
async function saveTotpSecret(totpSecret) {
  await ssm.send(
    new PutParameterCommand({
      Name: `${PREFIX}/totp-secret`,
      Value: totpSecret,
      Type: 'SecureString',
      Overwrite: true,
    })
  );
  // Invalida o cache para que o próximo carregamento já veja o MFA habilitado.
  cache = null;
  cacheAt = 0;
}
