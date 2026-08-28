'use strict';

const { monthRange, getCostByAccount, getAccountNames } = require('./costService');
const { parseMarginMap, applyMargins } = require('./margin');
const { renderDashboard } = require('./dashboard');
const { renderLogin } = require('./loginPage');
const { loadCredentials } = require('./credentials');
const {
  verifyPassword,
  createSession,
  verifySession,
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
  const cookieHeader = event.headers?.cookie || event.headers?.Cookie;
  const token = readCookie(cookieHeader, COOKIE_NAME);
  if (!token) return null;
  const creds = await loadCredentials();
  if (!creds.sessionSecret) return null;
  return verifySession(token, creds.sessionSecret);
}

/** Auth por token na API (header x-access-token ou ?token=). */
function apiTokenOk(event) {
  if (!API_TOKEN) return false;
  const h = event.headers || {};
  const t = h['x-access-token'] || h['X-Access-Token'] || event.queryStringParameters?.token;
  return t === API_TOKEN;
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
  const withNames = (list) =>
    list.map((c) => ({ ...c, accountName: names[c.accountId] || c.accountId }));

  return {
    generatedAt: new Date().toISOString(),
    marginMap,
    current: { period: current.label, ...applyMargins(withNames(curCosts), marginMap) },
    previous: { period: previous.label, ...applyMargins(withNames(prevCosts), marginMap) },
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
    return html(200, renderLogin());
  }
  if (path === '/login' && method === 'POST') {
    const { username, password } = parseBody(event);
    let creds;
    try {
      creds = await loadCredentials();
    } catch (err) {
      console.error('Erro ao carregar credenciais:', err);
      return html(500, renderLogin('Erro interno de configuração.'));
    }
    if (
      !creds.username ||
      !creds.passwordHash ||
      username !== creds.username ||
      !verifyPassword(password || '', creds.passwordHash)
    ) {
      return html(401, renderLogin('Usuário ou senha inválidos.'));
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
    if (!user && !apiTokenOk(event)) {
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
