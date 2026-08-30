'use strict';

const { monthRange, monthRangeFromLabel, getCostByAccount, getCostByServiceForAccount, getUsageByTypeForService, getAccountNames } = require('./costService');
const { parseMarginMap, applyMargins, applyMarginToServices, applyMarginToUsageTypes, marginFor } = require('./margin');
const { renderDashboard } = require('./dashboard');
const { renderLogin, renderMfa, renderEnroll, renderChangePassword, renderEmails, renderConfig } = require('./loginPage');
const { loadCredentials, saveTotpSecret, savePasswordHash } = require('./credentials');
const { loadImapConfig, saveImapConfig, redactConfig, MODEL_OPTIONS } = require('./emailConfig');
const { updateScanInterval } = require('./scheduleManager');
const emailStore = require('./emailStore');
const { runScan } = require('./emailPipeline');
const totp = require('./totp');
const {
  hashPassword,
  verifyPassword,
  validatePasswordChange,
  createSession,
  verifySession,
  createEnrollmentToken,
  verifyEnrollmentToken,
  createMfaToken,
  verifyMfaToken,
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

/** Valida e extrai o parâmetro de mês (YYYY-MM) da query string. Retorna undefined se ausente/inválido. */
function monthParam(event) {
  const m = event.queryStringParameters?.month;
  if (m && /^\d{4}-\d{2}$/.test(m)) return m;
  return undefined;
}

async function buildCostPayload(monthLabel) {
  const marginMap = parseMarginMap(MARGIN_MAP);
  const current = monthLabel ? monthRangeFromLabel(monthLabel) : monthRange(new Date());
  // Mês anterior ao selecionado (deriva do Start do mês atual).
  const [cy, cm] = current.label.split('-').map(Number);
  const prevRef = new Date(Date.UTC(cy, cm - 2, 1)); // cm é 1-based; -2 => mês anterior 0-based
  const previous = monthRange(prevRef);

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

/**
 * Detalhe analítico de UMA conta: custo por serviço AWS (mês atual e anterior),
 * com a margem da conta aplicada.
 * @param {string} accountId
 */
async function buildAccountDetail(accountId, monthLabel) {
  const marginMap = parseMarginMap(MARGIN_MAP);
  const margin = marginFor(marginMap, accountId);
  const current = monthLabel ? monthRangeFromLabel(monthLabel) : monthRange(new Date());
  const [cy, cm] = current.label.split('-').map(Number);
  const previous = monthRange(new Date(Date.UTC(cy, cm - 2, 1)));

  const [curSvc, prevSvc, names] = await Promise.all([
    getCostByServiceForAccount(accountId, current),
    getCostByServiceForAccount(accountId, previous),
    getAccountNames(),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    accountId,
    accountName: names[accountId] || accountId,
    margin,
    current: { period: current.label, ...applyMarginToServices(curSvc, margin) },
    previous: { period: previous.label, ...applyMarginToServices(prevSvc, margin) },
  };
}

/**
 * Detalhe de USO por USAGE_TYPE de UM serviço dentro de uma conta (drill-down de 2º nível),
 * meses atual e anterior, com a margem da conta aplicada.
 * @param {string} accountId
 * @param {string} serviceName
 */
async function buildServiceUsageDetail(accountId, serviceName, monthLabel) {
  const marginMap = parseMarginMap(MARGIN_MAP);
  const margin = marginFor(marginMap, accountId);
  const current = monthLabel ? monthRangeFromLabel(monthLabel) : monthRange(new Date());
  const [cy, cm] = current.label.split('-').map(Number);
  const previous = monthRange(new Date(Date.UTC(cy, cm - 2, 1)));

  const [curUsage, prevUsage, names] = await Promise.all([
    getUsageByTypeForService(accountId, serviceName, current),
    getUsageByTypeForService(accountId, serviceName, previous),
    getAccountNames(),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    accountId,
    accountName: names[accountId] || accountId,
    service: serviceName,
    margin,
    current: { period: current.label, ...applyMarginToUsageTypes(curUsage, margin) },
    previous: { period: previous.label, ...applyMarginToUsageTypes(prevUsage, margin) },
  };
}

/** Traduz erros comuns da IA (Bedrock) para mensagem amigável. */
function friendlyAiError(err) {
  const msg = String((err && err.message) || err || '');
  if (/AccessDenied|not authorized|Marketplace|Subscribe|agreement|don't have access|access to the model/i.test(msg)) {
    return 'O modelo de IA ainda não está habilitado nesta conta. Ative o Claude no console do Amazon Bedrock → Model access (região us-east-1) e tente novamente.';
  }
  if (/throttl|too many|rate/i.test(msg)) {
    return 'Muitas solicitações à IA agora. Aguarde alguns segundos e tente de novo.';
  }
  return 'Não foi possível analisar com a IA agora: ' + msg.slice(0, 200);
}

/** Analisa (IA) todos os e-mails pendentes (analyzed=false). Usado no fluxo assíncrono. */
async function analyzePending() {
  const { summarizeEmail } = require('./aiSummarizer');
  const cfg = await loadImapConfig();
  const items = await emailStore.list(500);
  const pendentes = items.filter((it) => !it.analyzed);
  let analisados = 0;
  const erros = [];
  for (const it of pendentes) {
    try {
      const analysis = await summarizeEmail(
        { subject: it.subjectOriginal, from: it.from, text: it.body || '' },
        cfg.bedrockModelId
      );
      await emailStore.updateAnalysis(it.messageId, analysis);
      analisados += 1;
    } catch (err) {
      erros.push({ messageId: it.messageId, error: friendlyAiError(err) });
      // Se for erro de acesso ao modelo, não adianta continuar.
      if (/Bedrock|habilitado/i.test(friendlyAiError(err))) break;
    }
  }
  return { pendentes: pendentes.length, analisados, erros };
}

exports.handler = async (event) => {
  // Evento agendado (EventBridge) → roda o scan de e-mails e encerra (sem HTTP).
  if (event && event.source === 'scheduled-scan') {
    try {
      const result = await runScan();
      console.log('Scan agendado:', JSON.stringify(result));
      return result;
    } catch (err) {
      console.error('Erro no scan agendado:', err);
      return { error: err.message };
    }
  }
  // Evento assíncrono → analisa todos os pendentes com IA (disparado por analyze-all).
  if (event && event.source === 'analyze-all') {
    try {
      const result = await analyzePending();
      console.log('Analyze-all:', JSON.stringify(result));
      return result;
    } catch (err) {
      console.error('Erro no analyze-all:', err);
      return { error: err.message };
    }
  }

  const { method, path } = routeInfo(event);

  // Público
  if (path === '/health') {
    return json(200, { status: 'ok', service: 'mbf-cost-dashboard' });
  }
  // PWA: manifest, service worker e ícone (públicos).
  if (path === '/manifest.webmanifest') {
    const { MANIFEST } = require('./pwa');
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/manifest+json; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
      body: JSON.stringify(MANIFEST),
    };
  }
  if (path === '/sw.js') {
    const { SERVICE_WORKER } = require('./pwa');
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'no-cache' },
      body: SERVICE_WORKER,
    };
  }
  if (path === '/icon.svg') {
    const { ICON_SVG } = require('./pwa');
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'image/svg+xml; charset=utf-8', 'Cache-Control': 'public, max-age=86400' },
      body: ICON_SVG,
    };
  }
  if (method === 'OPTIONS') {
    return { statusCode: 204, headers: { 'Access-Control-Allow-Origin': '*' }, body: '' };
  }

  // Login
  if (path === '/login' && method === 'GET') {
    return html(200, renderLogin());
  }
  if (path === '/login' && method === 'POST') {
    // Etapa 1: valida usuário + senha. Não recebe código MFA aqui.
    const { username, password } = parseBody(event);
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
      return html(401, renderLogin('Usuário ou senha inválidos.'));
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
    // MFA já ativo → etapa 2: exibe a tela que pede apenas o código.
    const mfaToken = createMfaToken(creds.username, creds.sessionSecret);
    return html(200, renderMfa({ username: creds.username, mfaToken }));
  }
  // Etapa 2 do login: valida o código TOTP e cria a sessão.
  if (path === '/mfa' && method === 'POST') {
    const { mfa, code } = parseBody(event);
    let creds;
    try {
      creds = await loadCredentials();
    } catch (err) {
      console.error('Erro ao carregar credenciais (mfa):', err);
      return html(500, renderLogin('Erro interno de configuração.'));
    }
    // Sem MFA configurado (ex.: foi resetado) → volta ao login/enrollment.
    if (!creds.totpSecret) {
      return redirect('login');
    }
    // Valida o token de MFA pendente emitido na etapa 1 (identidade + validade).
    const pending = verifyMfaToken(mfa || '', creds.sessionSecret);
    if (!pending || pending.username !== creds.username) {
      return html(401, renderLogin('Sessão de verificação expirada. Entre novamente.'));
    }
    // Código TOTP obrigatório.
    if (!totp.verify(code || '', creds.totpSecret)) {
      // Reemite o desafio para permitir nova tentativa sem repetir a senha.
      const mfaToken = createMfaToken(creds.username, creds.sessionSecret);
      return html(
        401,
        renderMfa({ username: creds.username, mfaToken }, 'Código de verificação inválido.')
      );
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
  // Troca de senha (exige sessão)
  if (path === '/senha' && method === 'GET') {
    const user = await sessionUser(event);
    if (!user) return redirect('login');
    return html(200, renderChangePassword({ username: user }));
  }
  if (path === '/senha' && method === 'POST') {
    const user = await sessionUser(event);
    if (!user) return redirect('login');
    const { current, novaSenha, confirmar } = parseBody(event);
    let creds;
    try {
      creds = await loadCredentials();
    } catch (err) {
      console.error('Erro ao carregar credenciais (senha):', err);
      return html(500, renderChangePassword({ username: user }, 'Erro interno de configuração.'));
    }
    const check = validatePasswordChange({
      current,
      novaSenha,
      confirmar,
      storedHash: creds.passwordHash,
    });
    if (!check.ok) {
      return html(400, renderChangePassword({ username: user }, check.error));
    }
    try {
      await savePasswordHash(hashPassword(novaSenha));
    } catch (err) {
      console.error('Erro ao gravar nova senha:', err);
      return html(500, renderChangePassword({ username: user }, 'Não foi possível salvar a nova senha.'));
    }
    return html(200, renderChangePassword({ username: user }, undefined, 'Senha alterada com sucesso.'));
  }

  // ===== Leitor de e-mails AWS com IA =====
  // Aba de e-mails (HTML) — exige sessão.
  if (path === '/emails' && method === 'GET') {
    const user = await sessionUser(event);
    if (!user) return redirect('login');
    return html(200, renderEmails({ username: user }));
  }
  // Central de configurações (HTML) — exige sessão.
  if (path === '/config' && method === 'GET') {
    const user = await sessionUser(event);
    if (!user) return redirect('login');
    let cfg;
    try {
      cfg = redactConfig(await loadImapConfig());
    } catch (err) {
      console.error('Erro ao carregar config:', err);
      cfg = redactConfig({ mailboxes: [] });
    }
    return html(200, renderConfig({ username: user, config: cfg, models: MODEL_OPTIONS }));
  }
  // Salvar configurações (form) — exige sessão. Rota relativa "config".
  if (path === '/config' && method === 'POST') {
    const user = await sessionUser(event);
    if (!user) return redirect('login');
    const b = parseBody(event);
    const mailboxes = [];
    for (let i = 0; i < 5; i++) {
      const u = (b[`user${i}`] || '').trim();
      if (u) mailboxes.push({ user: u, password: b[`pass${i}`] || '' });
    }
    const incoming = {
      host: (b.host || '').trim(),
      port: Number(b.port) || 993,
      mailboxes,
      senders: b.senders || '',
      subjectKeywords: b.subjectKeywords || '',
      scanLimit: b.scanLimit,
      scanWindowDays: b.scanWindowDays,
      scanIntervalHours: b.scanIntervalHours,
      bedrockModelId: b.bedrockModelId,
    };
    if (!incoming.host || !mailboxes.length) {
      const cfg = redactConfig(await loadImapConfig());
      return html(400, renderConfig({ username: user, config: cfg, models: MODEL_OPTIONS }, 'Informe o servidor e ao menos uma caixa.'));
    }
    try {
      await saveImapConfig(incoming);
    } catch (err) {
      console.error('Erro ao salvar config:', err);
      const cfg = redactConfig(await loadImapConfig());
      return html(500, renderConfig({ username: user, config: cfg, models: MODEL_OPTIONS }, 'Não foi possível salvar a configuração.'));
    }
    // Aplica a frequência no EventBridge (falha suave — não bloqueia o salvamento).
    let okMsg = 'Configurações salvas com sucesso.';
    const sched = await updateScanInterval(incoming.scanIntervalHours);
    if (!sched.ok) {
      okMsg += ' (A frequência foi salva, mas o agendamento não pôde ser atualizado agora.)';
    }
    const cfg = redactConfig(await loadImapConfig());
    return html(200, renderConfig({ username: user, config: cfg, models: MODEL_OPTIONS }, undefined, okMsg));
  }
  // Redireciona a rota antiga para a central de configurações.
  if (path === '/config-imap') {
    return redirect('config');
  }
  // Lista JSON dos e-mails processados — exige sessão OU token de API.
  if (path === '/api/emails' && method === 'GET') {
    const user = await sessionUser(event);
    if (!user && !(await apiTokenOk(event))) return json(401, { error: 'unauthorized' });
    try {
      return json(200, { items: await emailStore.list(200) });
    } catch (err) {
      console.error('Erro ao listar e-mails:', err);
      return json(500, { error: 'internal_error', message: err.message });
    }
  }
  // Verificar agora (sob demanda) — dispara o scan em BACKGROUND e responde na hora.
  // (O scan síncrono estoura o limite de 30s do API Gateway → 503. Por isso é assíncrono.)
  if (path === '/api/emails/scan' && method === 'POST') {
    const user = await sessionUser(event);
    if (!user && !(await apiTokenOk(event))) return json(401, { error: 'unauthorized' });
    try {
      const fn = process.env.SELF_FUNCTION_NAME;
      if (fn) {
        const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');
        const lambda = new LambdaClient({ region: process.env.AWS_REGION || 'us-east-1' });
        await lambda.send(
          new InvokeCommand({
            FunctionName: fn,
            InvocationType: 'Event', // assíncrono (fire-and-forget)
            Payload: Buffer.from(JSON.stringify({ source: 'scheduled-scan' })),
          })
        );
        return json(202, { started: true, message: 'Verificação iniciada em segundo plano.' });
      }
      // Fallback: sem nome da função, roda síncrono (pode estourar em caixas grandes).
      return json(200, await runScan());
    } catch (err) {
      console.error('Erro ao iniciar scan:', err);
      return json(500, { error: 'internal_error', message: err.message });
    }
  }

  // Analisar UM e-mail com IA (sob demanda). Síncrono (1 chamada ao Bedrock).
  if (path === '/api/emails/analyze' && method === 'POST') {
    const user = await sessionUser(event);
    if (!user && !(await apiTokenOk(event))) return json(401, { error: 'unauthorized' });
    const b = parseBody(event);
    const id = b.id || event.queryStringParameters?.id;
    if (!id) return json(400, { error: 'missing_id' });
    try {
      const item = await emailStore.getById(id);
      if (!item) return json(404, { error: 'not_found' });
      const { summarizeEmail } = require('./aiSummarizer');
      const cfg = await loadImapConfig();
      const analysis = await summarizeEmail(
        { subject: item.subjectOriginal, from: item.from, text: item.body || '' },
        cfg.bedrockModelId
      );
      await emailStore.updateAnalysis(id, analysis);
      return json(200, { ok: true, analysis });
    } catch (err) {
      console.error('Erro ao analisar e-mail:', err);
      return json(200, { ok: false, error: friendlyAiError(err) });
    }
  }
  // Analisar TODOS os pendentes — assíncrono (evita timeout do API Gateway).
  if (path === '/api/emails/analyze-all' && method === 'POST') {
    const user = await sessionUser(event);
    if (!user && !(await apiTokenOk(event))) return json(401, { error: 'unauthorized' });
    try {
      const fn = process.env.SELF_FUNCTION_NAME;
      if (fn) {
        const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');
        const lambda = new LambdaClient({ region: process.env.AWS_REGION || 'us-east-1' });
        await lambda.send(
          new InvokeCommand({
            FunctionName: fn,
            InvocationType: 'Event',
            Payload: Buffer.from(JSON.stringify({ source: 'analyze-all' })),
          })
        );
        return json(202, { started: true, message: 'Análise de todos os pendentes iniciada.' });
      }
      return json(200, await analyzePending());
    } catch (err) {
      console.error('Erro ao iniciar analise-all:', err);
      return json(500, { error: 'internal_error', message: err.message });
    }
  }

  // API JSON — aceita sessão OU token de API
  // Drill-down analítico: custo por serviço de uma conta. /api/costs/account?id=<accountId>
  if (path === '/api/costs/account') {
    const user = await sessionUser(event);
    if (!user && !(await apiTokenOk(event))) {
      return json(401, { error: 'unauthorized' });
    }
    const accountId = event.queryStringParameters?.id;
    if (!accountId || !/^\d{12}$/.test(accountId)) {
      return json(400, { error: 'invalid_account_id' });
    }
    try {
      return json(200, await buildAccountDetail(accountId, monthParam(event)));
    } catch (err) {
      console.error('Erro detalhe da conta:', err);
      return json(500, { error: 'internal_error', message: err.message });
    }
  }
  // Drill-down 2º nível: uso por USAGE_TYPE de um serviço.
  // /api/costs/service?id=<accountId>&service=<nome do serviço>
  if (path === '/api/costs/service') {
    const user = await sessionUser(event);
    if (!user && !(await apiTokenOk(event))) {
      return json(401, { error: 'unauthorized' });
    }
    const accountId = event.queryStringParameters?.id;
    const service = event.queryStringParameters?.service;
    if (!accountId || !/^\d{12}$/.test(accountId)) {
      return json(400, { error: 'invalid_account_id' });
    }
    if (!service || service.length > 200) {
      return json(400, { error: 'invalid_service' });
    }
    try {
      return json(200, await buildServiceUsageDetail(accountId, service, monthParam(event)));
    } catch (err) {
      console.error('Erro detalhe do serviço:', err);
      return json(500, { error: 'internal_error', message: err.message });
    }
  }
  if (path === '/api/costs') {
    const user = await sessionUser(event);
    if (!user && !(await apiTokenOk(event))) {
      return json(401, { error: 'unauthorized' });
    }
    try {
      return json(200, await buildCostPayload(monthParam(event)));
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
    return html(200, renderDashboard(await buildCostPayload(), user));
  } catch (err) {
    console.error('Erro dashboard:', err);
    return json(500, { error: 'internal_error', message: err.message });
  }
};
