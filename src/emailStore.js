'use strict';

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  ScanCommand,
  UpdateCommand,
} = require('@aws-sdk/lib-dynamodb');

const base = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });
const ddb = DynamoDBDocumentClient.from(base);
const TABLE = process.env.EMAILS_TABLE || 'mbf-prod-aws-emails';

/**
 * Verifica se um e-mail já foi processado (dedupe por messageId).
 * @param {string} messageId
 * @returns {Promise<boolean>}
 */
async function exists(messageId) {
  const res = await ddb.send(
    new GetCommand({ TableName: TABLE, Key: { messageId }, ProjectionExpression: 'messageId' })
  );
  return Boolean(res.Item);
}

/**
 * Persiste um e-mail processado apenas se ainda não existir (dedupe atômico).
 * @param {object} item registro completo (deve conter messageId)
 * @returns {Promise<boolean>} true se gravou, false se já existia
 */
async function putIfNew(item) {
  if (!item || !item.messageId) throw new Error('messageId obrigatório');
  try {
    await ddb.send(
      new PutCommand({
        TableName: TABLE,
        Item: item,
        ConditionExpression: 'attribute_not_exists(messageId)',
      })
    );
    return true;
  } catch (err) {
    if (err.name === 'ConditionalCheckFailedException') return false;
    throw err;
  }
}

/**
 * Lista e-mails processados, ordenados por data (desc). Scan simples — volume baixo.
 * @param {number} [limit=200]
 * @returns {Promise<Array<object>>}
 */
async function list(limit = 200) {
  const res = await ddb.send(new ScanCommand({ TableName: TABLE }));
  const items = (res.Items || []).filter((it) => it.type !== 'scanlog');
  items.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  return items.slice(0, limit);
}

/**
 * Marca um e-mail como lido.
 * @param {string} messageId
 * @returns {Promise<void>}
 */
async function markRead(messageId) {
  await ddb.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { messageId },
      UpdateExpression: 'SET #r = :t',
      ExpressionAttributeNames: { '#r': 'read' },
      ExpressionAttributeValues: { ':t': true },
    })
  );
}

/**
 * Busca um e-mail pelo messageId (item completo, inclui o body).
 * @param {string} messageId
 * @returns {Promise<object|null>}
 */
async function getById(messageId) {
  const res = await ddb.send(new GetCommand({ TableName: TABLE, Key: { messageId } }));
  return res.Item || null;
}

/**
 * Grava o resultado da análise da IA num e-mail já coletado.
 * @param {string} messageId
 * @param {{assuntoPt:string, resumo:string, acoes:string[], urgencia:string, prazo:string}} analysis
 * @returns {Promise<void>}
 */
async function updateAnalysis(messageId, analysis) {
  await ddb.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { messageId },
      UpdateExpression:
        'SET analyzed = :a, assuntoPt = :s, resumo = :r, acoes = :ac, urgencia = :u, prazo = :p, analyzedAt = :t',
      ExpressionAttributeValues: {
        ':a': true,
        ':s': analysis.assuntoPt || '',
        ':r': analysis.resumo || '',
        ':ac': Array.isArray(analysis.acoes) ? analysis.acoes : [],
        ':u': analysis.urgencia || 'informativo',
        ':p': analysis.prazo || '',
        ':t': new Date().toISOString(),
      },
    })
  );
}

// Prefixo usado no messageId para diferenciar registros de LOG de scan dos e-mails reais.
const SCANLOG_PREFIX = 'scanlog#';

/**
 * Grava um registro de log de uma execução de scan (conexão IMAP + coleta).
 * Reaproveita a tabela de e-mails: o item usa messageId = "scanlog#<timestamp>" para
 * não colidir com e-mails reais (que têm Message-ID normais).
 * @param {{scanned:number, novos:number, erros:Array, boxes?:Array, trigger?:string}} result
 * @returns {Promise<object>} o registro gravado
 */
async function putScanLog(result) {
  const now = new Date().toISOString();
  const erros = Array.isArray(result.erros) ? result.erros : [];
  const record = {
    messageId: `${SCANLOG_PREFIX}${now}`,
    type: 'scanlog',
    finishedAt: now,
    // date usado só para ordenação no list() de e-mails; aqui é inofensivo pois filtramos por prefixo.
    date: now,
    trigger: result.trigger || 'manual',
    ok: erros.length === 0,
    scanned: Number(result.scanned || 0),
    novos: Number(result.novos || 0),
    erros,
    boxes: Array.isArray(result.boxes) ? result.boxes : [],
  };
  try {
    await ddb.send(new PutCommand({ TableName: TABLE, Item: record }));
  } catch (err) {
    // Log não deve derrubar o scan: falha suave.
    console.error('Falha ao gravar scan log:', err.message);
  }
  return record;
}

/**
 * Lista os registros de log de scan mais recentes (desc por finishedAt).
 * @param {number} [limit=20]
 * @returns {Promise<Array<object>>}
 */
async function listScanLogs(limit = 20) {
  const res = await ddb.send(
    new ScanCommand({
      TableName: TABLE,
      FilterExpression: '#t = :t',
      ExpressionAttributeNames: { '#t': 'type' },
      ExpressionAttributeValues: { ':t': 'scanlog' },
    })
  );
  const items = res.Items || [];
  items.sort((a, b) => String(b.finishedAt || '').localeCompare(String(a.finishedAt || '')));
  return items.slice(0, limit);
}

module.exports = {
  exists,
  putIfNew,
  list,
  markRead,
  getById,
  updateAnalysis,
  putScanLog,
  listScanLogs,
  TABLE,
};
