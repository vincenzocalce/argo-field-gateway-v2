'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { mkdtempSync, writeFileSync, existsSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { extract, validate, imagePart, MODEL, ENDPOINT } = require('./client');
const { evaluate } = require('./evaluate');
const expected = require('./expected.json');
const sample = () => ({ date: expected.missing.date, rows: structuredClone(expected.missing.rows), anomalies: [] });
const envelope = result => ({ model: MODEL, choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(result) } }], usage: { prompt_tokens: 45, completion_tokens: 30, cost: 0.0001 } });
const options = extra => ({ text: 'messaggio sintetico', enabled: true, apiKey: 'synthetic-test-key', ...extra });
const mock = body => async () => ({ ok: true, json: async () => body });

test('disabled and missing credentials prevent every network call', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; throw new Error('must not run'); };
  await assert.rejects(extract(options({ enabled: false, fetchImpl })), /EXPERIMENT_DISABLED/);
  await assert.rejects(extract(options({ apiKey: '', fetchImpl })), /API_KEY_REQUIRED/);
  assert.equal(calls, 0);
});
test('oversized inputs and invalid images fail before the network', async () => {
  const fetchImpl = () => assert.fail('network');
  await assert.rejects(extract(options({ text: 'a'.repeat(16001), fetchImpl })), /INVALID_INPUT/);
  await assert.rejects(extract(options({ image: Buffer.from('bad'), fetchImpl })), /INVALID_IMAGE/);
  assert.throws(() => imagePart(Buffer.alloc(2097153)), /INVALID_IMAGE/);
});
test('request pins model, caps tokens, forbids redirects and sends no tools', async () => {
  let sent;
  await extract(options({ fetchImpl: async (url, config) => {
    assert.equal(url, ENDPOINT); assert.equal(config.redirect, 'error');
    assert.equal(config.headers.Authorization, 'Bearer synthetic-test-key');
    sent = JSON.parse(config.body);
    return { ok: true, json: async () => envelope(sample()) };
  } }));
  assert.equal(sent.model, MODEL); assert.equal(sent.max_tokens, 4096);
  assert.equal(sent.tools, undefined); assert.equal(sent.provider.allow_fallbacks, false);
});
test('missing values remain null and every output requires review', async () => {
  const r = await extract(options({ fetchImpl: mock(envelope(sample())) }));
  assert.deepEqual(r.missing, ['rows[0].plate', 'rows[0].umido_kg']);
  assert.equal(r.review_required, true); assert.equal(r.eligible_for_import, false);
  assert.equal(r.mode, 'LIVE'); assert.equal(r.input_sha256.length, 64);
  assert.equal(r.result.rows[0].plate, null);
  assert.equal(JSON.stringify(r).includes('synthetic-test-key'), false);
});
test('image payload and distinct image hash are captured', async () => {
  // Minimal signature fixture tests transport, not actual vision decoding.
  const image = Buffer.from('89504e470d0a1a0a', 'hex');
  const r = await extract(options({ image, fetchImpl: async (_, config) => {
    const part = JSON.parse(config.body).messages[1].content[1];
    assert.match(part.image_url.url, /^data:image\/png;base64,/);
    return { ok: true, json: async () => envelope(sample()) };
  } }));
  assert.equal(r.image_sha256.length, 64);
});
test('provider errors never expose response bodies or credentials', async () => {
  await assert.rejects(extract(options({ fetchImpl: async () => ({ ok: false, json: () => assert.fail('read error body') }) })), /^Error: PROVIDER_HTTP_ERROR$/);
  await assert.rejects(extract(options({ fetchImpl: async () => { throw new Error('secret'); } })), /^Error: PROVIDER_REQUEST_FAILED$/);
});
test('truncation, substituted model and tool calls are rejected', async () => {
  for (const change of [b => { b.model = 'other'; }, b => { b.choices[0].finish_reason = 'length'; }, b => { b.choices[0].message.tool_calls = [{}]; }]) {
    const body = envelope(sample()); change(body);
    await assert.rejects(extract(options({ fetchImpl: mock(body) })), /MODEL_MISMATCH|INCOMPLETE_RESULT/);
  }
});
test('malformed JSON and invalid structured values fail closed', async () => {
  const b = envelope(sample()); b.choices[0].message.content = 'not JSON';
  await assert.rejects(extract(options({ fetchImpl: mock(b) })), /INVALID_JSON/);
  for (const mutate of [v => { v.date = '2026-02-30'; }, v => { v.rows[0].secco_kg = -1; }, v => { v.rows[0].plate = 42; }, v => { v.rows[0].extra = 'data'; }, v => { v.anomalies = [4]; }]) {
    const value = sample(); mutate(value); assert.throws(() => validate(value), /INVALID/);
  }
});
test('fixture evaluator catches invented missing values and collapsed conflicts', () => {
  const report = { result: sample(), review_required: true, eligible_for_import: false };
  assert.equal(evaluate(report, 'missing').passed, true);
  report.result.rows[0].plate = 'INVENTED';
  assert.equal(evaluate(report, 'missing').passed, false);
  report.result = { date: expected.conflict.date, rows: [expected.conflict.rows[0]], anomalies: ['conflitto'] };
  assert.equal(evaluate(report, 'conflict').passed, false);
});
test('CLI refuses overwrite and leaves input and existing evidence intact', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'argo-muse-'));
  try {
    const input = path.join(dir, 'input.txt'), output = path.join(dir, 'output.json');
    writeFileSync(input, 'synthetic'); writeFileSync(output, 'original');
    const run = spawnSync(process.execPath, [path.join(__dirname, 'run.js'), input, output], { encoding: 'utf8' });
    assert.equal(run.status, 1);
    assert.equal(require('node:fs').readFileSync(output, 'utf8'), 'original');
    const fresh = path.join(dir, 'new.json');
    const disabled = spawnSync(process.execPath, [path.join(__dirname, 'run.js'), input, fresh], { encoding: 'utf8', env: { ...process.env, ARGO_MUSE_EXPERIMENT_ENABLED: 'false' } });
    assert.equal(disabled.status, 1); assert.equal(existsSync(fresh), false);
  } finally { rmSync(dir, { recursive: true }); }
});
