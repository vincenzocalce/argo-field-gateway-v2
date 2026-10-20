'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { hash, validate, PROMPT, PROMPT_VERSION, MODEL } = require('../client');
const { compare, verifyReport } = require('./score');
const ROOT = path.resolve(__dirname, '../../..');
const corpus = require('./corpus.json');
const lock = require('./manifest.json');
const json = x => JSON.stringify(x, null, 2) + '\n';
function verifyCorpus() {
  for (const [file, digest] of Object.entries(lock.files)) {
    if (hash(fs.readFileSync(path.join(ROOT, file))) !== digest) throw Error('FROZEN_FILE_CHANGED: ' + file);
  }
  if (corpus.cases.length < 30 || new Set(corpus.cases.map(c => c.id)).size !== corpus.cases.length) throw Error('INVALID_CORPUS');
  const normalize = s => s.replace(/\s+/g, ' ').trim();
  const old = fs.readdirSync(path.join(__dirname, '../fixtures')).filter(f => f.endsWith('.txt')).map(f => normalize(fs.readFileSync(path.join(__dirname, '../fixtures', f), 'utf8')));
  const seen = new Set();
  for (const c of corpus.cases) {
    validate({ date: c.expected.date, rows: c.expected.rows, anomalies: [] });
    if (!/^B\d{3}$/.test(c.id) || c.synthetic !== true || seen.has(normalize(c.source_text)) || old.includes(normalize(c.source_text))) throw Error('OVERLAP_OR_INVALID_CASE');
    if (!c.reference_rationale || !Array.isArray(c.anomaly_review.required_concepts)) throw Error('MISSING_RUBRIC');
    seen.add(normalize(c.source_text));
  }
  return { cases: corpus.cases.length, expected_rows: corpus.cases.reduce((s, c) => s + c.expected.rows.length, 0),
    exact_or_whitespace_normalized_fixture_overlap: 0, reference_review: corpus.status,
    prompt_version: PROMPT_VERSION, prompt_sha256: hash(PROMPT), corpus_sha256: hash(fs.readFileSync(path.join(__dirname, 'corpus.json'))) };
}
function syntheticReport(c, run = 'oracle') {
  const result = { date: c.expected.date, rows: structuredClone(c.expected.rows),
    anomalies: c.anomaly_review.required_concepts.length ? ['SIMULATED: segnalazione di controllo; semantica non validata'] : [] };
  return { mode: 'SIMULATED', run_id: `${c.id}-${run}`, timestamp: '2026-10-20T00:00:00Z', provider: 'openrouter',
    requested_model: MODEL, returned_model: MODEL, prompt_version: PROMPT_VERSION, prompt_text: PROMPT, prompt_sha256: hash(PROMPT),
    source_text: c.source_text, source_lines: c.source_text.split(/\r\n|\n|\r/), input_sha256: hash(c.source_text), image_sha256: null,
    result_sha256: hash(JSON.stringify(result)), review_required: true, eligible_for_import: false,
    reported_cost: null, duration_ms: null, tokens: { input: null, output: null }, result };
}
function selfCheck() {
  const integrity = verifyCorpus();
  const exact = corpus.cases.map(c => { const r = syntheticReport(c); verifyReport(r, c, 'SIMULATED'); return compare(r, c); });
  const controls = [
    ['row_omission', 'B001', r => r.result.rows.pop(), m => m.missing_rows === 1 && m.omitted_known_values === 5],
    ['field_omission', 'B001', r => { r.result.rows[0].secco_kg = null; }, m => m.omitted_known_values === 1],
    ['weight_alteration', 'B001', r => { r.result.rows[0].secco_kg = 999; }, m => m.altered_values === 1],
    ['invented_plate', 'B013', r => { r.result.rows[0].plate = 'ZZ999ZZ'; }, m => m.invented_values === 1],
    ['null_to_zero', 'B019', r => { r.result.rows[0].umido_kg = 0; }, m => m.invented_values === 1],
    ['zero_to_null', 'B020', r => { r.result.rows[0].umido_kg = null; }, m => m.omitted_known_values === 1],
    ['deduplication', 'B007', r => r.result.rows.pop(), m => m.missing_rows === 1],
    ['collapsed_conflict', 'B025', r => r.result.rows.pop(), m => m.missing_rows === 1],
    ['extra_row', 'B001', r => r.result.rows.push({ area:'Inventata', operator:'Alias fittizio', plate:'ZZ999ZZ', secco_kg:9, umido_kg:1 }), m => m.extra_rows === 1 && m.invented_values === 5],
    ['reordering', 'B001', r => r.result.rows.reverse(), m => m.reordered && m.altered_values === 0],
    ['invented_date', 'B017', r => { r.result.date = '2026-11-04'; }, m => m.invented_values === 1],
    ['territorial_normalization', 'B005', r => { r.result.rows[0].area = 'Agro nocerino-sarnese'; }, m => m.altered_values === 1]
  ].map(([id, caseId, mutate, assertion]) => {
    const c = corpus.cases.find(c => c.id === caseId), report = syntheticReport(c, id); mutate(report);
    report.result_sha256 = hash(JSON.stringify(report.result));
    const comparison = compare(report, c);
    return { id, case_id: caseId, injected_result: report.result, comparison, detected_as_expected: assertion(comparison.metrics) && !comparison.deterministic.passed };
  });
  return { mode: 'SIMULATED_SELF_CHECK', integrity, network_calls: 0, actual_model_runs: 0,
    model_accuracy_status: 'NOT_VALIDATED', review_required: true, eligible_for_import: false,
    explanation: 'Oracle copiati dai riferimenti e alterazioni deliberate: verifica del valutatore, nessuna inferenza del modello.',
    exact_controls: exact, mutation_controls: controls,
    passed: exact.every(x => x.deterministic.passed) && controls.every(x => x.detected_as_expected) };
}
function prepare(dir, repeats = 3) {
  const integrity = verifyCorpus();
  fs.mkdirSync(dir); // Exclusive: existing directories must not be reused.
  fs.mkdirSync(path.join(dir, 'inputs')); fs.mkdirSync(path.join(dir, 'reports'));
  const jobs = [];
  for (let repeat = 1; repeat <= repeats; repeat++) for (const c of corpus.cases) {
    const input = path.join(dir, 'inputs', c.id + '.txt');
    if (repeat === 1) fs.writeFileSync(input, c.source_text, { flag: 'wx', mode: 0o600 });
    jobs.push({ case_id: c.id, repeat, input, output: path.join(dir, 'reports', `${c.id}.r${repeat}.json`), status: 'NOT_RUN' });
  }
  const plan = { benchmark_id: corpus.benchmark_id, ...integrity, repeats, jobs,
    model_accuracy_status: 'NOT_VALIDATED', reference_review: 'PENDING', review_required: true, eligible_for_import: false };
  fs.writeFileSync(path.join(dir, 'plan.json'), json(plan), { flag: 'wx', mode: 0o600 });
  return { ...integrity, planned_calls: jobs.length, actual_calls: 0, plan: path.join(dir, 'plan.json') };
}
function evaluateBatch(dir, mode, repeats = 3) {
  const integrity = verifyCorpus();
  if (!['LIVE', 'SIMULATED'].includes(mode)) throw Error('EXPLICIT_MODE_REQUIRED');
  const results = [], ids = new Set();
  const summary = { planned: corpus.cases.length * repeats, not_run: 0, invalid: 0, call_failed: 0, valid: 0, deterministic_exact: 0,
    expected_fields_attempted: 0, exact_fields: 0, omitted_known_values: 0, altered_values: 0, invented_values: 0,
    reported_cost_sum: null, reports_with_cost: 0, costs_unknown: 0, durations_ms: [] };
  for (let repeat = 1; repeat <= repeats; repeat++) for (const c of corpus.cases) {
    const file = path.join(dir, `${c.id}.r${repeat}.json`);
    if (!fs.existsSync(file)) { summary.not_run++; results.push({ case_id:c.id, repeat, status:'NOT_RUN' }); continue; }
    summary.expected_fields_attempted += 1 + 5 * c.expected.rows.length;
    let report;
    try {
      report = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (report.status === 'CALL_FAILED') {
        if (report.mode !== mode || report.case_id !== c.id || report.input_sha256 !== hash(c.source_text) || report.prompt_sha256 !== hash(PROMPT) || !/^[A-Z_]+$/.test(report.error_code) || !Number.isFinite(Date.parse(report.timestamp))) throw Error('INVALID_FAILURE_RECORD');
        summary.call_failed++; summary.costs_unknown++;
        results.push({case_id:c.id, repeat, status:'CALL_FAILED', error_code:report.error_code}); continue;
      }
      verifyReport(report, c, mode);
      if (ids.has(report.run_id)) throw Error('DUPLICATE_RUN_ID');
      ids.add(report.run_id);
      const score = compare(report, c); summary.valid++;
      if (score.deterministic.passed && score.anomaly_presence_only) summary.deterministic_exact++;
      for (const field of ['exact_fields','omitted_known_values','altered_values','invented_values']) summary[field] += score.metrics[field];
      if (Number.isFinite(report.reported_cost) && report.reported_cost >= 0) {
        summary.reported_cost_sum = (summary.reported_cost_sum ?? 0) + report.reported_cost; summary.reports_with_cost++;
      } else summary.costs_unknown++;
      if (Number.isFinite(report.duration_ms) && report.duration_ms >= 0) summary.durations_ms.push(report.duration_ms);
      results.push({case_id:c.id, repeat, status:'SCORED', result_sha256:report.result_sha256,
        rows_sha256:hash(JSON.stringify({date:report.result.date, rows:report.result.rows})), result:report.result,
        reported_cost:report.reported_cost, duration_ms:report.duration_ms, tokens:report.tokens, score});
    } catch (e) {
      summary.invalid++; summary.costs_unknown++;
      results.push({case_id:c.id, repeat, status:'INVALID_REPORT', error_code:/^[A-Z_]+$/.test(e.message) ? e.message : 'INVALID_JSON_OR_IO'});
    }
  }
  summary.exact_field_rate_attempted = summary.expected_fields_attempted ? summary.exact_fields / summary.expected_fields_attempted : null;
  summary.deterministic_exact_rate_attempted = summary.planned > summary.not_run ? summary.deterministic_exact / (summary.planned - summary.not_run) : null;
  summary.coverage = (summary.planned - summary.not_run) / summary.planned;
  const variability = corpus.cases.map(c => {
    const runs = results.filter(r => r.case_id === c.id && r.status === 'SCORED');
    return { case_id:c.id, valid_repeats:runs.length, planned_repeats:repeats,
      distinct_structured_results:runs.length >= 2 ? new Set(runs.map(r => r.rows_sha256)).size : null,
      distinct_results_including_anomalies:runs.length >= 2 ? new Set(runs.map(r => r.result_sha256)).size : null };
  });
  return { benchmark_id:corpus.benchmark_id, mode, integrity, summary, results, variability,
    model_accuracy_status:'NOT_VALIDATED', independent_reference_review:'PENDING', semantic_review:'PENDING',
    review_required:true, eligible_for_import:false,
    limitations:['Percentuali condizionate ai tentativi presenti; copertura sempre esposta, errori inclusi nel denominatore.',
      'Hash e modo sono metadati dichiarati, non attestazione indipendente del provider.',
      'Conteggi di invenzione/alterazione dipendono dall’allineamento documentato; revisionare casi ambigui.',
      'Costo dichiarato dal provider; eventuali tentativi senza report restano ignoti. Nessuna metrica LIVE da simulazioni.'] };
}
if (require.main === module) {
  try {
    const [command, dir, mode, repeatArg] = process.argv.slice(2);
    const repeats = repeatArg === undefined ? 3 : Number(repeatArg);
    if (!Number.isInteger(repeats) || repeats < 1 || repeats > 10) throw Error('INVALID_REPEATS');
    const result = command === 'verify' ? verifyCorpus() : command === 'self-check' ? selfCheck() :
      command === 'prepare' && dir ? prepare(dir) : command === 'evaluate' && dir ? evaluateBatch(dir, mode, repeats) : null;
    if (!result) throw Error('USAGE: verify | self-check | prepare NEW_DIR | evaluate REPORT_DIR LIVE|SIMULATED [REPEATS]');
    process.stdout.write(json(result));
    if (result.passed === false || result.summary?.invalid || result.summary?.call_failed) process.exitCode = 1;
  } catch (e) { console.error(e.message); process.exitCode = 1; }
}
module.exports = { verifyCorpus, syntheticReport, selfCheck, prepare, evaluateBatch };
