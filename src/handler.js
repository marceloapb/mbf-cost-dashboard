'use strict';

const { monthRange, getCostByAccount, getAccountNames } = require('./costService');
const { parseMarginMap, applyMargins } = require('./margin');
const { renderDashboard } = require('./dashboard');
const { renderLogin, renderEnroll } = require('./loginPage');
const { loadCredentials, saveTotpSecret } = require('./credentials');
const totp = require('./totp');
const {
  verifyPassword,
  createSession,
  verifySession,
  createEnrollmentToken,
  verifyEnrollmentToken,
  readCookie,
  buildSessionCookie,
  buildLogoutCookie,
  COOKIE_NAME,
} = require('./auth');

const MARGIN_MAP = process.env.MARGIN_MAP;
const API_TOKEN = process.env.ACCESS_TOKEN; // fallback opcional p/ a API (integração)

function json(statusCode, body, extraHeaders = {}) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
    body: JSON.stringify(body),
  };
}

function html(statusCode, body, extraHeaders = {}) {
  return {
    statusCode,
    headers: { 'Content-Type': 'text/html; charset=utf-8', ...extraHeaders },
    body,
  };
}

function redirect(location, extraHeaders = {}) {
  return { statusCode: 302, headers: { Location: location, ...extraHeaders }, body: '' };
}

function routeInfo(event) {
  const method = event.requestContext?.http?.method || event.httpMethod || 'GET';
  let path = event.rawPath || event.path || event.requestContext?.http?.path || '/';
  // Normaliza removendo o stage (/prod) do começo, se presente
  const stage = event.requestContext?.stage;
  if (stage && path.startsWith(`/${stage}`)) path = path.slice(stage.length + 1) || '/';
  return { method, path };
}

/** Parse de body form-urlencoded ou JSON. */
function parseBody(event) {
  let raw = event.body || '';
  if (event.isBase64Encoded) raw = Buffer.from(raw, 'base64').toString('utf8');
  const ct = (event.headers?.['content-type'] || event.headers?.['Content-Type'] || '').toLowerCase();
  if (ct.includes('application/json')) {
    try { return JSON.parse(raw); } catch { return {}; }
  }
  const params = new URLSearchParams(raw);
  const out = {};
  for (const [k, v] of params) out[k] = v;
  return out;
}

/** Sessão válida? retorna username ou null. */
async function sessionUser(event) {
  // API Gateway HTTP API (payload v2) entrega cookies em event.cookies (array).
  // REST API / outros entregam no header Cookie. Suporta ambos.
  let token;
  if (Array.isArray(event.cookies)) {
    token = readCookie(event.cookies.join('; '), COOKIE_NAME);
  }
  if (!token) {
    const cookieHeader = event.headers?.cookie || event.headers?.Cookie;
    token = readCookie(cookieHeader, COOKIE_NAME);
  }
  if (!token) return null;
  const creds = await loadCredentials();
  if (!creds.sessionSecret) return null;
  return verifySession(token, creds.sessionSecret);
}

/** Auth por token na API (header x-access-token ou ?token=). Token vem do SSM (fallback env). */
async function apiTokenOk(event) {
  const h = event.headers || {};
  const provided = h['x-access-token'] || h['X-Access-Token'] || event.queryStringParameters?.token;
  if (!provided) return false;
  let expected = '';
  try {
    const creds = await loadCredentials();
    expected = creds.accessToken || '';
  } catch (err) {
    console.error('Erro ao carregar access-token do SSM:', err);
  }
  if (!expected) expected = API_TOKEN || ''; // fallback para env (compatibilidade)
  if (!expected) return false;
  return provided === expected;
}

async function buildCostPayload() {
  const marginMap = parseMarginMap(MARGIN_MAP);
  const now = new Date();
  const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const current = monthRange(now);
  const previous = monthRange(prev);

  const [curCosts, prevCosts, names] = await Promise.all([
    getCostByAccount(current),
    getCostByAccount(previous),
    getAccountNames(),
  ]);

  // Garante que TODA conta da Organization apareça, mesmo com custo zero
  // (contas novas/sem uso não vêm no Cost Explorer). Sobrepõe os custos do CE.
  const mergeAllAccounts = (list) => {
    const byId = new Map();
    for (const id of Object.keys(names)) byId.set(id, { accountId: id, cost: 0 });
    for (const c of list) {
      const existing = byId.get(c.accountId) || { accountId: c.accountId, cost: 0 };
      existing.cost = c.cost;
      byId.set(c.accountId, existing);
    }
    return Array.from(byId.values());
  };

  const withNames = (list) =>
    list.map((c) => ({ ...c, accountName: names[c.accountId] || c.accountId }));

  const curFull = withNames(mergeAllAccounts(curCosts));
  const prevFull = withNames(mergeAllAccounts(prevCosts));

  return {
    generatedAt: new Date().toISOString(),
    marginMap,
    current: { period: current.label, ...applyMargins(curFull, marginMap) },
    previous: { period: previous.label, ...applyMargins(prevFull, marginMap) },
  };
}

