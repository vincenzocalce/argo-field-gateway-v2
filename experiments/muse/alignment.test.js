'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { extract, validate, hash, PROMPT } = require('./client');
const { evaluate } = require('./evaluate');
const expected = require('./expected.json');
const historical = require('./evidence/2026-10-16/v3-conflict.json');
const report = name => ({result: {date: expected[name].date, rows: structuredClone(expected[name].rows), anomalies:['Conflitto non risolto dalla fonte']}, review_required:true, eligible_for_import:false});
test('historical v3 conflict replay verifies input/result hashes without impersonating a new call', () => {
  assert.equal(hash(fs.readFileSync(path.join(__dirname,'fixtures/conflict.txt'))),historical.input_sha256);
  assert.equal(hash(JSON.stringify(historical.result)),historical.result_sha256);
  assert.equal(evaluate(historical,'conflict').passed,true);
  assert.notEqual(hash(PROMPT),historical.prompt_sha256); // v3 bytes not recovered
});
test('recorded rejected v2 response still fails schema validation', () => {
  const d = require('./evidence/2026-10-16/v2-conflict-diagnostic.json');
  assert.throws(()=>validate(JSON.parse(d.choice.message.content)),/INVALID_RESULT/);
});
test('omission, conflict collapse, reordering and invented null replacements fail exact comparison', () => {
  for (const name of ['complete','missing','conflict','boundaries']) {
    const r=report(name); assert.equal(evaluate(r,name).passed,true);
    r.result.rows.pop(); assert.equal(evaluate(r,name).passed,false);
    assert.equal(evaluate(r,name).row_differences.missing_or_changed,1);
  }
  const reordered=report('boundaries'); reordered.result.rows.reverse();
  assert.equal(evaluate(reordered,'boundaries').passed,false);
  for (const key of ['plate','umido_kg']) {
    const r=report('missing'); r.result.rows[0][key]=key==='plate'?'XX000XX':0;
    assert.equal(evaluate(r,'missing').passed,false);
  }
});
test('identical repeated communications remain two rows, no deduplication', () => {
  const r=report('boundaries'); r.result.rows.splice(1,1);
  assert.equal(evaluate(r,'boundaries').passed,false);
  assert.equal(evaluate(r,'boundaries').row_differences.missing_or_changed,1);
});
test('any arbitrary anomaly does not compensate for an omitted conflict row', () => {
  const r=report('conflict'); r.result.rows.pop(); r.result.anomalies=['unrelated'];
  assert.equal(evaluate(r,'conflict').passed,false);
});
test('simulated transport preserves exact original source and prompt, including whitespace and blank lines', async () => {
  const text='  Area Delta\r\n\r\nOperatore Test: secco 0 kg.  \n';
  const r=await extract({text,enabled:true,apiKey:'synthetic',fetchImpl:async()=>({ok:true,json:async()=>({model:'meta/muse-spark-open',choices:[{finish_reason:'stop',message:{content:JSON.stringify(report('missing').result)}}]})})});
  assert.equal(r.mode,'SIMULATED'); assert.equal(r.source_text,text);
  assert.deepEqual(r.source_lines,['  Area Delta','','Operatore Test: secco 0 kg.  ','']);
  assert.equal(hash(r.source_text),r.input_sha256); assert.equal(hash(r.prompt_text),r.prompt_sha256);
  assert.equal(r.eligible_for_import,false); assert.equal(r.review_required,true);
});
