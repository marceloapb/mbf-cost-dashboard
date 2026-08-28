'use strict';

/**
 * Renderiza o dashboard HTML a partir do payload de custos.
 * Sem dependências externas — HTML/CSS inline.
 */

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtUSD(n) {
  return `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function renderRows(items) {
  if (!items.length) {
    return '<tr><td colspan="5" class="empty">Sem custos no período.</td></tr>';
  }
  return items
    .map(
      (it) => `
      <tr>
        <td>
          <div class="acc-name">${escapeHtml(it.accountName)}</div>
          <div class="acc-id">${escapeHtml(it.accountId)}</div>
        </td>
        <td class="num">${fmtUSD(it.cost)}</td>
        <td class="num">${it.margin.toFixed(2)}x</td>
        <td class="num billable">${fmtUSD(it.billable)}</td>
        <td class="num profit">${fmtUSD(it.profit)}</td>
      </tr>`
    )
    .join('');
}

function renderTable(title, block) {
  return `
    <section class="card">
      <h2>${escapeHtml(title)} <span class="period">${escapeHtml(block.period)}</span></h2>
      <table>
        <thead>
          <tr>
            <th>Conta / Cliente</th>
            <th class="num">Custo AWS</th>
            <th class="num">Margem</th>
            <th class="num">A cobrar</th>
            <th class="num">Lucro</th>
          </tr>
        </thead>
        <tbody>${renderRows(block.items)}</tbody>
        <tfoot>
          <tr>
            <td>Total</td>
            <td class="num">${fmtUSD(block.totals.cost)}</td>
            <td class="num">—</td>
            <td class="num billable">${fmtUSD(block.totals.billable)}</td>
            <td class="num profit">${fmtUSD(block.totals.profit)}</td>
          </tr>
        </tfoot>
      </table>
    </section>`;
}

function renderDashboard(payload) {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>MBF — Painel de Custos</title>
  <style>
    :root { --bg:#0f1115; --card:#1a1d24; --line:#2a2f3a; --txt:#e6e8ee; --mut:#8b93a7; --ok:#3ddc97; --acc:#5b9dff; }
    * { box-sizing: border-box; }
    body { margin:0; font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; background:var(--bg); color:var(--txt); padding:24px; }
    header { max-width:960px; margin:0 auto 20px; }
    h1 { font-size:20px; margin:0 0 4px; }
    .sub { color:var(--mut); font-size:13px; }
    .card { max-width:960px; margin:0 auto 20px; background:var(--card); border:1px solid var(--line); border-radius:12px; padding:18px 20px; }
    h2 { font-size:15px; margin:0 0 12px; display:flex; align-items:center; gap:10px; }
    .period { color:var(--mut); font-weight:400; font-size:13px; }
    table { width:100%; border-collapse:collapse; }
    th, td { text-align:left; padding:10px 8px; border-bottom:1px solid var(--line); font-size:14px; }
    th.num, td.num { text-align:right; font-variant-numeric: tabular-nums; }
    .acc-name { font-weight:600; }
    .acc-id { color:var(--mut); font-size:12px; }
    .billable { color:var(--acc); font-weight:600; }
    .profit { color:var(--ok); }
    tfoot td { font-weight:700; border-top:2px solid var(--line); border-bottom:none; }
    .empty { color:var(--mut); text-align:center; padding:20px; }
    footer { max-width:960px; margin:0 auto; color:var(--mut); font-size:12px; }
  </style>
</head>
<body>
  <header>
    <h1>Painel de Custos — MBF</h1>
    <div class="sub">Custos AWS por conta com margem aplicada · gerado em ${escapeHtml(payload.generatedAt)}</div>
  </header>
  ${renderTable('Mês atual', payload.current)}
  ${renderTable('Mês anterior', payload.previous)}
  <footer>
    Fonte: AWS Cost Explorer (UnblendedCost). "A cobrar" = custo × margem configurada por conta.
    Valores em USD.
  </footer>
</body>
</html>`;
}

module.exports = { renderDashboard };
