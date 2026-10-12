'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const CLI = path.resolve(__dirname, '../scripts/vin9-adapt.js');
const PR8_HEAD = '42fb696dfc15c539a0c5c5cca4aef974f0592cc5';
const SEGMENT_NAMES = ['baseline', 'addendum_delta', 'additive', 'baseline_outflows', 'excluded_24_A', 'excluded_24_B'];
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

function syntheticPackage(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vin9-cli-synthetic-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const inputDir = path.join(directory, 'inputs');
  fs.mkdirSync(path.join(inputDir, 'evidence'), { recursive: true });
  const row = {
    record_id: 'SYNTHETIC-R1', source_record_id: 'SYNTHETIC-R1', source_id: 'SYNTHETIC-S1',
    mission_id: null, parse_run_id: null, native_hash: null, eer_code: null, event_timestamp: null,
    event_date: '2026-09-21', event_type: 'ENTRATA', subject_alias: 'SYNTHETIC-OP1',
    vehicle_alias: 'SYNTHETIC-V1', area: 'SYNTHETIC-AREA', dry_kg: 3, wet_kg: 2, total_kg: 5,
    unclassified_kg: null, data_status: 'ACQUIRED_NOT_VALIDATED', source_quality_status: 'ACQUIRED_NOT_VALIDATED',
    dataset_version: 'synthetic_baseline', quality_basis: 'SOURCE_ROW', conflict_group: null,
    excluded_from_unique_total: false, source_table_index: 1, source_row_index: 1,
    evidence_ref: 'https://example.invalid/synthetic-source',
    missing_fields: ['mission_id', 'parse_run_id', 'native_hash', 'eer_code', 'event_timestamp'],
  };
  const files = {
    'baseline_v0.1.json': [row],
    'addendum_delta_v0.2.json': [],
    'additive_v0.2.json': [row],
    'baseline_outflows.json': [],
    'excluded_24_A.json': [],
    'excluded_24_B.json': [],
    'provenance.json': [{ id: 'SYNTHETIC-S1', url: row.evidence_ref, native_hash: null }],
    'source_rows_pseudonymized.json': [{
      record_id: row.record_id, source_id: row.source_id, row_index: 1, table_index: 1,
      cells_pseudonymized: { ID: row.record_id, Totale: '5' },
    }],
    'non_movement_observations.json': [{ type: 'SYNTHETIC_NON_MOVEMENT' }],
  };
  for (const [name, value] of Object.entries(files)) fs.writeFileSync(path.join(inputDir, name), `${JSON.stringify(value)}\n`);
  fs.writeFileSync(path.join(inputDir, 'README.txt'), 'SYNTHETIC TEST FIXTURE. No real observations.\n');
  const manifest = {
    package_version: 'synthetic-test-only', native_hash: null,
    native_hash_reason: 'Synthetic fixture; no original raw inputs',
    files: [...Object.keys(files), 'README.txt'].sort().map(name => {
      const bytes = fs.readFileSync(path.join(inputDir, name));
      return { path: name, bytes: bytes.length, sha256: digest(bytes) };
    }),
  };
  writeManifest(inputDir, manifest);
  const evidence = Buffer.from('{"synthetic":true,"database_import":"NOT_EXECUTED"}\n');
  fs.writeFileSync(path.join(inputDir, 'evidence', 'synthetic.json'), evidence);
  fs.writeFileSync(path.join(inputDir, 'evidence.sha256'), `${digest(evidence)}  evidence/synthetic.json\n`);
  return { directory, inputDir, outputPath: path.join(directory, 'report.json'), manifest };
}

function writeManifest(inputDir, manifest) {
  const bytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
  fs.writeFileSync(path.join(inputDir, 'manifest.json'), bytes);
  fs.writeFileSync(path.join(inputDir, 'manifest.sha256'), `${digest(bytes)}  manifest.json\n`);
}

function execute(fixture, outputPath = fixture.outputPath, extra = {}) {
  return spawnSync(process.execPath, [CLI, '--input-dir', fixture.inputDir, '--output', outputPath], {
    encoding: 'utf8', timeout: 15000, ...extra,
  });
}

function snapshotTree(directory, prefix = '') {
  const snapshots = {};
  for (const entry of fs.readdirSync(path.join(directory, prefix), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const relative = path.join(prefix, entry.name);
    if (entry.isDirectory()) Object.assign(snapshots, snapshotTree(directory, relative));
    else {
      const absolute = path.join(directory, relative);
      const stat = fs.lstatSync(absolute, { bigint: true });
      snapshots[relative] = { sha256: digest(fs.readFileSync(absolute)), mtime_ns: stat.mtimeNs.toString(), size: stat.size.toString() };
    }
  }
  return snapshots;
}

function assertFailedWithoutOutput(result, fixture, pattern) {
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, pattern);
  assert.equal(fs.existsSync(fixture.outputPath), false);
}

