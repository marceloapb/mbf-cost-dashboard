'use strict';

const { monthRange, getCostByAccount, getAccountNames } = require('./costService');
const { parseMarginMap, applyMargins } = require('./margin');
const { renderDashboard } = require('./dashboard');

const MARGIN_MAP = process.env.MARGIN_MAP;
const ACCESS_TOKEN = process.env.ACCESS_TOKEN; // token simples de acesso

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

function html(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
    body,
  };
}

/**
 * Extrai o path e o método do evento (HttpApi v2 ou REST v1).
 */
function routeInfo(event) {
  const method =
    event.requestContext?.http?.method || event.httpMethod || 'GET';
  const path =
    event.rawPath || event.path || event.requestContext?.http?.path || '/';
  return { method, path };
}

/**
 * Valida o token de acesso. Aceita header 'x-access-token' ou query '?token='.
 */
function isAuthorized(event) {
  if (!ACCESS_TOKEN) return false; // sem token configurado = bloqueado
  const headers = event.headers || {};
  const headerToken =
    headers['x-access-token'] || headers['X-Access-Token'];
  const queryToken = event.queryStringParameters?.token;
  return headerToken === ACCESS_TOKEN || queryToken === ACCESS_TOKEN;
}

/**
 * Monta o payload de custos (mês atual e anterior) com margem aplicada.
 */
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

  // Health check é público
  if (path.endsWith('/health')) {
    return json(200, { status: 'ok', service: 'mbf-cost-dashboard' });
  }

  if (method === 'OPTIONS') {
    return { statusCode: 204, headers: { 'Access-Control-Allow-Origin': '*' }, body: '' };
  }

  if (!isAuthorized(event)) {
    return json(401, { error: 'unauthorized', hint: 'informe x-access-token ou ?token=' });
  }

  try {
    if (path.endsWith('/api/costs')) {
      const payload = await buildCostPayload();
      return json(200, payload);
    }

    // Rota raiz (ou qualquer outra) devolve o dashboard HTML
    const payload = await buildCostPayload();
    return html(200, renderDashboard(payload));
  } catch (err) {
    console.error('Erro ao gerar custos:', err);
    return json(500, { error: 'internal_error', message: err.message });
  }
};
