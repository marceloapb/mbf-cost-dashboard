'use strict';

const crypto = require('crypto');

/**
 * TOTP (RFC 6238) compatível com Microsoft Authenticator / Google Authenticator.
 * Sem dependências externas — usa apenas o módulo `crypto` nativo.
 *
 * Padrão adotado (igual ao dos apps autenticadores mais comuns):
 *   - Algoritmo: HMAC-SHA1
 *   - Dígitos: 6
 *   - Período: 30 segundos
 *   - Secret: Base32 (RFC 4648, sem padding)
 */

const DIGITS = 6;
const PERIOD = 30;
const ALGO = 'sha1';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/**
 * Gera um novo secret TOTP aleatório em Base32.
 * @param {number} [bytes=20] entropia em bytes (20 = 160 bits, padrão recomendado)
 * @returns {string} secret em Base32 sem padding
 */
function generateSecret(bytes = 20) {
  return base32Encode(crypto.randomBytes(bytes));
}

/**
 * Codifica um Buffer em Base32 (RFC 4648, sem padding).
 * @param {Buffer} buf
 * @returns {string}
 */
function base32Encode(buf) {
  let bits = 0;
  let value = 0;
  let out = '';
  for (let i = 0; i < buf.length; i++) {
    value = (value << 8) | buf[i];
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return out;
}

/**
 * Decodifica uma string Base32 (RFC 4648) em Buffer. Ignora espaços e padding.
 * @param {string} str
 * @returns {Buffer}
 */
function base32Decode(str) {
  const clean = String(str).toUpperCase().replace(/=+$/,'').replace(/\s+/g, '');
  let bits = 0;
  let value = 0;
  const out = [];
  for (const ch of clean) {
    const idx = BASE32_ALPHABET.indexOf(ch);
    if (idx === -1) continue; // ignora caracteres inválidos
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/**
 * Gera o código TOTP para um determinado contador (número de períodos desde epoch).
 * @param {string} secretBase32
 * @param {number} counter
 * @returns {string} código de 6 dígitos com zero-padding
 */
function hotp(secretBase32, counter) {
  const key = base32Decode(secretBase32);
  const buf = Buffer.alloc(8);
  // counter big-endian de 64 bits (usa a metade baixa; suficiente até ~2^53)
  buf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  buf.writeUInt32BE(counter >>> 0, 4);
  const hmac = crypto.createHmac(ALGO, key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binCode =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  const otp = binCode % 10 ** DIGITS;
  return otp.toString().padStart(DIGITS, '0');
}

/**
 * Gera o código TOTP atual para um instante (default: agora).
 * @param {string} secretBase32
 * @param {number} [forTime=Date.now()] timestamp em ms
 * @returns {string}
 */
function generate(secretBase32, forTime = Date.now()) {
  const counter = Math.floor(forTime / 1000 / PERIOD);
  return hotp(secretBase32, counter);
}

/**
 * Verifica um código TOTP em tempo constante, com janela de tolerância.
 * @param {string} token código digitado pelo usuário
 * @param {string} secretBase32
 * @param {object} [opts]
 * @param {number} [opts.window=1] períodos de tolerância antes/depois (1 = ±30s)
 * @param {number} [opts.forTime=Date.now()]
 * @returns {boolean}
 */
function verify(token, secretBase32, opts = {}) {
  const window = opts.window ?? 1;
  const forTime = opts.forTime ?? Date.now();
  const clean = String(token || '').replace(/\s+/g, '');
  if (!/^\d{6}$/.test(clean) || !secretBase32) return false;
  const counter = Math.floor(forTime / 1000 / PERIOD);
  let ok = false;
  // Sempre percorre toda a janela (não faz short-circuit) para evitar timing leak.
  for (let i = -window; i <= window; i++) {
    const candidate = hotp(secretBase32, counter + i);
    if (timingSafeEqualStr(candidate, clean)) ok = true;
  }
  return ok;
}

/**
 * Comparação de strings em tempo constante (mesmo comprimento esperado).
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function timingSafeEqualStr(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

/**
 * Monta a URI otpauth:// para provisionar em Microsoft Authenticator (via QR Code).
 * @param {string} secretBase32
 * @param {object} [opts]
 * @param {string} [opts.issuer='MBF Cost Dashboard']
 * @param {string} [opts.account='marcelo']
 * @returns {string}
 */
function otpauthURL(secretBase32, opts = {}) {
  const issuer = encodeURIComponent(opts.issuer || 'MBF Cost Dashboard');
  const account = encodeURIComponent(opts.account || 'user');
  const secret = String(secretBase32).replace(/\s+/g, '');
  return (
    `otpauth://totp/${issuer}:${account}` +
    `?secret=${secret}&issuer=${issuer}` +
    `&algorithm=SHA1&digits=${DIGITS}&period=${PERIOD}`
  );
}

module.exports = {
  DIGITS,
  PERIOD,
  generateSecret,
  base32Encode,
  base32Decode,
  hotp,
  generate,
  verify,
  otpauthURL,
};