test('CLI creates deterministic staging reports and leaves every input unchanged', t => {
  const fixture = syntheticPackage(t);
  const before = snapshotTree(fixture.inputDir);
  const first = execute(fixture);
  assert.equal(first.status, 0, first.stderr);
  const bytes = fs.readFileSync(fixture.outputPath);
  const report = JSON.parse(bytes);
  assert.equal(report.mode, 'DOCUMENTARY_STAGING_ONLY');
  assert.equal(report.database_import, 'NOT_EXECUTED');
  assert.equal(report.m1_reproducibility, 'NOT_DEMONSTRATED');
  assert.equal(report.pr8_reference.head_sha, PR8_HEAD);
  assert.equal(report.input_integrity.original_sources_authenticated, false);
  assert.equal(report.input_integrity.native_hash, null);
  assert.equal(report.input_integrity.status, 'VERIFIED_ARTIFACT_CHECKSUMS_ONLY');
  assert.deepEqual(report.non_movement_observations, [{ type: 'SYNTHETIC_NON_MOVEMENT' }]);
  assert.deepEqual(report.segments.map(segment => segment.name), SEGMENT_NAMES);
  assert.equal(report.segments.find(segment => segment.name === 'baseline').records.length, 1);
  assert.deepEqual(Object.keys(report.input_sha256).sort(), Object.keys(before).sort());
  for (const [name, info] of Object.entries(before)) assert.equal(report.input_sha256[name], info.sha256, name);
  const secondOutput = path.join(fixture.directory, 'second-report.json');
  const second = execute(fixture, secondOutput);
  assert.equal(second.status, 0, second.stderr);
  assert.deepEqual(fs.readFileSync(secondOutput), bytes);
  assert.deepEqual(snapshotTree(fixture.inputDir), before);
});

test('CLI succeeds without importing database, server, HTTP, or network modules', t => {
  const fixture = syntheticPackage(t);
  const guard = path.join(fixture.directory, 'forbid-external-modules.cjs');
  fs.writeFileSync(guard, `const Module = require('node:module');
const originalLoad = Module._load;
Module._load = function (request, ...args) {
  if (/^(?:node:)?(?:http|https|http2|net|tls|dns)$/.test(request) || request === 'pg' || /(?:server|database|app)(?:\\.js)?$/.test(request)) {
    throw new Error('Forbidden external module: ' + request);
  }
  return originalLoad.call(this, request, ...args);
};\n`);
  const result = execute(fixture, fixture.outputPath, { env: { ...process.env, NODE_OPTIONS: `--require=${guard}` } });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(fs.readFileSync(fixture.outputPath)).database_import, 'NOT_EXECUTED');
});

test('CLI refuses an existing output file', t => {
  const fixture = syntheticPackage(t);
  const original = 'DO NOT OVERWRITE\n';
  fs.writeFileSync(fixture.outputPath, original);
  const result = execute(fixture);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /already exists/);
  assert.equal(fs.readFileSync(fixture.outputPath, 'utf8'), original);
});

test('CLI refuses output anywhere in the source directory', t => {
  const fixture = syntheticPackage(t);
  const before = snapshotTree(fixture.inputDir);
  const result = execute(fixture, path.join(fixture.inputDir, 'evidence', 'new-report.json'));
  assert.equal(result.status, 1);
  assert.match(result.stderr, /outside the input directory/);
  assert.deepEqual(snapshotTree(fixture.inputDir), before);
});

test('CLI rejects output symlinks including dangling links', async t => {
  for (const exists of [true, false]) await t.test(`target exists: ${exists}`, t => {
    const fixture = syntheticPackage(t);
    const target = path.join(fixture.directory, 'target.json');
    if (exists) fs.writeFileSync(target, 'preserved');
    fs.symlinkSync(target, fixture.outputPath);
    const result = execute(fixture);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Symlinks are not allowed/);
    if (exists) assert.equal(fs.readFileSync(target, 'utf8'), 'preserved');
    else assert.equal(fs.existsSync(target), false);
  });
});

test('CLI rejects symlinks in the output parent path', t => {
  const fixture = syntheticPackage(t);
  const link = path.join(fixture.directory, 'linked-parent');
  fs.symlinkSync(fixture.directory, link);
  const result = execute(fixture, path.join(link, 'new-report.json'));
  assertFailedWithoutOutput(result, fixture, /Symlinks are not allowed/);
  assert.equal(fs.existsSync(path.join(fixture.directory, 'new-report.json')), false);
});

test('CLI rejects symlinked input files and input directory aliases', async t => {
  await t.test('manifest listed file', t => {
    const fixture = syntheticPackage(t);
    const actual = path.join(fixture.directory, 'actual-baseline.json');
    const input = path.join(fixture.inputDir, 'baseline_v0.1.json');
    fs.renameSync(input, actual);
    fs.symlinkSync(actual, input);
    assertFailedWithoutOutput(execute(fixture), fixture, /Symlinks are not allowed/);
  });
  await t.test('input directory alias', t => {
    const fixture = syntheticPackage(t);
    const alias = path.join(fixture.directory, 'input-alias');
    fs.symlinkSync(fixture.inputDir, alias);
    fixture.inputDir = alias;
    assertFailedWithoutOutput(execute(fixture), fixture, /Symlinks are not allowed/);
  });
});