exports.handler = async (event) => {
  const { method, path } = routeInfo(event);

  // Público
  if (path === '/health') {
    return json(200, { status: 'ok', service: 'mbf-cost-dashboard' });
  }
  if (method === 'OPTIONS') {
    return { statusCode: 204, headers: { 'Access-Control-Allow-Origin': '*' }, body: '' };
  }

  // Login
  if (path === '/login' && method === 'GET') {
    let mfaEnabled = false;
    try {
      const creds = await loadCredentials();
      mfaEnabled = Boolean(creds.totpSecret);
    } catch (err) {
      console.error('Erro ao carregar credenciais (GET /login):', err);
    }
    return html(200, renderLogin(undefined, mfaEnabled));
  }
  if (path === '/login' && method === 'POST') {
    const { username, password, code } = parseBody(event);
    let creds;
    try {
      creds = await loadCredentials();
    } catch (err) {
      console.error('Erro ao carregar credenciais:', err);
      return html(500, renderLogin('Erro interno de configuração.'));
    }
    const mfaEnabled = Boolean(creds.totpSecret);
    // Valida usuário e senha primeiro.
    if (
      !creds.username ||
      !creds.passwordHash ||
      username !== creds.username ||
      !verifyPassword(password || '', creds.passwordHash)
    ) {
      return html(401, renderLogin('Usuário ou senha inválidos.', mfaEnabled));
    }
    // Sem MFA configurado ainda → inicia o enrollment (primeiro login).
    if (!mfaEnabled) {
      const secret = totp.generateSecret();
      const otpauth = totp.otpauthURL(secret, {
        issuer: 'MBF Cost Dashboard',
        account: creds.username,
      });
      const enrollToken = createEnrollmentToken(creds.username, secret, creds.sessionSecret);
      return html(
        200,
        renderEnroll({ username: creds.username, secret, otpauth, enrollToken })
      );
    }
    // MFA já ativo → código TOTP obrigatório.
    if (!totp.verify(code || '', creds.totpSecret)) {
      return html(401, renderLogin('Código de verificação inválido.', mfaEnabled));
    }
    const token = createSession(creds.username, creds.sessionSecret);
    return redirect('.', { 'Set-Cookie': buildSessionCookie(token) });
  }
  // Confirmação do enrollment de MFA (primeiro login): valida o 1º código e grava o secret.
  if (path === '/enroll' && method === 'POST') {
    const { enroll, code } = parseBody(event);
    let creds;
    try {
      creds = await loadCredentials();
    } catch (err) {
      console.error('Erro ao carregar credenciais (enroll):', err);
      return html(500, renderLogin('Erro interno de configuração.'));
    }
    // Se o MFA já foi ativado nesse meio tempo, manda para o login normal.
    if (creds.totpSecret) {
      return redirect('login');
    }
    const pending = verifyEnrollmentToken(enroll || '', creds.sessionSecret);
    if (!pending || pending.username !== creds.username) {
      return html(400, renderLogin('Sessão de configuração expirada. Entre novamente.'));
    }
    if (!totp.verify(code || '', pending.totpSecret)) {
      // Reexibe a mesma tela de enrollment (mesmo secret pendente) com erro.
      const otpauth = totp.otpauthURL(pending.totpSecret, {
        issuer: 'MBF Cost Dashboard',
        account: creds.username,
      });
      return html(
        401,
        renderEnroll(
          { username: creds.username, secret: pending.totpSecret, otpauth, enrollToken: enroll },
          'Código inválido. Tente o código atual do aplicativo.'
        )
      );
    }
    // Código confere → grava o secret no SSM (SecureString) e cria a sessão.
    try {
      await saveTotpSecret(pending.totpSecret);
    } catch (err) {
      console.error('Erro ao gravar totp-secret:', err);
      return html(500, renderLogin('Não foi possível salvar a configuração de MFA.'));
    }
    const token = createSession(creds.username, creds.sessionSecret);
    return redirect('.', { 'Set-Cookie': buildSessionCookie(token) });
  }
  if (path === '/logout') {
    return redirect('login', { 'Set-Cookie': buildLogoutCookie() });
  }

  // API JSON — aceita sessão OU token de API
  if (path === '/api/costs') {
    const user = await sessionUser(event);
    if (!user && !(await apiTokenOk(event))) {
      return json(401, { error: 'unauthorized' });
    }
    try {
      return json(200, await buildCostPayload());
    } catch (err) {
      console.error('Erro custos:', err);
      return json(500, { error: 'internal_error', message: err.message });
    }
  }

  // Dashboard (raiz) — exige sessão, senão manda pro login
  const user = await sessionUser(event);
  if (!user) {
    return redirect('login');
  }
  try {
    return html(200, renderDashboard(await buildCostPayload()));
  } catch (err) {
    console.error('Erro dashboard:', err);
    return json(500, { error: 'internal_error', message: err.message });
  }
};
