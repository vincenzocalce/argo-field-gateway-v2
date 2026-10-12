#!/usr/bin/env node
'use strict';

// This entry point intentionally depends only on the filesystem, hashing, and
// the pure adapter. It must never load the server, pg, or any HTTP client.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { adaptSegments } = require('../src/vin9-adapter');

const PR8_HEAD = '42fb696dfc15c539a0c5c5cca4aef974f0592cc5';
const SEGMENT_FILES = [
  ['baseline', 'baseline_v0.1.json'],
  ['addendum_delta', 'addendum_delta_v0.2.json'],
  ['additive', 'additive_v0.2.json'],
  ['baseline_outflows', 'baseline_outflows.json'],
  ['excluded_24_A', 'excluded_24_A.json'],
  ['excluded_24_B', 'excluded_24_B.json'],
];

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function safeRelativeName(value) {
  if (typeof value !== 'string' || !value || value.trim() !== value ||
      /[\\\u0000\r\n]/.test(value) || path.posix.isAbsolute(value) ||
      /^[A-Za-z]:/.test(value) || value.split('/').some(part => !part || part === '.' || part === '..')) {
    throw new Error(`Unsafe package path: ${JSON.stringify(value)}`);
  }
  return value;
}

function assertNoSymlinks(absolute, allowMissingLeaf = false) {
  const root = path.parse(absolute).root;
  const parts = absolute.slice(root.length).split(path.sep).filter(Boolean);
  let current = root;
  for (let index = 0; index < parts.length; index += 1) {
    current = path.join(current, parts[index]);
    let stat;
    try {
      stat = fs.lstatSync(current);
    } catch (error) {
      if (error.code === 'ENOENT' && allowMissingLeaf && index === parts.length - 1) return;
      throw error;
    }
    if (stat.isSymbolicLink()) throw new Error(`Symlinks are not allowed: ${current}`);
    if (index < parts.length - 1 && !stat.isDirectory()) {
      throw new Error(`Path component is not a directory: ${current}`);
    }
  }
}

