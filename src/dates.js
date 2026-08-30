'use strict';

/**
 * Helpers de intervalo de mês (puros, sem dependência de AWS SDK — testáveis isoladamente).
 */

/**
 * Retorna o primeiro e último dia (exclusivo) do mês informado.
 * @param {Date} ref data de referência
 * @returns {{Start: string, End: string, label: string}} datas YYYY-MM-DD
 */
function monthRange(ref) {
  const y = ref.getUTCFullYear();
  const m = ref.getUTCMonth();
  const start = new Date(Date.UTC(y, m, 1));
  const end = new Date(Date.UTC(y, m + 1, 1)); // Cost Explorer End é exclusivo
  const fmt = (d) => d.toISOString().slice(0, 10);
  const label = `${y}-${String(m + 1).padStart(2, '0')}`;
  return { Start: fmt(start), End: fmt(end), label };
}

/**
 * Constrói o range de um mês a partir de um label "YYYY-MM".
 * Se o label for inválido, cai no mês atual (UTC).
 * @param {string} label ex.: "2026-08"
 * @returns {{Start: string, End: string, label: string}}
 */
function monthRangeFromLabel(label) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(label || ''));
  if (!m) return monthRange(new Date());
  const year = Number(m[1]);
  const month = Number(m[2]) - 1; // 0-based
  if (month < 0 || month > 11) return monthRange(new Date());
  return monthRange(new Date(Date.UTC(year, month, 1)));
}

/**
 * Normaliza a unidade do UsageQuantity. A AWS às vezes retorna "N/A"
 * (típico no agrupamento por SERVICE) — nesse caso tratamos como sem unidade.
 * @param {string|undefined} unit
 * @returns {string}
 */
function cleanUnit(unit) {
  if (!unit) return '';
  const u = String(unit).trim();
  if (!u || u.toUpperCase() === 'N/A') return '';
  return u;
}

module.exports = { monthRange, monthRangeFromLabel, cleanUnit };
