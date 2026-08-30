'use strict';

const { FAVICON_TAG } = require('./brand');

/**
 * Página de login (etapa 1: usuário + senha). Faz POST para /login.
 * Se as credenciais conferem e o MFA está ativo, o servidor responde com a tela de MFA
 * (renderMfa). Se for o primeiro login, responde com o enrollment.
 * @param {string} [error] mensagem de erro opcional
 */
function renderLogin(error) {
  const errBox = error
    ? `<div class="err">${String(error).replace(/</g, '&lt;')}</div>`
    : '';
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  ${FAVICON_TAG}
  <title>MBF — Login</title>
  <style>
    :root { --bg:#0f1115; --card:#1a1d24; --line:#2a2f3a; --txt:#e6e8ee; --mut:#8b93a7; --acc:#5b9dff; }
    * { box-sizing:border-box; }
    body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
           font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif; background:var(--bg); color:var(--txt); }
    .card { width:100%; max-width:360px; background:var(--card); border:1px solid var(--line);
            border-radius:14px; padding:28px; }
    h1 { font-size:18px; margin:0 0 4px; }
    .sub { color:var(--mut); font-size:13px; margin-bottom:20px; }
    label { display:block; font-size:13px; color:var(--mut); margin:12px 0 6px; }
    input { width:100%; padding:11px 12px; border-radius:8px; border:1px solid var(--line);
            background:#0f1115; color:var(--txt); font-size:14px; }
    button { width:100%; margin-top:20px; padding:12px; border:0; border-radius:8px;
             background:var(--acc); color:#fff; font-size:15px; font-weight:600; cursor:pointer; }
    .err { background:#3a1d1d; border:1px solid #5a2a2a; color:#ffb4b4; padding:10px 12px;
           border-radius:8px; font-size:13px; margin-bottom:12px; }
  </style>
</head>
<body>
  <form class="card" method="POST" action="login">
    <h1>Painel de Custos MBF</h1>
    <div class="sub">Entre com seu usuário e senha</div>
    ${errBox}
    <label for="u">Usuário</label>
    <input id="u" name="username" autocomplete="username" autofocus required>
    <label for="p">Senha</label>
    <input id="p" name="password" type="password" autocomplete="current-password" required>
    <button type="submit">Entrar</button>
  </form>
</body>
</html>`;
}

/**
 * Página de verificação em duas etapas (etapa 2: apenas o código MFA/TOTP).
 * Exibida após a validação de usuário/senha. Faz POST para /mfa levando o token de MFA
 * pendente (assinado) num campo oculto e o código digitado pelo usuário.
 * @param {object} p
 * @param {string} p.username usuário autenticado na etapa 1 (exibição)
 * @param {string} p.mfaToken token assinado do desafio de MFA pendente
 * @param {string} [error] mensagem de erro opcional
 */
function renderMfa(p, error) {
  const errBox = error
    ? `<div class="err">${String(error).replace(/</g, '&lt;')}</div>`
    : '';
  const user = String(p.username || '').replace(/</g, '&lt;');
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  ${FAVICON_TAG}
  <title>MBF — Verificação em duas etapas</title>
  <style>
    :root { --bg:#0f1115; --card:#1a1d24; --line:#2a2f3a; --txt:#e6e8ee; --mut:#8b93a7; --acc:#5b9dff; }
    * { box-sizing:border-box; }
    body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
           font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif; background:var(--bg); color:var(--txt); }
    .card { width:100%; max-width:360px; background:var(--card); border:1px solid var(--line);
            border-radius:14px; padding:28px; }
    h1 { font-size:18px; margin:0 0 4px; }
    .sub { color:var(--mut); font-size:13px; margin-bottom:20px; }
    label { display:block; font-size:13px; color:var(--mut); margin:12px 0 6px; }
    input { width:100%; padding:11px 12px; border-radius:8px; border:1px solid var(--line);
            background:#0f1115; color:var(--txt); font-size:14px; }
    button { width:100%; margin-top:20px; padding:12px; border:0; border-radius:8px;
             background:var(--acc); color:#fff; font-size:15px; font-weight:600; cursor:pointer; }
    .err { background:#3a1d1d; border:1px solid #5a2a2a; color:#ffb4b4; padding:10px 12px;
           border-radius:8px; font-size:13px; margin-bottom:12px; }
    .back { display:block; text-align:center; margin-top:14px; color:var(--mut); font-size:13px; text-decoration:none; }
  </style>
</head>
<body>
  <form class="card" method="POST" action="mfa">
    <h1>Verificação em duas etapas</h1>
    <div class="sub">Olá, <b>${user}</b>. Informe o código do app autenticador para concluir o acesso.</div>
    ${errBox}
    <input type="hidden" name="mfa" value="${p.mfaToken}">
    <label for="c">Código de verificação</label>
    <input id="c" name="code" inputmode="numeric" autocomplete="one-time-code"
           pattern="[0-9]*" maxlength="6" placeholder="000000" autofocus required>
    <button type="submit">Entrar</button>
    <a class="back" href="login">← Voltar</a>
  </form>
</body>
</html>`;
}

/**
 * Página de enrollment de MFA (primeiro login). Mostra o QR Code (renderizado no cliente),
 * o secret em texto para cadastro manual, e um campo para confirmar o primeiro código.
 * O secret proposto trafega assinado no campo oculto `enroll` (não é gravado até a confirmação).
 * @param {object} p
 * @param {string} p.username
 * @param {string} p.secret secret TOTP em Base32 (para exibição/cadastro manual)
 * @param {string} p.otpauth URI otpauth:// para o QR
 * @param {string} p.enrollToken token assinado do enrollment pendente
 * @param {string} [error] mensagem de erro opcional
 */
function renderEnroll(p, error) {
  const errBox = error
    ? `<div class="err">${String(error).replace(/</g, '&lt;')}</div>`
    : '';
  const secretGroups = String(p.secret).replace(/(.{4})/g, '$1 ').trim();
  const otpauthAttr = String(p.otpauth).replace(/"/g, '&quot;');
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  ${FAVICON_TAG}
  <title>MBF — Configurar verificação em duas etapas</title>
  <style>
    :root { --bg:#0f1115; --card:#1a1d24; --line:#2a2f3a; --txt:#e6e8ee; --mut:#8b93a7; --acc:#5b9dff; }
    * { box-sizing:border-box; }
    body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
           font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif; background:var(--bg); color:var(--txt); padding:20px; }
    .card { width:100%; max-width:420px; background:var(--card); border:1px solid var(--line);
            border-radius:14px; padding:28px; }
    h1 { font-size:18px; margin:0 0 4px; }
    .sub { color:var(--mut); font-size:13px; margin-bottom:20px; line-height:1.5; }
    ol { color:var(--mut); font-size:13px; line-height:1.6; padding-left:18px; margin:0 0 16px; }
    .qr { display:flex; justify-content:center; background:#fff; padding:14px; border-radius:10px; margin:0 auto 16px; width:190px; height:190px; }
    .secret { font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:14px; letter-spacing:1px;
              background:#0f1115; border:1px solid var(--line); border-radius:8px; padding:10px 12px; text-align:center; word-break:break-all; }
    label { display:block; font-size:13px; color:var(--mut); margin:16px 0 6px; }
    input { width:100%; padding:11px 12px; border-radius:8px; border:1px solid var(--line);
            background:#0f1115; color:var(--txt); font-size:14px; }
    button { width:100%; margin-top:20px; padding:12px; border:0; border-radius:8px;
             background:var(--acc); color:#fff; font-size:15px; font-weight:600; cursor:pointer; }
    .err { background:#3a1d1d; border:1px solid #5a2a2a; color:#ffb4b4; padding:10px 12px;
           border-radius:8px; font-size:13px; margin-bottom:12px; }
    .hint { color:var(--mut); font-size:12px; margin-top:8px; text-align:center; }
  </style>
</head>
<body>
  <form class="card" method="POST" action="enroll">
    <h1>Configure a verificação em duas etapas</h1>
    <div class="sub">Escaneie o QR Code com o <b>Microsoft Authenticator</b> (ou digite a chave manualmente) e informe o código gerado para concluir.</div>
    ${errBox}
    <div class="qr"><div id="qr"></div></div>
    <div class="secret">${secretGroups}</div>
    <div class="hint">Chave para cadastro manual (conta: ${String(p.username).replace(/</g,'&lt;')})</div>
    <input type="hidden" name="enroll" value="${p.enrollToken}">
    <label for="c">Código do aplicativo</label>
    <input id="c" name="code" inputmode="numeric" autocomplete="one-time-code"
           pattern="[0-9]*" maxlength="6" placeholder="000000" autofocus required>
    <button type="submit">Ativar e entrar</button>
  </form>
  <script src="https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js"></script>
  <script>
    (function(){
      try {
        new QRCode(document.getElementById('qr'), {
          text: "${otpauthAttr}", width: 160, height: 160,
          colorDark: "#000000", colorLight: "#ffffff"
        });
      } catch (e) {
        document.getElementById('qr').innerHTML =
          '<div style="color:#333;font-size:11px;padding:8px;text-align:center">Use a chave manual abaixo</div>';
      }
    })();
  </script>
</body>
</html>`;
}

module.exports = { renderLogin, renderMfa, renderEnroll, renderChangePassword, renderEmails, renderConfig };

/**
 * Aba "E-mails AWS": lista os e-mails processados com badges de urgência,
 * detalhe expansível e botão "Verificar agora". Os dados vêm de GET /api/emails.
 * @param {object} p
 * @param {string} p.username
 */
function renderEmails(p) {
  const user = String(p && p.username ? p.username : '').replace(/</g, '&lt;');
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  ${FAVICON_TAG}
  <title>MBF — E-mails AWS</title>
  <style>
    :root { --bg:#0f1115; --card:#1a1d24; --line:#2a2f3a; --txt:#e6e8ee; --mut:#8b93a7; --acc:#5b9dff; --ok:#3ddc97; }
    * { box-sizing:border-box; }
    body { margin:0; font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif; background:var(--bg); color:var(--txt); padding:24px; }
    header { max-width:960px; margin:0 auto 20px; display:flex; justify-content:space-between; align-items:center; gap:16px; flex-wrap:wrap; }
    h1 { font-size:20px; margin:0; }
    a { color:var(--acc); text-decoration:none; }
    a:hover { text-decoration:underline; }
    .toolbar { max-width:960px; margin:0 auto 16px; display:flex; gap:12px; align-items:center; }
    button { padding:10px 14px; border:0; border-radius:8px; background:var(--acc); color:#fff; font-weight:600; cursor:pointer; font-size:14px; }
    button:disabled { opacity:.6; cursor:default; }
    .hint { color:var(--mut); font-size:13px; }
    .card { max-width:960px; margin:0 auto 12px; background:var(--card); border:1px solid var(--line); border-radius:12px; padding:14px 16px; }
    .row { display:flex; justify-content:space-between; gap:12px; cursor:pointer; align-items:flex-start; }
    .subj { font-weight:600; }
    .meta { color:var(--mut); font-size:12px; margin-top:4px; }
    .badge { font-size:11px; font-weight:700; padding:3px 8px; border-radius:999px; white-space:nowrap; }
    .u-alta { background:#3a1d1d; color:#ffb4b4; border:1px solid #5a2a2a; }
    .u-media { background:#3a301d; color:#ffd9a0; border:1px solid #5a4a2a; }
    .u-baixa { background:#1d2a3a; color:#a9cbff; border:1px solid #2a3f5a; }
    .u-informativo { background:#20242e; color:#9aa3b5; border:1px solid var(--line); }
    .detail { margin-top:12px; padding-top:12px; border-top:1px solid var(--line); display:none; }
    .detail.open { display:block; }
    .detail h4 { margin:10px 0 4px; font-size:13px; color:var(--mut); }
    .acoes { margin:4px 0 0; padding-left:18px; }
    .empty { max-width:960px; margin:0 auto; color:var(--mut); text-align:center; padding:40px; }
  </style>
</head>
<body>
  <header>
    <h1>📧 E-mails AWS</h1>
    <div><a href=".">← Painel</a> · <a href="config">⚙️ Configurações</a> · <a href="logout">Sair</a></div>
  </header>
  <div class="toolbar">
    <button id="scanBtn">🔄 Verificar agora</button>
    <span class="hint" id="scanHint">Usuário: ${user}</span>
  </div>
  <div id="listArea"><div class="empty">Carregando…</div></div>

  <script>
    (function () {
      var listArea = document.getElementById('listArea');
      var scanBtn = document.getElementById('scanBtn');
      var scanHint = document.getElementById('scanHint');
      function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
      function badge(u){ u = u || 'informativo'; return '<span class="badge u-'+esc(u)+'">'+esc(u.toUpperCase())+'</span>'; }
      function render(items){
        if(!items || !items.length){ listArea.innerHTML = '<div class="empty">Nenhum e-mail da AWS processado ainda. Configure o IMAP e clique em Verificar agora.</div>'; return; }
        listArea.innerHTML = items.map(function(it, i){
          var acoes = (it.acoes && it.acoes.length)
            ? '<h4>Ações</h4><ul class="acoes">'+it.acoes.map(function(a){return '<li>'+esc(a)+'</li>';}).join('')+'</ul>'
            : '<h4>Ações</h4><div class="hint">Nenhuma ação necessária.</div>';
          var prazo = it.prazo ? '<h4>Prazo</h4><div>'+esc(it.prazo)+'</div>' : '';
          return '<div class="card">'
            + '<div class="row" data-i="'+i+'"><div><div class="subj">'+esc(it.assuntoPt || it.subjectOriginal)+'</div>'
            + '<div class="meta">'+esc(it.fromAddress || it.from)+' · '+esc((it.date||"").slice(0,10))+' · '+esc(it.mailbox||"")+'</div></div>'
            + badge(it.urgencia)+'</div>'
            + '<div class="detail" id="d'+i+'">'
            + '<h4>Resumo</h4><div>'+esc(it.resumo)+'</div>'
            + acoes + prazo
            + '<h4>Assunto original</h4><div class="hint">'+esc(it.subjectOriginal)+'</div>'
            + '</div></div>';
        }).join('');
        listArea.querySelectorAll('.row').forEach(function(r){
          r.addEventListener('click', function(){ var d = document.getElementById('d'+r.getAttribute('data-i')); if(d) d.classList.toggle('open'); });
        });
      }
      function load(){
        fetch('api/emails', { credentials:'same-origin' })
          .then(function(r){ if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); })
          .then(function(d){ render(d.items || []); })
          .catch(function(e){ listArea.innerHTML = '<div class="empty">Erro ao carregar: '+esc(e.message)+'</div>'; });
      }
      scanBtn.addEventListener('click', function(){
        scanBtn.disabled = true; scanHint.textContent = 'Verificação iniciada em segundo plano… atualizando a lista.';
        fetch('api/emails/scan', { method:'POST', credentials:'same-origin' })
          .then(function(r){ if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); })
          .then(function(){
            // Processamento roda em background; recarrega a lista algumas vezes.
            var tries = 0;
            var timer = setInterval(function(){
              tries++;
              load();
              if (tries >= 6) { clearInterval(timer); scanBtn.disabled = false; scanHint.textContent = 'Lista atualizada. Se faltar algo, verifique novamente em instantes.'; }
              else { scanHint.textContent = 'Processando em segundo plano… (' + tries + ')'; }
            }, 5000);
          })
          .catch(function(e){ scanHint.textContent = 'Erro: '+esc(e.message); scanBtn.disabled = false; });
      });
      load();
    })();
  </script>
</body>
</html>`;
}

/**
 * Tela de configuração do IMAP (host/porta + caixas com senha).
 * As senhas nunca voltam preenchidas: mostra placeholder indicando se há senha salva.
 * @param {object} p
 * @param {string} p.username
 * @param {{host:string,port:number,mailboxes:Array<{user:string,hasPassword:boolean}>}} p.config
 * @param {string} [error]
 * @param {string} [ok]
 */
function renderConfig(p, error, ok) {
  const cfg = (p && p.config) || { host: '', port: 993, mailboxes: [], senders: [], scanLimit: 100, scanWindowDays: 0, scanIntervalHours: 1, bedrockModelId: '' };
  const models = (p && p.models) || [];
  const errBox = error ? `<div class="err">${String(error).replace(/</g, '&lt;')}</div>` : '';
  const okBox = ok ? `<div class="ok">${String(ok).replace(/</g, '&lt;')}</div>` : '';
  const esc = (s) => String(s == null ? '' : s).replace(/"/g, '&quot;').replace(/</g, '&lt;');
  const boxes = cfg.mailboxes.slice();
  while (boxes.length < 2) boxes.push({ user: '', hasPassword: false });
  const boxRows = boxes
    .map(
      (m, i) => `
      <div class="mbox">
        <label>E-mail ${i + 1}</label>
        <input name="user${i}" type="email" value="${esc(m.user)}" placeholder="conta@bloise.com.br" autocomplete="off">
        <label>Senha ${i + 1}</label>
        <input name="pass${i}" type="password" placeholder="${m.hasPassword ? '•••••••• (configurada — deixe em branco para manter)' : 'senha da conta de e-mail'}" autocomplete="new-password">
      </div>`
    )
    .join('');
  const modelOptions = models
    .map((m) => `<option value="${esc(m.id)}"${m.id === cfg.bedrockModelId ? ' selected' : ''}>${esc(m.label)}</option>`)
    .join('');
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  ${FAVICON_TAG}
  <title>MBF — Configurações</title>
  <style>
    :root { --bg:#0f1115; --card:#1a1d24; --line:#2a2f3a; --txt:#e6e8ee; --mut:#8b93a7; --acc:#5b9dff; --ok:#3ddc97; }
    * { box-sizing:border-box; }
    body { margin:0; font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif; background:var(--bg); color:var(--txt); padding:40px 16px; }
    form { width:100%; max-width:560px; margin:0 auto; }
    .card { background:var(--card); border:1px solid var(--line); border-radius:14px; padding:22px 24px; margin-bottom:16px; }
    h1 { font-size:20px; margin:0 0 16px; max-width:560px; margin-left:auto; margin-right:auto; }
    h2 { font-size:15px; margin:0 0 4px; }
    .sub { color:var(--mut); font-size:13px; margin-bottom:14px; }
    label { display:block; font-size:13px; color:var(--mut); margin:12px 0 6px; }
    input, select, textarea { width:100%; padding:11px 12px; border-radius:8px; border:1px solid var(--line); background:#0f1115; color:var(--txt); font-size:14px; }
    textarea { font-family:ui-monospace,SFMono-Regular,Menlo,monospace; resize:vertical; }
    .row2 { display:flex; gap:12px; }
    .row2 > div { flex:1; }
    .mbox { border:1px solid var(--line); border-radius:10px; padding:12px; margin-top:14px; }
    button { width:100%; margin-top:4px; padding:13px; border:0; border-radius:8px; background:var(--acc); color:#fff; font-size:15px; font-weight:600; cursor:pointer; }
    .err { background:#3a1d1d; border:1px solid #5a2a2a; color:#ffb4b4; padding:10px 12px; border-radius:8px; font-size:13px; margin-bottom:12px; }
    .ok { background:#12301f; border:1px solid #1f5a3a; color:#8ff0bf; padding:10px 12px; border-radius:8px; font-size:13px; margin-bottom:12px; }
    .note { color:var(--mut); font-size:12px; margin-top:8px; line-height:1.5; }
    .back { display:block; text-align:center; margin-top:6px; color:var(--mut); font-size:13px; text-decoration:none; }
  </style>
</head>
<body>
  <h1>⚙️ Configurações</h1>
  <form method="POST" action="config">
    <div style="max-width:560px;margin:0 auto">${okBox}${errBox}</div>

    <div class="card">
      <h2>Servidor IMAP</h2>
      <div class="sub">Credenciais das caixas monitoradas. Senhas ficam cifradas (SSM) e nunca são exibidas.</div>
      <div class="row2">
        <div><label>Servidor</label><input name="host" value="${esc(cfg.host || 'imap.hostinger.com')}" placeholder="imap.hostinger.com"></div>
        <div><label>Porta</label><input name="port" value="${esc(cfg.port || 993)}" inputmode="numeric"></div>
      </div>
      ${boxRows}
      <div class="note">Hostinger: <b>imap.hostinger.com</b> / porta <b>993</b> (SSL). O leitor apenas lê (não apaga nem move).</div>
    </div>

    <div class="card">
      <h2>Remetentes monitorados</h2>
      <div class="sub">Um por linha. Se preencher, monitora exatamente esses remetentes/domínios (basta parte do endereço). Vazio = detecção automática da AWS.</div>
      <textarea name="senders" rows="4" placeholder="@amazonaws.com&#10;aws-marketing@amazon.com&#10;no-reply@aws.amazon.com">${esc((cfg.senders || []).join('\n'))}</textarea>
    </div>

    <div class="card">
      <h2>Leitura & IA</h2>
      <div class="row2">
        <div>
          <label>Janela de busca</label>
          <select name="scanWindowDays">
            <option value="0"${Number(cfg.scanWindowDays) === 0 ? ' selected' : ''}>Caixa inteira</option>
            <option value="7"${Number(cfg.scanWindowDays) === 7 ? ' selected' : ''}>Últimos 7 dias</option>
            <option value="30"${Number(cfg.scanWindowDays) === 30 ? ' selected' : ''}>Últimos 30 dias</option>
            <option value="90"${Number(cfg.scanWindowDays) === 90 ? ' selected' : ''}>Últimos 90 dias</option>
          </select>
        </div>
        <div>
          <label>Limite por verificação</label>
          <input name="scanLimit" value="${esc(cfg.scanLimit || 100)}" inputmode="numeric">
        </div>
      </div>
      <label>Modelo de IA (Bedrock)</label>
      <select name="bedrockModelId">${modelOptions}</select>
      <div class="note">O limite controla quantos e-mails NOVOS são analisados por verificação (protege custo de IA). Rode de novo para continuar de onde parou.</div>
    </div>

    <div class="card">
      <h2>Verificação automática</h2>
      <label>Frequência</label>
      <select name="scanIntervalHours">
        <option value="1"${Number(cfg.scanIntervalHours) === 1 ? ' selected' : ''}>A cada 1 hora</option>
        <option value="3"${Number(cfg.scanIntervalHours) === 3 ? ' selected' : ''}>A cada 3 horas</option>
        <option value="6"${Number(cfg.scanIntervalHours) === 6 ? ' selected' : ''}>A cada 6 horas</option>
        <option value="12"${Number(cfg.scanIntervalHours) === 12 ? ' selected' : ''}>A cada 12 horas</option>
        <option value="24"${Number(cfg.scanIntervalHours) === 24 ? ' selected' : ''}>1 vez por dia</option>
      </select>
      <div class="note">Além do agendamento, você pode usar "Verificar agora" na aba de e-mails a qualquer momento.</div>
    </div>

    <div style="max-width:560px;margin:0 auto">
      <button type="submit">Salvar configurações</button>
      <a class="back" href="emails">← Voltar aos e-mails</a>
    </div>
  </form>
</body>
</html>`;
}

/**
 * Página de troca de senha (exige sessão). Pede senha atual + nova + confirmação.
 * @param {object} p
 * @param {string} p.username usuário logado (exibição)
 * @param {string} [error] mensagem de erro
 * @param {string} [ok] mensagem de sucesso
 */
function renderChangePassword(p, error, ok) {
  const errBox = error ? `<div class="err">${String(error).replace(/</g, '&lt;')}</div>` : '';
  const okBox = ok ? `<div class="ok">${String(ok).replace(/</g, '&lt;')}</div>` : '';
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  ${FAVICON_TAG}
  <title>MBF — Trocar senha</title>
  <style>
    :root { --bg:#0f1115; --card:#1a1d24; --line:#2a2f3a; --txt:#e6e8ee; --mut:#8b93a7; --acc:#5b9dff; --ok:#3ddc97; }
    * { box-sizing:border-box; }
    body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
           font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif; background:var(--bg); color:var(--txt); padding:20px; }
    .card { width:100%; max-width:380px; background:var(--card); border:1px solid var(--line);
            border-radius:14px; padding:28px; }
    h1 { font-size:18px; margin:0 0 4px; }
    .sub { color:var(--mut); font-size:13px; margin-bottom:20px; }
    label { display:block; font-size:13px; color:var(--mut); margin:12px 0 6px; }
    input { width:100%; padding:11px 12px; border-radius:8px; border:1px solid var(--line);
            background:#0f1115; color:var(--txt); font-size:14px; }
    button { width:100%; margin-top:20px; padding:12px; border:0; border-radius:8px;
             background:var(--acc); color:#fff; font-size:15px; font-weight:600; cursor:pointer; }
    .err { background:#3a1d1d; border:1px solid #5a2a2a; color:#ffb4b4; padding:10px 12px; border-radius:8px; font-size:13px; margin-bottom:12px; }
    .ok { background:#12301f; border:1px solid #1f5a3a; color:#8ff0bf; padding:10px 12px; border-radius:8px; font-size:13px; margin-bottom:12px; }
    .back { display:block; text-align:center; margin-top:14px; color:var(--mut); font-size:13px; text-decoration:none; }
  </style>
</head>
<body>
  <form class="card" method="POST" action="senha">
    <h1>Trocar senha</h1>
    <div class="sub">Usuário: <b>${String(p.username || '').replace(/</g, '&lt;')}</b></div>
    ${okBox}${errBox}
    <label for="cur">Senha atual</label>
    <input id="cur" name="current" type="password" autocomplete="current-password" required>
    <label for="n1">Nova senha</label>
    <input id="n1" name="novaSenha" type="password" autocomplete="new-password" minlength="8" required>
    <label for="n2">Confirme a nova senha</label>
    <input id="n2" name="confirmar" type="password" autocomplete="new-password" minlength="8" required>
    <button type="submit">Salvar nova senha</button>
    <a class="back" href=".">← Voltar ao painel</a>
  </form>
</body>
</html>`;
}
