'use strict';

const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
const { isAwsEmail, extractAddress } = require('./awsSenderFilter');

/**
 * Conecta em UMA caixa IMAP (read-only), busca e-mails e devolve os que batem
 * no filtro (AWS padrão ou remetentes personalizados). Não apaga nem move nada.
 *
 * @param {{host:string, port:number, user:string, password:string}} box
 * @param {{max?:number, senders?:string[]}} [opts]
 * @returns {Promise<Array<{messageId,from,fromAddress,subject,date,text}>>}
 */
async function fetchAwsEmailsFromBox(box, opts = {}) {
  const max = opts.max || 500;
  const senders = opts.senders;
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
      // Varre a caixa TODA (lidos e não lidos). Pega os mais recentes até o teto `max`.
      const status = await client.status('INBOX', { messages: true });
      const total = (status && status.messages) || 0;
      if (total > 0) {
        const start = Math.max(1, total - max + 1);
        const range = `${start}:*`; // sequência: últimos `max` da caixa
        for await (const msg of client.fetch(range, { source: true })) {
          if (!msg || !msg.source) continue;
          const parsed = await simpleParser(msg.source);
          const from = parsed.from?.text || '';
          const subject = parsed.subject || '';
          if (!isAwsEmail({ from, subject }, senders)) continue;
          const messageId =
            (parsed.messageId || '').trim() ||
            `${box.user}:${msg.seq}`; // fallback estável por caixa+seq
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
      const found = await fetchAwsEmailsFromBox(box, { ...opts, senders: config.senders });
      emails.push(...found);
    } catch (err) {
      errors.push({ user: mb.user, error: err.message });
    }
  }
  return { emails, errors };
}

module.exports = { fetchAwsEmailsFromBox, fetchAllAwsEmails };
