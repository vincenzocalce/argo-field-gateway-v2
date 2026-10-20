'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { hash } = require('./client');
const { compare, verifyReport } = require('./benchmark-v1/score');
const { verifyCorpus, syntheticReport, selfCheck, prepare, evaluateBatch } = require('./benchmark-v1/cli');
const corpus = require('./benchmark-v1/corpus.json');
const byId = id => corpus.cases.find(c => c.id === id);
const withTemp = fn => { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'argo-bench-')); try { fn(dir); } finally { fs.rmSync(dir, {recursive:true, force:true}); } };
test('frozen corpus has at least 30 unique sources separate from legacy fixtures', () => {
  const v = verifyCorpus(); assert.equal(v.cases,36); assert.equal(v.expected_rows,57);
  assert.equal(v.exact_or_whitespace_normalized_fixture_overlap,0);
  for (const c of corpus.cases) assert.equal(c.independent_review.status,'PENDING');
});
test('36 synthetic oracle controls and 12 injected failures verify the scorer, not Muse', () => {
  const check = selfCheck(); assert.equal(check.passed,true); assert.equal(check.exact_controls.length,36);
  assert.equal(check.mutation_controls.length,12); assert.equal(check.actual_model_runs,0);
  assert.equal(check.model_accuracy_status,'NOT_VALIDATED');
});
test('insertion or omission does not turn all following exact rows into alterations', () => {
  const c = byId('B002'), r = syntheticReport(c);
  r.result.rows.splice(1,1); let s=compare(r,c);
  assert.equal(s.metrics.missing_rows,1); assert.equal(s.metrics.altered_values,0);
  r.result.rows.splice(1,0,{area:'Finta',operator:'Alias Nuovo',plate:null,secco_kg:8,umido_kg:null});
  // An unrelated residual row is paired by the declared diagnostic convention.
  s=compare(r,c); assert.equal(s.metrics.altered_values,3);
  assert.equal(s.deterministic.passed,false);
});
test('extra duplicate, even containing nulls, fails exactness and preserves multiplicity', () => {
  const c=byId('B007'),r=syntheticReport(c); r.result.rows.push(structuredClone(r.result.rows[0]));
  const s=compare(r,c); assert.equal(s.metrics.extra_rows,1); assert.equal(s.metrics.invented_values,4);
  assert.equal(s.deterministic.passed,false);
});
test('an irrelevant anomaly can satisfy presence only, never semantic validation', () => {
  const c=byId('B025'),r=syntheticReport(c);r.result.anomalies=['Nota irrilevante'];
  const s=compare(r,c);assert.equal(s.deterministic.passed,true);
  assert.equal(s.semantic_review_status,'PENDING');assert.equal(s.model_accuracy_status,'NOT_VALIDATED');
  r.result.anomalies=['   '];assert.equal(compare(r,c).anomaly_presence_only,false);
});
test('provenance rejects wrong case, prompt, model, modality, unsafe flags and hashes', () => {
  const c=byId('B001');
  for(const mutate of [r=>{r.source_text+='x';},r=>{r.source_lines=[];},r=>{r.prompt_text+='x';},r=>{r.prompt_version='v4-Mac';},r=>{r.returned_model='other';},r=>{r.image_sha256='abc';},r=>{r.eligible_for_import=true;},r=>{r.review_required=false;},r=>{r.result_sha256='bad';},r=>{r.run_id='';}]) {
    const r=syntheticReport(c);mutate(r);assert.throws(()=>verifyReport(r,c,'SIMULATED'));
  }
});
test('invalid schema is rejected before detailed scoring', () => {
  const c=byId('B001'),r=syntheticReport(c);r.result.rows[0].secco_kg=-1;
  assert.throws(()=>compare(r,c),/INVALID_WEIGHT/);
});
test('empty evaluation has null accuracy and cost, with full missing coverage visible', () => withTemp(dir=>{
  const r=evaluateBatch(dir,'LIVE');assert.equal(r.summary.planned,108);assert.equal(r.summary.not_run,108);
  assert.equal(r.summary.coverage,0);assert.equal(r.summary.exact_field_rate_attempted,null);
  assert.equal(r.summary.reported_cost_sum,null);assert.equal(r.model_accuracy_status,'NOT_VALIDATED');
}));
test('simulated reports cannot be included as LIVE evidence', () => withTemp(dir=>{
  fs.writeFileSync(path.join(dir,'B001.r1.json'),JSON.stringify(syntheticReport(byId('B001'))));
  const r=evaluateBatch(dir,'LIVE',1);assert.equal(r.summary.valid,0);assert.equal(r.summary.invalid,1);
  assert.equal(r.summary.not_run,35);assert.equal(r.summary.exact_field_rate_attempted,0);
}));
test('failed and malformed attempts stay in denominators and cost remains unknown', () => withTemp(dir=>{
  const c=byId('B001'),r=syntheticReport(c);
  fs.writeFileSync(path.join(dir,'B001.r1.json'),JSON.stringify({status:'CALL_FAILED',mode:'LIVE',case_id:c.id,input_sha256:r.input_sha256,prompt_sha256:r.prompt_sha256,timestamp:r.timestamp,error_code:'INVALID_JSON'}));
  fs.writeFileSync(path.join(dir,'B002.r1.json'),'not-json');
  const s=evaluateBatch(dir,'LIVE',1).summary;assert.equal(s.call_failed,1);assert.equal(s.invalid,1);
  assert.equal(s.expected_fields_attempted,27);assert.equal(s.costs_unknown,2);
  assert.equal(s.exact_field_rate_attempted,0);assert.equal(s.reported_cost_sum,null);
}));
test('duplicate run IDs rejected, variability requires distinct valid runs', () => withTemp(dir=>{
  const c=byId('B001'),r=syntheticReport(c);
  fs.writeFileSync(path.join(dir,'B001.r1.json'),JSON.stringify(r));
  fs.writeFileSync(path.join(dir,'B001.r2.json'),JSON.stringify(r));
  let s=evaluateBatch(dir,'SIMULATED');assert.equal(s.summary.invalid,1);assert.equal(s.variability[0].distinct_structured_results,null);
  r.run_id='second';r.result.rows[0].secco_kg=444;r.result_sha256=hash(JSON.stringify(r.result));
  fs.writeFileSync(path.join(dir,'B001.r2.json'),JSON.stringify(r));
  s=evaluateBatch(dir,'SIMULATED');assert.equal(s.summary.invalid,0);assert.equal(s.variability[0].distinct_structured_results,2);
  assert.equal(s.summary.altered_values,1);
}));
test('prepare creates source-only inputs and refuses overwriting an existing experiment', () => withTemp(dir=>{
  const dest=path.join(dir,'new-run');const p=prepare(dest);assert.equal(p.planned_calls,108);assert.equal(p.actual_calls,0);
  const plan=JSON.parse(fs.readFileSync(path.join(dest,'plan.json')));assert.equal(plan.jobs.length,108);
  assert.equal(fs.readFileSync(plan.jobs[0].input,'utf8'),byId('B001').source_text);
  assert.deepEqual(fs.readdirSync(path.join(dest,'reports')),[]);
  assert.throws(()=>prepare(dest),/EEXIST/);
}));
