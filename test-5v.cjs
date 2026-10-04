const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const net = require('node:net');
const { once } = require('node:events');
const { createHash } = require('node:crypto');
const { gzipSync } = require('node:zlib');
const { createApp } = require('./server');

async function fixture(t, writeLog) {
  const logs = [];
  const server = createApp({ writeLog: writeLog || (line => logs.push(JSON.parse(line))) }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  async function send(path, body, extra = {}, method = 'POST') {
    return new Promise((resolve, reject) => {
      const req = http.request({ host: '127.0.0.1', port: server.address().port, path, method,
        headers: { 'Content-Type': 'application/json', ...extra } }, res => {
        let text = ''; res.on('data', chunk => text += chunk);
        res.on('end', () => resolve({ status: res.statusCode, text }));
      });
      req.on('error', reject); req.end(body);
    });
  }
  return { logs, send, server };
}
const sha = body => createHash('sha256').update(body).digest('hex');

test('both POSTs: exact UTF-8 bytes/hash, native IDs, unchanged responses, no payload', async t => {
  const { logs, send } = await fixture(t);
  for (const [path, body, channel, id] of [
    ['/webhook', '{ "entry":[{"changes":[{"value":{"messages":[{"id":"wamid.test","text":{"body":"segreto à"},"from":"PRIVATE"}]}}]}]}', 'meta_whatsapp', 'wamid.test'],
    ['/argo/wearable/callback', '{"event_id":"ev-1","secret":"PRIVATE"}', 'wearable', 'ev-1']
  ]) {
    const res = await send(path, body);
    assert.equal(res.status, 200);
    assert.equal(res.text, channel === 'wearable' ? '{"status":"received","channel":"wearable"}' : 'OK');
    const log = logs.at(-1);
    assert.equal(log.raw_bytes, Buffer.byteLength(body));
    assert.equal(log.raw_sha256, sha(body));
    assert.equal(log.channel, channel);
    assert.equal(log.native_ids[0].id, id);
    assert.equal(log.http_status, 200);
    assert.equal(log.outcome, 'finished');
    assert.equal(log.raw_complete, true);
    assert.ok(log.duration_ms >= 0);
    assert.ok(Number.isFinite(Date.parse(log.received_at)));
    assert.ok(Number.isFinite(Date.parse(log.completed_at)));
    assert.ok(!JSON.stringify(log).includes('PRIVATE'));
    assert.ok(!JSON.stringify(log).includes('segreto'));
  }
  assert.equal(logs.length, 2);
});

test('retries retain hash but have separate request IDs; absent native ID stays absent', async t => {
  const { logs, send } = await fixture(t);
  await send('/webhook', '{}'); await send('/webhook', '{}');
  assert.equal(logs[0].raw_sha256, logs[1].raw_sha256);
  assert.notEqual(logs[0].request_id, logs[1].request_id);
  assert.equal(logs[0].gateway_run_id, logs[1].gateway_run_id);
  assert.deepEqual(logs[0].native_ids, []);
});

test('gzip hashes compressed wire entity; chunked bodies remain exact', async t => {
  const { logs, send } = await fixture(t);
  const raw = gzipSync(Buffer.from('{"event_id":"gzip-1"}'));
  assert.equal((await send('/argo/wearable/callback', raw, { 'Content-Encoding': 'gzip' })).status, 200);
  assert.equal(logs[0].raw_bytes, raw.length);
  assert.equal(logs[0].raw_sha256, sha(raw));
  assert.equal(logs[0].native_ids[0].id, 'gzip-1');
  await send('/webhook', '{}', { 'Transfer-Encoding': 'chunked' });
  assert.equal(logs[1].raw_bytes, 2);
  assert.equal(logs[1].raw_sha256, sha('{}'));
});

test('JSON parse error and limit rejection still produce one structured HTTP result', async t => {
  const { logs, send } = await fixture(t);
  assert.equal((await send('/webhook', '{')).status, 400);
  assert.equal(logs[0].http_status, 400);
  assert.equal(logs[0].raw_sha256, sha('{'));
  const large = JSON.stringify({ text: 'x'.repeat(110000) });
  assert.equal((await send('/webhook', large)).status, 413);
  assert.equal(logs[1].http_status, 413);
  assert.equal(logs.length, 2);
});

test('GET, health and unrelated POST do not emit 5V records; routing aliases do', async t => {
  const { logs, send } = await fixture(t);
  assert.equal((await send('/', undefined, {}, 'GET')).status, 200);
  assert.equal((await send('/argo/wearable/callback', undefined, {}, 'GET')).status, 200);
  assert.equal((await send('/webhook?hub.mode=subscribe&hub.verify_token=argo-test-token&hub.challenge=123', undefined, {}, 'GET')).text, '123');
  assert.equal((await send('/unrelated', '{}')).status, 404);
  assert.equal(logs.length, 0);
  await send('/WEBHOOK/?secret=PRIVATE', '{}');
  assert.equal(logs.length, 1);
  assert.ok(!JSON.stringify(logs).includes('PRIVATE'));
});

test('batch message references remain distinct from status references; bounded ID output', async t => {
  const { logs, send } = await fixture(t);
  await send('/webhook', JSON.stringify({ entry: [{ changes: [{ value: {
    messages: [{ id: 'm1' }, { id: 'm2' }], statuses: [{ id: 'm1', status: 'read' }]
  } }] }] }));
  assert.deepEqual(logs[0].native_ids, [
    { kind: 'message', id: 'm1' }, { kind: 'message', id: 'm2' },
    { kind: 'status_message_reference', id: 'm1' }
  ]);
  await send('/webhook', JSON.stringify({ entry: [{ changes: [{ value: {
    messages: Array.from({ length: 101 }, (_, i) => ({ id: 'm' + i }))
  } }] }] }));
  assert.equal(logs[1].native_ids.length, 100);
  assert.equal(logs[1].native_ids_truncated, true);
});

test('disconnect before body completion logs partial bytes, null final hash/status, once', async t => {
  const { logs, server } = await fixture(t);
  const socket = net.connect(server.address().port, '127.0.0.1');
  await once(socket, 'connect');
  socket.write('POST /webhook HTTP/1.1\r\nHost: localhost\r\nContent-Type: application/json\r\nContent-Length: 100\r\n\r\n{');
  await new Promise(resolve => setTimeout(resolve, 30));
  socket.destroy();
  for (let i = 0; i < 50 && !logs.length; i++) await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(logs.length, 1);
  assert.equal(logs[0].outcome, 'aborted');
  assert.equal(logs[0].http_status, null);
  assert.equal(logs[0].raw_bytes, null);
  assert.equal(logs[0].raw_sha256, null);
  assert.equal(logs[0].raw_complete, false);
});

test('telemetry sink failure does not change acknowledgement', async t => {
  const { send } = await fixture(t, () => { throw new Error('sink unavailable'); });
  assert.equal((await send('/webhook', '{}')).status, 200);
});
