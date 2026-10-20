'use strict';
const { isDeepStrictEqual } = require('node:util');
const { evaluateTarget } = require('../evaluate');
const { hash, validate, MODEL, PROMPT, PROMPT_VERSION } = require('../client');
const FIELDS = ['area', 'operator', 'plate', 'secco_kg', 'umido_kg'];

// First consume exact rows as a multiset (including repeated rows). Align the
// residual sequences with unit field substitution and five-slot row gaps.
// This is an auditable diagnostic convention, not inferred event identity.
function alignRows(expected, actual) {
  const unused = new Set(actual.map((_, i) => i));
  const pairs = [], left = [];
  expected.forEach((row, i) => {
    const j = [...unused].find(k => isDeepStrictEqual(row, actual[k]));
    if (j === undefined) left.push(i); else { unused.delete(j); pairs.push([i, j]); }
  });
  const right = [...unused];
  const dp = Array.from({ length: left.length + 1 }, () => Array(right.length + 1).fill(0));
  for (let i = left.length; i >= 0; i--) for (let j = right.length; j >= 0; j--) {
    if (i === left.length) dp[i][j] = 5 * (right.length - j);
    else if (j === right.length) dp[i][j] = 5 * (left.length - i);
    else dp[i][j] = Math.min(
      FIELDS.filter(f => expected[left[i]][f] !== actual[right[j]][f]).length + dp[i + 1][j + 1],
      5 + dp[i + 1][j], 5 + dp[i][j + 1]);
  }
  let i = 0, j = 0;
  while (i < left.length || j < right.length) {
    const cost = i < left.length && j < right.length ? FIELDS.filter(f => expected[left[i]][f] !== actual[right[j]][f]).length : Infinity;
    if (i < left.length && j < right.length && dp[i][j] === cost + dp[i + 1][j + 1]) pairs.push([left[i++], right[j++]]);
    else if (i < left.length && dp[i][j] === 5 + dp[i + 1][j]) pairs.push([left[i++], null]);
    else pairs.push([null, right[j++]]);
  }
  return pairs.sort((a, b) => (a[0] ?? Infinity) - (b[0] ?? Infinity) || a[1] - b[1]);
}

function compare(report, specimen) {
  const base = evaluateTarget(report, specimen.expected, specimen.id);
  const e = specimen.expected, a = report.result;
  const metrics = { expected_fields: 1 + 5 * e.rows.length, exact_fields: 0,
    omitted_fields: 0, omitted_known_values: 0, altered_values: 0, invented_values: 0,
    missing_rows: 0, extra_rows: 0, reordered: false };
  const differences = [];
  function cell(path, wanted, got, actualPath = path, missing = false, extra = false) {
    if (!missing && !extra && wanted === got) { metrics.exact_fields++; return; }
    let kind;
    if (missing) { metrics.omitted_fields++; if (wanted !== null) metrics.omitted_known_values++; kind = 'OMITTED_FIELD'; }
    else if (extra || wanted === null) { if (got !== null) metrics.invented_values++; kind = got === null ? 'EXTRA_NULL_FIELD' : 'INVENTED_VALUE'; }
    else if (got === null) { metrics.omitted_fields++; metrics.omitted_known_values++; kind = 'OMITTED_VALUE'; }
    else { metrics.altered_values++; kind = 'ALTERED_VALUE'; }
    differences.push({ kind, expected_path: path, actual_path: actualPath, expected: wanted, actual: got });
  }
  cell('date', e.date, a.date);
  const alignment = alignRows(e.rows, a.rows);
  for (const [i, j] of alignment) {
    if (i === null) metrics.extra_rows++;
    if (j === null) metrics.missing_rows++;
    for (const f of FIELDS) cell(i === null ? null : `rows[${i}].${f}`,
      i === null ? null : e.rows[i][f], j === null ? null : a.rows[j][f],
      j === null ? null : `rows[${j}].${f}`, j === null, i === null);
  }
  const matchedOrder = alignment.filter(([i, j]) => i !== null && j !== null).map(([, j]) => j);
  metrics.reordered = matchedOrder.some((j, i) => i > 0 && j < matchedOrder[i - 1]);
  metrics.exact_field_rate = metrics.exact_fields / metrics.expected_fields;
  return { case_id: specimen.id, deterministic: base, metrics, alignment, differences,
    semantic_review_status: 'PENDING', required_anomaly_concepts: specimen.anomaly_review.required_concepts,
    anomaly_presence_only: !e.conflict_required || a.anomalies.some(s => s.trim().length > 0),
    model_accuracy_status: 'NOT_VALIDATED', review_required: true, eligible_for_import: false };
}

function verifyReport(report, specimen, mode) {
  if (!['LIVE', 'SIMULATED'].includes(mode) || report.mode !== mode) throw Error('MODE_MISMATCH');
  if (report.source_text !== specimen.source_text || report.input_sha256 !== hash(specimen.source_text) ||
      !isDeepStrictEqual(report.source_lines, specimen.source_text.split(/\r\n|\n|\r/))) throw Error('SOURCE_MISMATCH');
  if (report.prompt_version !== PROMPT_VERSION || report.prompt_text !== PROMPT || report.prompt_sha256 !== hash(PROMPT)) throw Error('PROMPT_MISMATCH');
  if (report.requested_model !== MODEL || report.returned_model !== MODEL || report.provider !== 'openrouter' || report.image_sha256 !== null) throw Error('MODEL_OR_MODALITY_MISMATCH');
  if (report.review_required !== true || report.eligible_for_import !== false) throw Error('UNSAFE_FLAGS');
  if (typeof report.run_id !== 'string' || !report.run_id || !Number.isFinite(Date.parse(report.timestamp))) throw Error('RUN_METADATA_MISSING');
  validate(report.result);
  if (report.result_sha256 !== hash(JSON.stringify(report.result))) throw Error('RESULT_HASH_MISMATCH');
}
module.exports = { FIELDS, alignRows, compare, verifyReport };
