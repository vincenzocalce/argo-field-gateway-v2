'use strict';
const fs = require('node:fs');
const { extract } = require('./client');

async function main() {
  const args = process.argv.slice(2);
  if (![2, 4].includes(args.length) || (args.length === 4 && args[2] !== '--image')) {
    throw new Error('USAGE: node experiments/muse/run.js input.txt output.json [--image image.png]');
  }
  const [input, output] = args;
  // Reserve the output before any paid request; never overwrite existing evidence.
  const fd = fs.openSync(output, 'wx', 0o600);
  let completed = false;
  try {
    if (fs.statSync(input).size > 16000) throw new Error('INPUT_TOO_LARGE');
    if (args[3] && fs.statSync(args[3]).size > 2 * 1024 * 1024) throw new Error('IMAGE_TOO_LARGE');
    const report = await extract({
      text: fs.readFileSync(input, 'utf8'),
      image: args[3] ? fs.readFileSync(args[3]) : undefined,
      enabled: process.env.ARGO_MUSE_EXPERIMENT_ENABLED === 'true',
      apiKey: process.env.OPENROUTER_API_KEY
    });
    fs.writeFileSync(fd, JSON.stringify(report, null, 2) + '\n');
    completed = true;
    console.log('EXPERIMENT_SAVED_REVIEW_REQUIRED');
  } finally {
    fs.closeSync(fd);
    if (!completed) fs.unlinkSync(output);
  }
}
if (require.main === module) main().catch(error => {
  // Only known codes: no provider bodies, credential values or input file paths.
  const safe = /^(?:[A-Z_]+|USAGE: .*)$/.test(error.message);
  console.error(safe ? error.message : 'EXPERIMENT_FAILED');
  process.exitCode = 1;
});
