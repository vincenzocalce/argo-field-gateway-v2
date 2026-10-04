const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { once } = require('node:events');
const path = require('node:path');
const cwd = path.resolve(__dirname, '..');

function environment(token) {
  const env = { ...process.env, PORT: '0' };
  delete env.VERIFY_TOKEN;
  if (token !== undefined) env.VERIFY_TOKEN = token;
  return env;
}

for (const [name, token] of [['assente', undefined], ['vuoto', ''], ['solo spazi', ' \t ']]) {
  test(`VERIFY_TOKEN ${name}: termina prima di ascoltare`, () => {
    const result = spawnSync(process.execPath, ['server.js'], {
      cwd, env: environment(token), encoding: 'utf8', timeout: 5000
    });
    assert.ifError(result.error);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /VERIFY_TOKEN è obbligatorio/);
    assert.equal(result.stdout, '');
  });
}

test('token valido: avvio e contratto HTTP invariato', { timeout: 15000 }, async (t) => {
  // Gli spazi devono essere preservati nel confronto, non normalizzati.
  const token = ` ${randomUUID()} `;
  const child = spawn(process.execPath, ['-e', `
    const http = require('node:http');
    const listen = http.Server.prototype.listen;
    http.Server.prototype.listen = function (...args) {
      this.once('listening', () => process.send({ port: this.address().port }));
      return listen.apply(this, args);
    };
    require('./server.js');
  `], { cwd, env: environment(token), stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  let logs = '';
  child.stdout.on('data', chunk => { logs += chunk; });
  child.stderr.on('data', chunk => { logs += chunk; });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit');
      child.kill();
      await exited;
    }
  });
  const { port } = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Avvio non completato')), 5000);
    child.once('message', message => { clearTimeout(timer); resolve(message); });
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', code => { clearTimeout(timer); reject(new Error(`Uscita anticipata: ${code}`)); });
  });
  const base = `http://127.0.0.1:${port}`;
  const verify = (candidate, mode = 'subscribe') => fetch(base + '/webhook?' + new URLSearchParams({
    'hub.mode': mode, 'hub.verify_token': candidate, 'hub.challenge': '123456'
  }));
  const ok = await verify(token);
  assert.equal(ok.status, 200);
  assert.equal(await ok.text(), '123456');
  for (const candidate of ['wrong', '', token.trim(), 'argo-test-token']) {
    assert.equal((await verify(candidate)).status, 403);
  }
  assert.equal((await verify(token, 'invalid')).status, 403);
  assert.equal((await fetch(base + '/webhook')).status, 403);
  assert.deepEqual(await (await fetch(base)).json(), { status: 'ok', service: 'argo-field-gateway-v2' });
  const post = url => fetch(base + url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"test":true}' });
  const webhook = await post('/webhook');
  assert.equal(webhook.status, 200);
  assert.equal(await webhook.text(), 'OK');
  const wearable = await fetch(base + '/argo/wearable/callback');
  assert.equal(wearable.status, 200);
  assert.deepEqual(await wearable.json(), { status: 'ok', service: 'argo-field-gateway-v2', channel: 'wearable', endpoint: '/argo/wearable/callback' });
  const callback = await post('/argo/wearable/callback');
  assert.equal(callback.status, 200);
  assert.deepEqual(await callback.json(), { status: 'received', channel: 'wearable' });
  assert.ok(!logs.includes(token));
});
