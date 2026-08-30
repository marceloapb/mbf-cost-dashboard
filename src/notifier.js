'use strict';

const pushStore = require('./pushStore');
const fcm = require('./fcm');

/**
 * Envia uma notificação push para todos os dispositivos registrados.
 * Falha suave: se FCM não estiver configurado ou não houver tokens, apenas ignora.
 * Remove automaticamente tokens inválidos.
 * @param {{title:string, body:string, data?:object}} msg
 * @returns {Promise<{sent:number}>}
 */
async function notifyAll(msg) {
  try {
    if (!(await fcm.isConfigured())) return { sent: 0, skipped: 'fcm-nao-configurado' };
    const tokens = await pushStore.listTokens();
    if (!tokens.length) return { sent: 0, skipped: 'sem-tokens' };
    const res = await fcm.sendToTokens(tokens, msg);
    if (res.invalid.length) await pushStore.removeTokens(res.invalid);
    return { sent: res.sent, invalid: res.invalid.length, errors: res.errors };
  } catch (err) {
    console.warn('notifyAll falhou:', err.message);
    return { sent: 0, error: err.message };
  }
}

module.exports = { notifyAll };
