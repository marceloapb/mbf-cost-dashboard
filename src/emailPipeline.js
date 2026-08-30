'use strict';

const { loadImapConfig } = require('./emailConfig');
const { fetchAllAwsEmails } = require('./imapClient');
const { summarizeEmail } = require('./aiSummarizer');
const store = require('./emailStore');

/**
 * Executa o pipeline completo: lê as caixas IMAP configuradas, filtra e-mails da AWS,
 * pula os já processados (dedupe), analisa com IA e persiste.
 * @param {{sinceDays?:number, max?:number}} [opts]
 * @returns {Promise<{scanned:number, novos:number, erros:Array}>}
 */
async function runScan(opts = {}) {
  const config = await loadImapConfig();
  if (!config.host || !config.mailboxes.length) {
    return { scanned: 0, novos: 0, erros: [{ error: 'IMAP não configurado' }] };
  }
  const { emails, errors } = await fetchAllAwsEmails(config, opts);
  let novos = 0;
  let analisados = 0;
  const erros = [...errors];
  const limite = config.scanLimit || 100;
  const modelId = config.bedrockModelId;

  for (const mail of emails) {
    try {
      if (await store.exists(mail.messageId)) continue;
      // Teto de segurança: só chama a IA até `limite` e-mails NOVOS por scan.
      if (analisados >= limite) {
        erros.push({ info: `limite de ${limite} por scan atingido; rode novamente para continuar` });
        break;
      }
      analisados += 1;
      const analysis = await summarizeEmail(
        { subject: mail.subject, from: mail.from, text: mail.text },
        modelId
      );
      const record = {
        messageId: mail.messageId,
        mailbox: mail.mailbox,
        from: mail.from,
        fromAddress: mail.fromAddress,
        subjectOriginal: mail.subject,
        date: mail.date,
        processedAt: new Date().toISOString(),
        read: false,
        assuntoPt: analysis.assuntoPt,
        resumo: analysis.resumo,
        acoes: analysis.acoes,
        urgencia: analysis.urgencia,
        prazo: analysis.prazo,
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
