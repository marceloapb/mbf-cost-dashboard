'use strict';

/**
 * Página de login (HTML). Faz POST para /login e, em caso de sucesso,
 * o servidor devolve o cookie de sessão e redireciona.
 * @param {string} [error] mensagem de erro opcional
 * @param {boolean} [mfa=false] se true, mostra o campo de código MFA (TOTP)
 */
function renderLogin(error, mfa = false) {
  const errBox = error
    ? `<div class="err">${String(error).replace(/</g, '&lt;')}</div>`
    : '';
  const mfaField = mfa
    ? `
    <label for="c">Código de verificação</label>
    <input id="c" name="code" inputmode="numeric" autocomplete="one-time-code"
           pattern="[0-9]*" maxlength="6" placeholder="000000">`
    : '';
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
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
    <div class="sub">Entre com seu usuário e senha${mfa ? ' e o código do app autenticador' : ''}</div>
    ${errBox}
    <label for="u">Usuário</label>
    <input id="u" name="username" autocomplete="username" autofocus required>
    <label for="p">Senha</label>
    <input id="p" name="password" type="password" autocomplete="current-password" required>${mfaField}
    <button type="submit">Entrar</button>
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

module.exports = { renderLogin, renderEnroll };
