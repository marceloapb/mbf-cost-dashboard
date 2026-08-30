'use strict';

const {
  BedrockRuntimeClient,
  InvokeModelCommand,
} = require('@aws-sdk/client-bedrock-runtime');
const { buildPrompt, extractModelText, parseAnalysis, URGENCIAS } = require('./aiParse');

const client = new BedrockRuntimeClient({ region: process.env.AWS_REGION || 'us-east-1' });
const MODEL_ID = process.env.BEDROCK_MODEL_ID || 'us.anthropic.claude-haiku-4-5-20251001-v1:0';

/**
 * Analisa um e-mail via Bedrock (Claude). Retorna a análise normalizada.
 * @param {{subject:string, from:string, text:string}} email
 * @returns {Promise<object>}
 */
async function summarizeEmail(email) {
  const payload = {
    anthropic_version: 'bedrock-2023-05-31',
    max_tokens: 1024,
    temperature: 0.2,
    messages: [{ role: 'user', content: [{ type: 'text', text: buildPrompt(email) }] }],
  };
  const cmd = new InvokeModelCommand({
    modelId: MODEL_ID,
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify(payload),
  });
  const res = await client.send(cmd);
  const body = JSON.parse(Buffer.from(res.body).toString('utf8'));
  return parseAnalysis(extractModelText(body));
}

module.exports = { summarizeEmail, buildPrompt, parseAnalysis, extractModelText, MODEL_ID, URGENCIAS };
