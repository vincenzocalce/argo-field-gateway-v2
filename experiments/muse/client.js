'use strict';

const { createHash, randomUUID } = require('node:crypto');
const MODEL = 'meta/muse-spark-open';
const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
const PROMPT_VERSION = 'v4-generalized';
const PROMPT = require('node:fs').readFileSync(require('node:path').join(__dirname, 'prompts/v4-generalized.txt'), 'utf8');
const hash = value => createHash('sha256').update(value).digest('hex');
const fail = code => { throw new Error(code); };
const keys = (obj, expected) => obj && !Array.isArray(obj) && typeof obj === 'object' &&
  Object.keys(obj).sort().join(',') === [...expected].sort().join(',');

function validate(value) {
  if (!keys(value, ['date', 'rows', 'anomalies'])) fail('INVALID_RESULT');
  if (value.date !== null && (typeof value.date !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(value.date) ||
      !Number.isFinite(Date.parse(value.date)) ||
      new Date(value.date).toISOString().slice(0, 10) !== value.date)) fail('INVALID_DATE');
  if (!Array.isArray(value.rows) || value.rows.length > 100) fail('INVALID_ROWS');
  for (const row of value.rows) {
    if (!keys(row, ['area', 'operator', 'plate', 'secco_kg', 'umido_kg'])) fail('INVALID_ROW');
    for (const key of ['area', 'operator', 'plate']) {
      if (row[key] !== null && (typeof row[key] !== 'string' || !row[key].trim() || row[key].length > 200)) fail('INVALID_TEXT_FIELD');
    }
    for (const key of ['secco_kg', 'umido_kg']) {
      if (row[key] !== null && (typeof row[key] !== 'number' || !Number.isFinite(row[key]) || row[key] < 0)) fail('INVALID_WEIGHT');
    }
  }
  if (!Array.isArray(value.anomalies) || value.anomalies.length > 100 ||
      value.anomalies.some(x => typeof x !== 'string' || x.length > 1000)) fail('INVALID_ANOMALIES');
  return value;
}

function imagePart(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length > 2 * 1024 * 1024) fail('INVALID_IMAGE');
  const mime = bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) ? 'image/png' :
    bytes.length >= 3 && bytes.subarray(0, 3).equals(Buffer.from('ffd8ff', 'hex')) ? 'image/jpeg' : null;
  if (!mime) fail('INVALID_IMAGE');
  return { type: 'image_url', image_url: { url: `data:${mime};base64,${bytes.toString('base64')}` } };
}

async function extract({ text, image, enabled = false, apiKey, fetchImpl = globalThis.fetch }) {
  if (!enabled) fail('EXPERIMENT_DISABLED');
  if (typeof apiKey !== 'string' || !apiKey.trim() || /[\r\n]/.test(apiKey)) fail('API_KEY_REQUIRED');
  if (typeof text !== 'string' || !text.trim() || Buffer.byteLength(text) > 16000) fail('INVALID_INPUT');
  const content = [{ type: 'text', text }];
  if (image !== undefined) content.push(imagePart(image));
  const started = performance.now();
  let response, body;
  try {
    response = await fetchImpl(ENDPOINT, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(60000),
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODEL, messages: [
        { role: 'system', content: PROMPT }, { role: 'user', content }
      ], temperature: 0, max_tokens: 4096, response_format: { type: 'json_object' },
      provider: { allow_fallbacks: false, require_parameters: true } })
    });
    if (!response.ok) fail('PROVIDER_HTTP_ERROR');
    body = await response.json();
  } catch (error) {
    if (error.message === 'PROVIDER_HTTP_ERROR') throw error;
    fail('PROVIDER_REQUEST_FAILED');
  }
  // Reject provider substitution, truncation, tool calls and non-JSON output.
  if (body.model !== MODEL) fail('MODEL_MISMATCH');
  const choice = body.choices?.[0];
  if (choice?.finish_reason !== 'stop' || choice.message?.tool_calls?.length) fail('INCOMPLETE_RESULT');
  const raw = choice.message?.content;
  if (typeof raw !== 'string' || Buffer.byteLength(raw) > 128000) fail('INVALID_RESULT');
  let result;
  try { result = JSON.parse(raw); } catch { fail('INVALID_JSON'); }
  validate(result);
  const missing = result.rows.flatMap((row, i) => Object.keys(row)
    .filter(key => row[key] === null).map(key => `rows[${i}].${key}`));
  if (result.date === null) missing.unshift('date');
  return {
    experiment: 'argo-muse-v0.1', run_id: randomUUID(), timestamp: new Date().toISOString(),
    mode: fetchImpl === globalThis.fetch ? 'LIVE' : 'SIMULATED', provider: 'openrouter', requested_model: MODEL, returned_model: body.model,
    prompt_version: PROMPT_VERSION, prompt_text: PROMPT, prompt_sha256: hash(PROMPT),
    source_text: text, source_lines: text.split(/\r\n|\n|\r/), input_sha256: hash(text), image_sha256: image ? hash(image) : null,
    result_sha256: hash(JSON.stringify(result)), duration_ms: Math.round(performance.now() - started),
    tokens: {
      input: Number.isSafeInteger(body.usage?.prompt_tokens) ? body.usage.prompt_tokens : null,
      output: Number.isSafeInteger(body.usage?.completion_tokens) ? body.usage.completion_tokens : null
    },
    reported_cost: typeof body.usage?.cost === 'number' && Number.isFinite(body.usage.cost) ? body.usage.cost : null,
    review_required: true, eligible_for_import: false, missing, result
  };
}

module.exports = { extract, validate, imagePart, MODEL, ENDPOINT, PROMPT, PROMPT_VERSION, hash };
