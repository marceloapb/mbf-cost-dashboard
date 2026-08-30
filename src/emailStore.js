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
  const res = await ddb.send(new ScanCommand({ TableName: TABLE, Limit: limit }));
  const items = res.Items || [];
  items.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  return items;
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

module.exports = { exists, putIfNew, list, markRead, TABLE };
