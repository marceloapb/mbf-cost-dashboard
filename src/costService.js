'use strict';

const {
  CostExplorerClient,
  GetCostAndUsageCommand,
} = require('@aws-sdk/client-cost-explorer');
const {
  OrganizationsClient,
  ListAccountsCommand,
} = require('@aws-sdk/client-organizations');

// Cost Explorer só existe no endpoint us-east-1
const ce = new CostExplorerClient({ region: 'us-east-1' });
const org = new OrganizationsClient({ region: 'us-east-1' });

/**
 * Retorna o primeiro e último dia (exclusivo) do mês informado.
 * @param {Date} ref data de referência
 * @returns {{Start: string, End: string, label: string}} datas YYYY-MM-DD
 */
function monthRange(ref) {
  const y = ref.getUTCFullYear();
  const m = ref.getUTCMonth();
  const start = new Date(Date.UTC(y, m, 1));
  const end = new Date(Date.UTC(y, m + 1, 1)); // Cost Explorer End é exclusivo
  const fmt = (d) => d.toISOString().slice(0, 10);
  const label = `${y}-${String(m + 1).padStart(2, '0')}`;
  return { Start: fmt(start), End: fmt(end), label };
}

/**
 * Busca custo (UnblendedCost) agrupado por conta vinculada, no período dado.
 * @param {{Start: string, End: string}} period
 * @returns {Promise<Array<{accountId: string, cost: number}>>}
 */
async function getCostByAccount(period) {
  const cmd = new GetCostAndUsageCommand({
    TimePeriod: { Start: period.Start, End: period.End },
    Granularity: 'MONTHLY',
    Metrics: ['UnblendedCost'],
    GroupBy: [{ Type: 'DIMENSION', Key: 'LINKED_ACCOUNT' }],
  });
  const res = await ce.send(cmd);
  const groups = (res.ResultsByTime?.[0]?.Groups) || [];
  return groups.map((g) => ({
    accountId: g.Keys?.[0] || 'unknown',
    cost: Number(g.Metrics?.UnblendedCost?.Amount || 0),
  }));
}

/**
 * Mapa accountId -> nome amigável, via Organizations.
 * Falha suave: se não tiver permissão, retorna {} e usamos o ID.
 * @returns {Promise<Record<string,string>>}
 */
async function getAccountNames() {
  const names = {};
  try {
    let token;
    do {
      const res = await org.send(new ListAccountsCommand({ NextToken: token }));
      for (const acc of res.Accounts || []) {
        if (acc.Id) names[acc.Id] = acc.Name || acc.Id;
      }
      token = res.NextToken;
    } while (token);
  } catch (err) {
    console.warn('Não foi possível listar nomes de contas:', err.message);
  }
  return names;
}

/**
 * Busca custo por SERVIÇO AWS de uma conta específica, no período dado.
 * Usado no drill-down analítico (clicar numa conta).
 * @param {string} accountId conta vinculada (LINKED_ACCOUNT)
 * @param {{Start: string, End: string}} period
 * @returns {Promise<Array<{service: string, cost: number}>>} ordenado por custo desc
 */
async function getCostByServiceForAccount(accountId, period) {
  const cmd = new GetCostAndUsageCommand({
    TimePeriod: { Start: period.Start, End: period.End },
    Granularity: 'MONTHLY',
    Metrics: ['UnblendedCost'],
    GroupBy: [{ Type: 'DIMENSION', Key: 'SERVICE' }],
    Filter: {
      Dimensions: {
        Key: 'LINKED_ACCOUNT',
        Values: [accountId],
      },
    },
  });
  const res = await ce.send(cmd);
  const groups = (res.ResultsByTime?.[0]?.Groups) || [];
  return groups
    .map((g) => ({
      service: g.Keys?.[0] || 'unknown',
      cost: Number(g.Metrics?.UnblendedCost?.Amount || 0),
    }))
    .filter((s) => s.cost !== 0)
    .sort((a, b) => b.cost - a.cost);
}

module.exports = { monthRange, getCostByAccount, getCostByServiceForAccount, getAccountNames };
