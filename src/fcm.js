'use strict';

const crypto = require('crypto');
const https = require('https');
const { SSMClient, GetParameterCommand } = require('@aws-sdk/client-ssm');

const ssm = new SSMClient({ region: 'us-east-1' });
const PREFIX = process.env.SSM_PREFIX || '/mbf/prod/cost-dashboard';
const SA_PARAM = `${PREFIX}/fcm-service-account`; // SecureString: JSON da service account

let saCache = null;
let tokenCache = { token: null, exp: 0 };

/** Carrega a service account (JSON) do SSM. Lança se ausente. */
async function loadServiceAccount() {
  if (saCache) return saCache;
  const res = await ssm.send(new GetParameterCommand({ Name: SA_PARAM, WithDecryption: true }));
  saCache = JSON.parse(res.Parameter.Value);
  return saCache;
}

function base64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Gera (e cacheia) um access token OAuth2 para o escopo do FCM via JWT assinado. */
async function getAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  if (tokenCache.token && tokenCache.exp - 60 > now) return tokenCache.token;
  const sa = await loadServiceAccount();
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = base64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    })
  );
  const signingInput = `${header}.${claim}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(signingInput);
  const signature = base64url(signer.sign(sa.private_key));
  const jwt = `${signingInput}.${signature}`;

  const body = `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${jwt}`;
  const resp = await httpsRequest(
    'https://oauth2.googleapis.com/token',
    { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
    body
  );
  const json = JSON.parse(resp.body);
  if (!json.access_token) throw new Error('Falha ao obter access token FCM: ' + resp.body.slice(0, 200));
  tokenCache = { token: json.access_token, exp: now + (json.expires_in || 3600) };
  return tokenCache.token;
}

/** Helper HTTPS que retorna {status, body}. */
function httpsRequest(url, options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, options, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

/**
 * Envia uma notificação para todos os tokens informados via FCM HTTP v1.
 * @param {string[]} tokens
 * @param {{title:string, body:string, data?:object}} msg
 * @returns {Promise<{sent:number, invalid:string[], errors:number}>}
 */
async function sendToTokens(tokens, msg) {
  if (!tokens || !tokens.length) return { sent: 0, invalid: [], errors: 0 };
  const sa = await loadServiceAccount();
  const accessToken = await getAccessToken();
  const url = `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`;
  let sent = 0;
  let errors = 0;
  const invalid = [];

  for (const token of tokens) {
    const payload = JSON.stringify({
      message: {
        token,
        notification: { title: msg.title, body: msg.body },
        data: msg.data || {},
        android: { priority: 'high', notification: { channel_id: 'mbf_emails' } },
      },
    });
    try {
      const resp = await httpsRequest(
        url,
        { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` } },
        payload
      );
      if (resp.status >= 200 && resp.status < 300) {
        sent += 1;
      } else if (resp.status === 404 || resp.status === 400) {
        // token não registrado/ inválido → marcar para remoção
        invalid.push(token);
      } else {
        errors += 1;
        console.warn('FCM send erro', resp.status, resp.body.slice(0, 200));
      }
    } catch (err) {
      errors += 1;
      console.warn('FCM send exceção:', err.message);
    }
  }
  return { sent, invalid, errors };
}

/** Indica se o FCM está configurado (service account presente). */
async function isConfigured() {
  try {
    await loadServiceAccount();
    return true;
  } catch {
    return false;
  }
}

module.exports = { sendToTokens, isConfigured, getAccessToken, SA_PARAM };
