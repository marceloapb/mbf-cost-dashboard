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
      <tr class="acc-row" data-account-id="${escapeHtml(it.accountId)}" data-account-name="${escapeHtml(it.accountName)}" title="Ver detalhe por serviço">
        <td>
          <div class="acc-name">${escapeHtml(it.accountName)} <span class="chev">›</span></div>
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

function renderDashboard(payload, username) {
  const userBar = username
    ? `<div class="userbar">
         <span class="uname">👤 ${escapeHtml(username)}</span>
         <a class="ulink" href="senha">Trocar senha</a>
         <a class="ulink" href="logout">Sair</a>
       </div>`
    : '';
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
    header { max-width:960px; margin:0 auto 20px; display:flex; justify-content:space-between; align-items:flex-start; gap:16px; flex-wrap:wrap; }
    h1 { font-size:20px; margin:0 0 4px; }
    .sub { color:var(--mut); font-size:13px; }
    .userbar { display:flex; align-items:center; gap:14px; font-size:13px; }
    .uname { color:var(--txt); font-weight:600; }
    .ulink { color:var(--acc); text-decoration:none; }
    .ulink:hover { text-decoration:underline; }
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
    /* Drill-down */
    .acc-row { cursor:pointer; transition:background .12s; }
    .acc-row:hover { background:#20242e; }
    .chev { color:var(--acc); font-weight:700; }
    .modal-bg { position:fixed; inset:0; background:rgba(0,0,0,.6); display:none; align-items:flex-start; justify-content:center; padding:40px 16px; overflow:auto; z-index:50; }
    .modal-bg.open { display:flex; }
    .modal { width:100%; max-width:820px; background:var(--card); border:1px solid var(--line); border-radius:12px; padding:20px 22px; }
    .modal h3 { margin:0 0 2px; font-size:16px; }
    .modal .macc { color:var(--mut); font-size:12px; margin-bottom:16px; }
    .modal .close { float:right; cursor:pointer; color:var(--mut); font-size:20px; line-height:1; border:0; background:none; }
    .modal .loading { color:var(--mut); padding:20px; text-align:center; }
    .modal h4 { font-size:13px; color:var(--mut); margin:16px 0 6px; font-weight:600; }
    .svc-row { cursor:pointer; transition:background .12s; }
    .svc-row:hover { background:#20242e; }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>Painel de Custos — MBF</h1>
      <div class="sub">Custos AWS por conta com margem aplicada · gerado em ${escapeHtml(payload.generatedAt)}</div>
    </div>
    ${userBar}
  </header>
  ${renderTable('Mês atual', payload.current)}
  ${renderTable('Mês anterior', payload.previous)}
  <footer>
    Fonte: AWS Cost Explorer (UnblendedCost). "A cobrar" = custo × margem configurada por conta.
    Valores em USD. Clique numa conta para ver o detalhe por serviço.
  </footer>

  <div class="modal-bg" id="modalBg">
    <div class="modal" role="dialog" aria-modal="true">
      <button class="close" id="modalClose" aria-label="Fechar">×</button>
      <h3 id="modalTitle">Detalhe da conta</h3>
      <div class="macc" id="modalAcc"></div>
      <div id="modalBody"><div class="loading">Carregando…</div></div>
    </div>
  </div>

  <script>
    (function () {
      var bg = document.getElementById('modalBg');
      var body = document.getElementById('modalBody');
      var title = document.getElementById('modalTitle');
      var accEl = document.getElementById('modalAcc');

      function usd(n) {
        return '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      }
      function qty(n) {
        var v = Number(n || 0);
        return v.toLocaleString('en-US', { maximumFractionDigits: 3 });
      }
      function esc(s) {
        return String(s).replace(/[&<>"]/g, function (c) {
          return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
        });
      }
      function block(label, b, accId) {
        var rows = (b.items || []).map(function (it) {
          var uso = it.usage ? qty(it.usage) + (it.unit ? ' ' + esc(it.unit) : '') : '—';
          return '<tr class="svc-row" data-account-id="' + esc(accId) + '" data-service="' + esc(it.service) +
            '" title="Ver uso por tipo"><td>' + esc(it.service) + ' <span class="chev">›</span></td>' +
            '<td class="num">' + uso + '</td>' +
            '<td class="num">' + usd(it.cost) +
            '</td><td class="num">' + Number(it.margin).toFixed(2) + 'x</td><td class="num billable">' +
            usd(it.billable) + '</td><td class="num profit">' + usd(it.profit) + '</td></tr>';
        }).join('');
        if (!rows) rows = '<tr><td colspan="6" class="empty">Sem custos neste período.</td></tr>';
        return '<h4>' + esc(label) + ' · ' + esc(b.period) + '</h4>' +
          '<table><thead><tr><th>Serviço AWS</th><th class="num">Uso</th><th class="num">Custo</th><th class="num">Margem</th>' +
          '<th class="num">A cobrar</th><th class="num">Lucro</th></tr></thead><tbody>' + rows +
          '</tbody><tfoot><tr><td>Total</td><td class="num">—</td><td class="num">' + usd(b.totals.cost) +
          '</td><td class="num">—</td><td class="num billable">' + usd(b.totals.billable) +
          '</td><td class="num profit">' + usd(b.totals.profit) + '</td></tr></tfoot></table>';
      }
      // Drill-down de 2º nível: uso por USAGE_TYPE de um serviço.
      function usageBlock(label, b) {
        var rows = (b.items || []).map(function (it) {
          var uso = it.usage ? qty(it.usage) + (it.unit ? ' ' + esc(it.unit) : '') : '—';
          return '<tr><td>' + esc(it.usageType) + '</td><td class="num">' + uso +
            '</td><td class="num">' + usd(it.cost) + '</td><td class="num billable">' + usd(it.billable) +
            '</td><td class="num profit">' + usd(it.profit) + '</td></tr>';
        }).join('');
        if (!rows) rows = '<tr><td colspan="5" class="empty">Sem uso neste período.</td></tr>';
        return '<h4>' + esc(label) + ' · ' + esc(b.period) + '</h4>' +
          '<table><thead><tr><th>Tipo de uso</th><th class="num">Uso</th><th class="num">Custo</th>' +
          '<th class="num">A cobrar</th><th class="num">Lucro</th></tr></thead><tbody>' + rows +
          '</tbody><tfoot><tr><td>Total</td><td class="num">—</td><td class="num">' + usd(b.totals.cost) +
          '</td><td class="num billable">' + usd(b.totals.billable) +
          '</td><td class="num profit">' + usd(b.totals.profit) + '</td></tr></tfoot></table>';
      }
      function bindServiceRows() {
        body.querySelectorAll('.svc-row').forEach(function (row) {
          row.addEventListener('click', function () {
            openService(row.getAttribute('data-account-id'), row.getAttribute('data-service'));
          });
        });
      }
      // Abre o detalhe de uso por tipo de um serviço (2º nível).
      function openService(id, service) {
        title.textContent = 'Uso por tipo';
        accEl.textContent = service + ' · ' + id;
        body.innerHTML = '<div class="loading">Carregando…</div>' +
          '<div style="margin-top:12px"><a href="#" id="backSvc" class="ulink">← Voltar aos serviços</a></div>';
        var back = document.getElementById('backSvc');
        if (back) back.addEventListener('click', function (e) { e.preventDefault(); open(id, accEl.getAttribute('data-name') || id); });
        fetch('api/costs/service?id=' + encodeURIComponent(id) + '&service=' + encodeURIComponent(service), { credentials: 'same-origin' })
          .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
          .then(function (d) {
            body.innerHTML = '<div style="margin-bottom:12px"><a href="#" id="backSvc2" class="ulink">← Voltar aos serviços</a></div>' +
              usageBlock('Mês atual', d.current) + usageBlock('Mês anterior', d.previous);
            var b2 = document.getElementById('backSvc2');
            if (b2) b2.addEventListener('click', function (e) { e.preventDefault(); open(id, accEl.getAttribute('data-name') || id); });
          })
          .catch(function (e) { body.innerHTML = '<div class="loading">Erro ao carregar: ' + esc(e.message) + '</div>'; });
      }
      function open(id, name) {
        title.textContent = 'Detalhe por serviço';
        accEl.textContent = name + ' · ' + id;
        accEl.setAttribute('data-name', name);
        body.innerHTML = '<div class="loading">Carregando…</div>';
        bg.classList.add('open');
        fetch('api/costs/account?id=' + encodeURIComponent(id), { credentials: 'same-origin' })
          .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
          .then(function (d) { body.innerHTML = block('Mês atual', d.current, id) + block('Mês anterior', d.previous, id); bindServiceRows(); })
          .catch(function (e) { body.innerHTML = '<div class="loading">Erro ao carregar: ' + esc(e.message) + '</div>'; });
      }
      function close() { bg.classList.remove('open'); }

      document.querySelectorAll('.acc-row').forEach(function (row) {
        row.addEventListener('click', function () {
          open(row.getAttribute('data-account-id'), row.getAttribute('data-account-name'));
        });
      });
      document.getElementById('modalClose').addEventListener('click', close);
      bg.addEventListener('click', function (e) { if (e.target === bg) close(); });
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
    })();
  </script>
</body>
</html>`;
}

module.exports = { renderDashboard };