test('CLI refuses corrupted checksums and byte counts without a partial report', async t => {
  const cases = [
    ['manifest digest', fixture => fs.appendFileSync(path.join(fixture.inputDir, 'manifest.json'), ' '), /SHA256 mismatch: manifest.json/],
    ['listed file digest', fixture => fs.appendFileSync(path.join(fixture.inputDir, 'README.txt'), 'altered'), /SHA256 mismatch: README.txt/],
    ['evidence digest', fixture => fs.appendFileSync(path.join(fixture.inputDir, 'evidence', 'synthetic.json'), ' '), /SHA256 mismatch: evidence/],
    ['byte count', fixture => { fixture.manifest.files[0].bytes += 1; writeManifest(fixture.inputDir, fixture.manifest); }, /Byte count mismatch/],
  ];
  for (const [name, mutate, pattern] of cases) await t.test(name, t => {
    const fixture = syntheticPackage(t);
    mutate(fixture);
    const before = snapshotTree(fixture.inputDir);
    assertFailedWithoutOutput(execute(fixture), fixture, pattern);
    assert.deepEqual(snapshotTree(fixture.inputDir), before);
  });
});

test('CLI rejects unsafe package paths in either manifest or checksum ledgers', async t => {
  for (const name of ['../outside.json', '/outside.json', 'evidence/../outside.json', 'C:\\outside.json']) {
    await t.test(`manifest ${name}`, t => {
      const fixture = syntheticPackage(t);
      fixture.manifest.files[0].path = name;
      writeManifest(fixture.inputDir, fixture.manifest);
      assertFailedWithoutOutput(execute(fixture), fixture, /Unsafe package path/);
    });
  }
  await t.test('manifest checksum traversal', t => {
    const fixture = syntheticPackage(t);
    fs.writeFileSync(path.join(fixture.inputDir, 'manifest.sha256'), `${'a'.repeat(64)}  ../manifest.json\n`);
    assertFailedWithoutOutput(execute(fixture), fixture, /Unsafe package path/);
  });
  await t.test('evidence checksum traversal', t => {
    const fixture = syntheticPackage(t);
    fs.writeFileSync(path.join(fixture.inputDir, 'evidence.sha256'), `${'a'.repeat(64)}  evidence/../../outside.json\n`);
    assertFailedWithoutOutput(execute(fixture), fixture, /Unsafe package path/);
  });
});

test('CLI requires every segment and supporting source array to be checksummed', t => {
  const fixture = syntheticPackage(t);
  fixture.manifest.files = fixture.manifest.files.filter(entry => entry.path !== 'provenance.json');
  writeManifest(fixture.inputDir, fixture.manifest);
  assertFailedWithoutOutput(execute(fixture), fixture, /absent from manifest: provenance.json/);
});

test('CLI rejects duplicate manifest and checksum entries', async t => {
  await t.test('manifest entry', t => {
    const fixture = syntheticPackage(t);
    fixture.manifest.files.push(fixture.manifest.files[0]);
    writeManifest(fixture.inputDir, fixture.manifest);
    assertFailedWithoutOutput(execute(fixture), fixture, /Duplicate manifest path/);
  });
  await t.test('evidence ledger entry', t => {
    const fixture = syntheticPackage(t);
    const ledger = path.join(fixture.inputDir, 'evidence.sha256');
    fs.appendFileSync(ledger, fs.readFileSync(ledger));
    assertFailedWithoutOutput(execute(fixture), fixture, /Duplicate checksum path/);
  });
});

test('CLI rejects non-array segment JSON even with a valid package checksum', t => {
  const fixture = syntheticPackage(t);
  const name = 'baseline_v0.1.json';
  const bytes = Buffer.from('{"records":[]}\n');
  fs.writeFileSync(path.join(fixture.inputDir, name), bytes);
  const entry = fixture.manifest.files.find(entry => entry.path === name);
  Object.assign(entry, { bytes: bytes.length, sha256: digest(bytes) });
  writeManifest(fixture.inputDir, fixture.manifest);
  assertFailedWithoutOutput(execute(fixture), fixture, /Expected a JSON array: baseline/);
});

test('CLI rejects malformed arguments without creating output', t => {
  const fixture = syntheticPackage(t);
  const result = spawnSync(process.execPath, [CLI, '--input-dir', fixture.inputDir, '--output', fixture.outputPath, '--output', fixture.outputPath], { encoding: 'utf8' });
  assertFailedWithoutOutput(result, fixture, /Usage:/);
});
