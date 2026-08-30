'use strict';

/**
 * Lógica de cálculo de custo + margem por conta.
 * Isolada do handler para ser testável sem AWS.
 */

/**
 * Faz o parse do mapa de margens vindo de env/SSM.
 * Formato aceito (JSON): { "532404260870": 1.5, "default": 1.0 }
 * @param {string|undefined} raw
 * @returns {Record<string, number>}
 */
function parseMarginMap(raw) {
  if (!raw) return { default: 1.0 };
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`MARGIN_MAP inválido (JSON esperado): ${err.message}`);
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('MARGIN_MAP deve ser um objeto { accountId: multiplicador }');
  }
  const out = {};
  for (const [key, value] of Object.entries(parsed)) {
    const num = Number(value);
    if (!Number.isFinite(num) || num < 0) {
      throw new Error(`Margem inválida para "${key}": ${value}`);
    }
    out[key] = num;
  }
  if (!('default' in out)) out.default = 1.0;
  return out;
}

/**
 * Retorna o multiplicador de margem para uma conta, com fallback no default.
 * @param {Record<string, number>} marginMap
 * @param {string} accountId
 * @returns {number}
 */
function marginFor(marginMap, accountId) {
  if (Object.prototype.hasOwnProperty.call(marginMap, accountId)) {
    return marginMap[accountId];
  }
  return marginMap.default ?? 1.0;
}

/**
 * Arredonda para 2 casas decimais de forma segura.
 * @param {number} n
 * @returns {number}
 */
function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Aplica a margem sobre uma lista de custos por conta.
 * @param {Array<{accountId: string, accountName?: string, cost: number}>} rawCosts
 * @param {Record<string, number>} marginMap
 * @returns {{items: Array<object>, totals: {cost: number, billable: number}}}
 */
function applyMargins(rawCosts, marginMap) {
  const items = rawCosts.map((entry) => {
    const cost = round2(Number(entry.cost) || 0);
    const margin = marginFor(marginMap, entry.accountId);
    const billable = round2(cost * margin);
    return {
      accountId: entry.accountId,
      accountName: entry.accountName || entry.accountId,
      cost,
      margin,
      billable,
      profit: round2(billable - cost),
    };
  });

  const totals = items.reduce(
    (acc, it) => {
      acc.cost = round2(acc.cost + it.cost);
      acc.billable = round2(acc.billable + it.billable);
      return acc;
    },
    { cost: 0, billable: 0 }
  );
  totals.profit = round2(totals.billable - totals.cost);

  return { items, totals };
}

module.exports = { parseMarginMap, marginFor, applyMargins, applyMarginToServices, applyMarginToUsageTypes, round2 };

/**
 * Aplica uma margem fixa (da conta) sobre uma lista de custos por serviço.
 * @param {Array<{service: string, cost: number}>} services
 * @param {number} margin multiplicador da conta
 * @returns {{items: Array<object>, totals: {cost: number, billable: number, profit: number}}}
 */
function applyMarginToServices(services, margin) {
  const m = Number.isFinite(Number(margin)) ? Number(margin) : 1.0;
  const items = services.map((s) => {
    const cost = round2(Number(s.cost) || 0);
    const billable = round2(cost * m);
    return {
      service: s.service,
      cost,
      margin: m,
      billable,
      profit: round2(billable - cost),
      usage: Number(s.usage) || 0,
      unit: s.unit || '',
    };
  });
  const totals = items.reduce(
    (acc, it) => {
      acc.cost = round2(acc.cost + it.cost);
      acc.billable = round2(acc.billable + it.billable);
      return acc;
    },
    { cost: 0, billable: 0 }
  );
  totals.profit = round2(totals.billable - totals.cost);
  return { items, totals };
}

/**
 * Aplica a margem da conta sobre uma lista de uso por USAGE_TYPE (drill-down de 2º nível).
 * Preserva quantidade de uso e unidade (homogêneas por tipo).
 * @param {Array<{usageType: string, cost: number, usage: number, unit: string}>} rows
 * @param {number} margin multiplicador da conta
 * @returns {{items: Array<object>, totals: {cost: number, billable: number, profit: number}}}
 */
function applyMarginToUsageTypes(rows, margin) {
  const m = Number.isFinite(Number(margin)) ? Number(margin) : 1.0;
  const items = rows.map((s) => {
    const cost = round2(Number(s.cost) || 0);
    const billable = round2(cost * m);
    return {
      usageType: s.usageType,
      cost,
      margin: m,
      billable,
      profit: round2(billable - cost),
      usage: Number(s.usage) || 0,
      unit: s.unit || '',
    };
  });
  const totals = items.reduce(
    (acc, it) => {
      acc.cost = round2(acc.cost + it.cost);
      acc.billable = round2(acc.billable + it.billable);
      return acc;
    },
    { cost: 0, billable: 0 }
  );
  totals.profit = round2(totals.billable - totals.cost);
  return { items, totals };
}
