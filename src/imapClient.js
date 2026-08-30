'use strict';

const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
const { isAwsEmail, extractAddress } = require('./awsSenderFilter');

/**
 * Conecta em UMA caixa IMAP (read-only), busca e-mails recentes e devolve os
 * que são da AWS já parseados. Não apaga nem move nada.
 *
 * @param {{host:string, port:number, user:string, password:string}} box
 * @param {{sinceDays?:number, max?:number}} [opts]
 * @returns {Promise<Array<{messageId,from,fromAddress,subject,date,text}>>}
 */
async function fetchAwsEmailsFromBox(box, opts = {}) {
  const sinceDays = opts.sinceDays || 7;
  const max = opts.max || 40;
  const client = new ImapFlow({
    host: box.host,
    port: box.port || 993,
    secure: true,
    auth: { user: box.user, pass: box.password },
    logger: false,
  });

  const out = [];
  await client.connect();
  try {
    // openbox read-only (não altera flags \Seen)
    const lock = await client.getMailboxLock('INBOX', { readonly: true });
    try {
      const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);
      const uids = await client.search({ since }, { uid: true });
      const pick = (uids || []).slice(-max); // mais recentes
      for (const uid of pick) {
        const msg = await client.fetchOne(
          uid,
          { source: true, envelope: true },
          { uid: true }
        );
        if (!msg || !msg.source) continue;
        const parsed = await simpleParser(msg.source);
        const from = parsed.from?.text || '';
        const subject = parsed.subject || '';
        if (!isAwsEmail({ from, subject })) continue;
        const messageId =
          (parsed.messageId || '').trim() ||
          `${box.user}:${uid}`; // fallback estável por caixa+uid
        out.push({
          messageId,
          mailbox: box.user,
          from,
          fromAddress: extractAddress(from),
          subject,
          date: (parsed.date || new Date()).toISOString(),
          text: (parsed.text || parsed.html || '').toString().slice(0, 20000),
        });
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => {});
  }
  return out;
}

/**
 * Percorre todas as caixas configuradas e agrega os e-mails da AWS.
 * Falha suave por caixa: erro numa não derruba as outras.
 * @param {{host:string, port:number, mailboxes:Array}} config
 * @param {object} [opts]
 * @returns {Promise<{emails:Array, errors:Array<{user:string,error:string}>}>}
 */
async function fetchAllAwsEmails(config, opts = {}) {
  const emails = [];
  const errors = [];
  for (const mb of config.mailboxes || []) {
    if (!mb.password) {
      errors.push({ user: mb.user, error: 'sem senha configurada' });
      continue;
    }
    try {
      const box = { host: config.host, port: config.port, user: mb.user, password: mb.password };
      const found = await fetchAwsEmailsFromBox(box, opts);
      emails.push(...found);
    } catch (err) {
      errors.push({ user: mb.user, error: err.message });
    }
  }
  return { emails, errors };
}

module.exports = { fetchAwsEmailsFromBox, fetchAllAwsEmails };
