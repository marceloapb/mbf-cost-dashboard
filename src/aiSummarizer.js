'use strict';

const {
  BedrockRuntimeClient,
  InvokeModelCommand,
} = require('@aws-sdk/client-bedrock-runtime');
const { buildPrompt, extractModelText, parseAnalysis, URGENCIAS } = require('./aiParse');

const client = new BedrockRuntimeClient({ region: process.env.AWS_REGION || 'us-east-1' });
const MODEL_ID = process.env.BEDROCK_MODEL_ID || 'amazon.nova-lite-v1:0';

/**
 * Analisa um e-mail via Amazon Bedrock (modelos Amazon Nova).
 * Formato Nova: { messages:[{role,content:[{text}]}], inferenceConfig:{maxTokens,temperature} }.
 * @param {{subject:string, from:string, text:string}} email
 * @param {string} [modelId] id do modelo (sobrepõe o default)
 * @returns {Promise<object>}
 */
async function summarizeEmail(email, modelId) {
  const payload = {
    messages: [{ role: 'user', content: [{ text: buildPrompt(email) }] }],
    inferenceConfig: { maxTokens: 1024, temperature: 0.2 },
  };
  const cmd = new InvokeModelCommand({
    modelId: modelId || MODEL_ID,
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify(payload),
  });
  const res = await client.send(cmd);
  const body = JSON.parse(Buffer.from(res.body).toString('utf8'));
  return parseAnalysis(extractModelText(body));
}

module.exports = { summarizeEmail, buildPrompt, parseAnalysis, extractModelText, MODEL_ID, URGENCIAS };