function isInside(candidate, directory) {
  const relative = path.relative(directory, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function validateOutput(inputDir, outputPath) {
  if (isInside(outputPath, inputDir)) throw new Error('Output must be outside the input directory');
  assertNoSymlinks(outputPath, true);
  if (!fs.statSync(path.dirname(outputPath)).isDirectory()) throw new Error('Output parent must be a directory');
  try {
    fs.lstatSync(outputPath);
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
  throw new Error('Output already exists; refusing to overwrite');
}

function parseChecksumLedger(bytes, label) {
  const entries = [];
  const seen = new Set();
  for (const line of bytes.toString('utf8').split(/\r?\n/)) {
    if (!line.trim()) continue;
    const match = /^([a-fA-F0-9]{64})[ \t]+(?:\*)?(.+)$/.exec(line);
    if (!match) throw new Error(`Malformed checksum line in ${label}`);
    const file = safeRelativeName(match[2]);
    if (seen.has(file)) throw new Error(`Duplicate checksum path in ${label}: ${file}`);
    seen.add(file);
    entries.push({ file, expected: match[1].toLowerCase() });
  }
  if (!entries.length) throw new Error(`Empty checksum ledger: ${label}`);
  return entries;
}

function readPackage(inputDir) {
  assertNoSymlinks(inputDir);
  if (!fs.statSync(inputDir).isDirectory()) throw new Error('Input must be a directory');
  const contents = new Map();
  const hashes = new Map();

  function read(file) {
    safeRelativeName(file);
    if (contents.has(file)) return contents.get(file);
    const absolute = path.join(inputDir, ...file.split('/'));
    assertNoSymlinks(absolute);
    // O_NOFOLLOW also protects the final component if it changes after lstat.
    const descriptor = fs.openSync(absolute, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    let bytes;
    try {
      if (!fs.fstatSync(descriptor).isFile()) throw new Error(`Package entry is not a regular file: ${file}`);
      bytes = fs.readFileSync(descriptor);
    } finally {
      fs.closeSync(descriptor);
    }
    contents.set(file, bytes);
    hashes.set(file, sha256(bytes));
    return bytes;
  }

  function verify(file, expected) {
    if (typeof expected !== 'string' || !/^[a-fA-F0-9]{64}$/.test(expected)) {
      throw new Error(`Invalid SHA256 for ${file}`);
    }
    read(file);
    if (hashes.get(file) !== expected.toLowerCase()) throw new Error(`SHA256 mismatch: ${file}`);
  }

  const manifestLedger = parseChecksumLedger(read('manifest.sha256'), 'manifest.sha256');
  if (manifestLedger.length !== 1 || manifestLedger[0].file !== 'manifest.json') {
    throw new Error('manifest.sha256 must contain exactly manifest.json');
  }
  verify(manifestLedger[0].file, manifestLedger[0].expected);
  const manifest = JSON.parse(read('manifest.json').toString('utf8'));
  if (!manifest || !Array.isArray(manifest.files)) throw new Error('Manifest must contain a files array');
  const listed = new Set();
  for (const entry of manifest.files) {
    if (!entry || typeof entry !== 'object') throw new Error('Invalid manifest file entry');
    const file = safeRelativeName(entry.path);
    if (listed.has(file)) throw new Error(`Duplicate manifest path: ${file}`);
    listed.add(file);
    if (!Number.isSafeInteger(entry.bytes) || entry.bytes < 0) throw new Error(`Invalid byte count: ${file}`);
    verify(file, entry.sha256);
    if (read(file).length !== entry.bytes) throw new Error(`Byte count mismatch: ${file}`);
  }

  const evidenceLedger = parseChecksumLedger(read('evidence.sha256'), 'evidence.sha256');
  for (const entry of evidenceLedger) {
    if (!entry.file.startsWith('evidence/')) throw new Error('Evidence checksums must refer to evidence/ files');
    verify(entry.file, entry.expected);
  }

  const required = [...SEGMENT_FILES.map(([, file]) => file), 'provenance.json', 'source_rows_pseudonymized.json', 'non_movement_observations.json'];
  for (const file of required) {
    if (!listed.has(file)) throw new Error(`Required input is absent from manifest: ${file}`);
  }
  function arrayJson(file) {
    const value = JSON.parse(read(file).toString('utf8'));
    if (!Array.isArray(value)) throw new Error(`Expected a JSON array: ${file}`);
    return value;
  }
  const provenance = arrayJson('provenance.json');
  const sourceRows = arrayJson('source_rows_pseudonymized.json');
  const segments = SEGMENT_FILES.map(([name, file]) => ({
    name, file, records: arrayJson(file), input_sha256: hashes.get(file),
    provenance, source_rows: sourceRows,
  }));
  return {
    manifest, segments, nonMovementObservations: arrayJson('non_movement_observations.json'),
    hashes: Object.fromEntries([...hashes.entries()].sort(([a], [b]) => a.localeCompare(b))),
  };
}

function parseArguments(argv) {
  if (argv.length === 1 && argv[0] === '--help') return null;
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    if (!['--input-dir', '--output'].includes(flag) || options[flag] !== undefined ||
        typeof argv[index + 1] !== 'string' || argv[index + 1].startsWith('--')) {
      throw new Error('Usage: node scripts/vin9-adapt.js --input-dir PATH --output PATH');
    }
    options[flag] = argv[index + 1];
  }
  if (!options['--input-dir'] || !options['--output']) {
    throw new Error('Usage: node scripts/vin9-adapt.js --input-dir PATH --output PATH');
  }
  return { inputDir: path.resolve(options['--input-dir']), outputPath: path.resolve(options['--output']) };
}

function main(argv) {
  const options = parseArguments(argv);
  if (!options) {
    process.stdout.write('Usage: node scripts/vin9-adapt.js --input-dir PATH --output PATH\n');
    return;
  }
  assertNoSymlinks(options.inputDir);
  validateOutput(options.inputDir, options.outputPath);
  const pkg = readPackage(options.inputDir);
  const report = {
    ...adaptSegments(pkg.segments),
    non_movement_observations: pkg.nonMovementObservations,
    pr8_reference: {
      repository: 'vincenzocalce/argo-field-gateway-v2',
      pull_request: 8,
      head_sha: PR8_HEAD,
      schema_file: 'src/database.js',
    },
    input_integrity: {
      status: 'VERIFIED_ARTIFACT_CHECKSUMS_ONLY',
      package_version: pkg.manifest.package_version ?? null,
      native_hash: pkg.manifest.native_hash ?? null,
      native_hash_reason: pkg.manifest.native_hash_reason ?? null,
      original_sources_authenticated: false,
    },
    input_sha256: pkg.hashes,
  };
  const bytes = `${JSON.stringify(report, null, 2)}\n`;
  // The exclusive create is the final protection against overwrites. The
  // input buffers are already validated and the complete report is in memory.
  validateOutput(options.inputDir, options.outputPath);
  let descriptor;
  try {
    descriptor = fs.openSync(options.outputPath,
      fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
    fs.writeFileSync(descriptor, bytes);
  } catch (error) {
    if (descriptor !== undefined) {
      fs.closeSync(descriptor);
      descriptor = undefined;
      fs.unlinkSync(options.outputPath);
    }
    throw error;
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
  process.stdout.write('Offline documentary staging report created. Database import: NOT_EXECUTED.\n');
}

if (require.main === module) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`VIN-9 adapter failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = { main, readPackage, PR8_HEAD };
