'use strict';

const {
  EventBridgeClient,
  PutRuleCommand,
  DescribeRuleCommand,
} = require('@aws-sdk/client-eventbridge');

const eb = new EventBridgeClient({ region: process.env.AWS_REGION || 'us-east-1' });
const RULE_NAME = process.env.SCAN_RULE_NAME || '';

/**
 * Atualiza a frequência do scan automático (regra do EventBridge) para rate(N hour[s]).
 * Só altera a expressão de agendamento; mantém os targets (que são gerenciados à parte).
 * Falha suave: se não houver RULE_NAME ou der erro, retorna { ok:false, error }.
 * @param {number} hours 1..24
 * @returns {Promise<{ok:boolean, schedule?:string, error?:string}>}
 */
async function updateScanInterval(hours) {
  const h = Math.min(24, Math.max(1, Math.round(Number(hours) || 1)));
  if (!RULE_NAME) return { ok: false, error: 'SCAN_RULE_NAME não definido' };
  const schedule = `rate(${h} ${h === 1 ? 'hour' : 'hours'})`;
  try {
    // Preserva o estado atual (ENABLED/DISABLED) se possível.
    let state = 'ENABLED';
    try {
      const desc = await eb.send(new DescribeRuleCommand({ Name: RULE_NAME }));
      if (desc && desc.State) state = desc.State;
    } catch (_) {
      // segue com ENABLED
    }
    await eb.send(
      new PutRuleCommand({
        Name: RULE_NAME,
        ScheduleExpression: schedule,
        State: state,
      })
    );
    return { ok: true, schedule };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

module.exports = { updateScanInterval, RULE_NAME };
