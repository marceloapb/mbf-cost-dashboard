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

module.exports = { renderLogin };
