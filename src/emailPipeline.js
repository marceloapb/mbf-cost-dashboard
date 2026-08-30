'use strict';

const { loadImapConfig } = require('./emailConfig');
const { fetchAllAwsEmails } = require('./imapClient');
const store = require('./emailStore');

/**
 * Coleta (SEM IA): lê as caixas IMAP, filtra por remetente OU palavra-chave de assunto,
 * e grava os e-mails novos com status "pendente" (analyzed=false), guardando o corpo
 * para análise posterior sob demanda. NÃO chama o Bedrock.
 * @param {{max?:number}} [opts]
 * @returns {Promise<{scanned:number, novos:number, erros:Array}>}
 */
async function runScan(opts = {}) {
  const config = await loadImapConfig();
  if (!config.host || !config.mailboxes.length) {
    return { scanned: 0, novos: 0, erros: [{ error: 'IMAP não configurado' }] };
  }
  const { emails, errors } = await fetchAllAwsEmails(config, opts);
  let novos = 0;
  const erros = [...errors];

  for (const mail of emails) {
    try {
      if (await store.exists(mail.messageId)) continue;
      const record = {
        messageId: mail.messageId,
        mailbox: mail.mailbox,
        from: mail.from,
        fromAddress: mail.fromAddress,
        subjectOriginal: mail.subject,
        date: mail.date,
        collectedAt: new Date().toISOString(),
        read: false,
        analyzed: false, // ainda não passou pela IA
        body: (mail.text || '').slice(0, 20000), // guardado para análise sob demanda
      };
      const gravou = await store.putIfNew(record);
      if (gravou) novos += 1;
    } catch (err) {
      erros.push({ messageId: mail.messageId, error: err.message });
    }
  }

  return { scanned: emails.length, novos, erros };
}

module.exports = { runScan };
