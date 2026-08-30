'use strict';

const crypto = require('crypto');

/**
 * Autenticação simples baseada em usuário/senha com sessão por cookie assinado (HMAC).
 * A senha é armazenada como hash SHA-256 com salt (formato "salt:hash").
 * Nenhuma senha em texto puro é persistida.
 */

const SESSION_TTL_SECONDS = 12 * 60 * 60; // 12h
const COOKIE_NAME = 'mbf_session';

/**
 * Gera hash de senha no formato "salt:hexhash".
 * @param {string} password
 * @param {string} [salt] salt hex opcional (gera um novo se ausente)
 * @returns {string}
 */
function hashPassword(password, salt) {
  const s = salt || crypto.randomBytes(16).toString('hex');
  const h = crypto.createHash('sha256').update(`${s}:${password}`).digest('hex');
  return `${s}:${h}`;
}

/**
 * Verifica uma senha contra o hash armazenado ("salt:hash"), em tempo constante.
 * @param {string} password
 * @param {string} stored
 * @returns {boolean}
 */
function verifyPassword(password, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt] = stored.split(':');
  const candidate = hashPassword(password, salt);
  const a = Buffer.from(candidate);
  const b = Buffer.from(stored);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * Cria um token de sessão assinado: base64url(payload).assinaturaHMAC
 * @param {string} username
 * @param {string} secret segredo HMAC
 * @returns {string}
 */
function createSession(username, secret) {
  const payload = {
    u: username,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

/**
 * Valida um token de sessão. Retorna o username se válido e não expirado, senão null.
 * @param {string} token
 * @param {string} secret
 * @returns {string|null}
 */
function verifySession(token, secret) {
  if (!token || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload.u || null;
}

/**
 * Cria um token de enrollment pendente: assina (secret TOTP + username + validade) com HMAC,
 * usando o session-secret. Serve para transportar o secret proposto entre a tela de enrollment
 * e a confirmação, SEM gravá-lo em lugar nenhum antes de o usuário provar posse do código.
 * Formato: base64url(payload).assinaturaHMAC
 * @param {string} username
 * @param {string} totpSecret secret TOTP proposto (Base32)
 * @param {string} secret segredo HMAC (session-secret)
 * @param {number} [ttlSeconds=600] validade do enrollment (default 10 min)
 * @returns {string}
 */
function createEnrollmentToken(username, totpSecret, secret, ttlSeconds = 600) {
  const payload = {
    u: username,
    s: totpSecret,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
    k: 'enroll',
  };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

/**
 * Valida um token de enrollment pendente. Retorna { username, totpSecret } se válido e não
 * expirado, senão null.
 * @param {string} token
 * @param {string} secret segredo HMAC (session-secret)
 * @returns {{username: string, totpSecret: string}|null}
 */
function verifyEnrollmentToken(token, secret) {
  if (!token || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (payload.k !== 'enroll') return null;
  if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
  if (!payload.u || !payload.s) return null;
  return { username: payload.u, totpSecret: payload.s };
}

/**
 * Cria um token de MFA pendente: assina (username + validade) com HMAC usando o session-secret.
 * Emitido após a validação bem-sucedida de usuário/senha (1ª etapa), transporta a identidade do
 * usuário até a confirmação do código TOTP (2ª etapa), SEM criar sessão antes de o código conferir.
 * Formato: base64url(payload).assinaturaHMAC
 * @param {string} username
 * @param {string} secret segredo HMAC (session-secret)
 * @param {number} [ttlSeconds=300] validade do desafio de MFA (default 5 min)
 * @returns {string}
 */
function createMfaToken(username, secret, ttlSeconds = 300) {
  const payload = {
    u: username,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
    k: 'mfa',
  };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

/**
 * Valida um token de MFA pendente. Retorna { username } se válido e não expirado, senão null.
 * @param {string} token
 * @param {string} secret segredo HMAC (session-secret)
 * @returns {{username: string}|null}
 */
function verifyMfaToken(token, secret) {
  if (!token || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (payload.k !== 'mfa') return null;
  if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
  if (!payload.u) return null;
  return { username: payload.u };
}

/**
 * Extrai o valor de um cookie a partir do header Cookie.
 * @param {string|undefined} cookieHeader
 * @param {string} name
 * @returns {string|undefined}
 */
function readCookie(cookieHeader, name) {
  if (!cookieHeader) return undefined;
  const parts = cookieHeader.split(';');
  for (const part of parts) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return undefined;
}

/**
 * Monta o header Set-Cookie para a sessão.
 * @param {string} token
 * @returns {string}
 */
function buildSessionCookie(token) {
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}`;
}

/**
 * Cookie de logout (expira imediatamente).
 * @returns {string}
 */
function buildLogoutCookie() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

/**
 * Valida uma solicitação de troca de senha (regras puras, sem I/O).
 * @param {object} p
 * @param {string} p.current senha atual digitada
 * @param {string} p.novaSenha nova senha
 * @param {string} p.confirmar confirmação da nova senha
 * @param {string} p.storedHash hash atual ("salt:hash")
 * @returns {{ok: true}|{ok: false, error: string}}
 */
function validatePasswordChange(p) {
  const { current, novaSenha, confirmar, storedHash } = p || {};
  if (!current || !novaSenha || !confirmar) {
    return { ok: false, error: 'Preencha todos os campos.' };
  }
  if (!verifyPassword(current, storedHash || '')) {
    return { ok: false, error: 'Senha atual incorreta.' };
  }
  if (novaSenha.length < 8) {
    return { ok: false, error: 'A nova senha deve ter ao menos 8 caracteres.' };
  }
  if (novaSenha !== confirmar) {
    return { ok: false, error: 'A confirmação não corresponde à nova senha.' };
  }
  if (novaSenha === current) {
    return { ok: false, error: 'A nova senha deve ser diferente da atual.' };
  }
  return { ok: true };
}

module.exports = {
  COOKIE_NAME,
  SESSION_TTL_SECONDS,
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
};
