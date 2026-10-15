'use strict';
const { isDeepStrictEqual } = require('node:util');
const fs = require('node:fs');
const expected = require('./expected.json');
const { validate } = require('./client');
function evaluate(report, fixture) {
  const target = expected[fixture];
  if (!Object.hasOwn(expected, fixture)) throw new Error('UNKNOWN_FIXTURE');
  validate(report.result);
  const checks = {
    date_exact: report.result.date === target.date,
    rows_exact: isDeepStrictEqual(report.result.rows, target.rows),
    conflict_flag_present: !target.conflict_required || report.result.anomalies.length > 0,
    review_required: report.review_required === true,
    import_disabled: report.eligible_for_import === false
  };
  return { fixture, checks, passed: Object.values(checks).every(Boolean),
    limitation: 'Controllo meccanico di 3 fixture sintetiche; significato delle anomalie da revisionare. Non misura accuratezza operativa.' };
}
if (require.main === module) {
  try {
    if (process.argv.length !== 4) throw new Error('USAGE');
    const result = evaluate(JSON.parse(fs.readFileSync(process.argv[2], 'utf8')), process.argv[3]);
    console.log(JSON.stringify(result, null, 2));
    if (!result.passed) process.exitCode = 1;
  } catch { console.error('EVALUATION_FAILED'); process.exitCode = 1; }
}
module.exports = { evaluate };
