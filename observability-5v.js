'use strict';
const { createHash, randomUUID } = require('node:crypto');
const { performance } = require('node:perf_hooks');

// Process identity, not a parser run or a native event identity.
const processRunId = randomUUID();
const channels = new Map([
  ['/webhook', 'meta_whatsapp'],
  ['/argo/wearable/callback', 'wearable']
]);

function nativeIds(body, channel) {
  const ids = [];
  let total = 0;
  const add = (value, kind) => {
    if (typeof value !== 'string' || !value.length || value.length > 256) return;
    total++;
    if (ids.length < 100) ids.push({ kind, id: value });
  };
  if (channel === 'wearable') {
    // Explicit optional field only: never infer identity from user/device data.
    add(body?.event_id, 'event_id');
  } else if (Array.isArray(body?.entry)) {
    for (const entry of body.entry) {
      if (!Array.isArray(entry?.changes)) continue;
      for (const change of entry.changes) {
        const value = change?.value;
        for (const message of Array.isArray(value?.messages) ? value.messages : []) {
          add(message?.id, 'message');
        }
        for (const status of Array.isArray(value?.statuses) ? value.statuses : []) {
          add(status?.id, 'status_message_reference');
        }
      }
    }
  }
  return { native_ids: ids, native_ids_truncated: total > ids.length };
}

function observability5v({ writeLog = line => console.log(line) } = {}) {
  return (req, res, next) => {
    // Match Express's default case-insensitive, optional-trailing-slash routes.
    const path = req.path.toLowerCase().replace(/\/$/, '');
    const channel = req.method === 'POST' && channels.get(path);
    if (!channel) return next();
    const receivedAt = new Date().toISOString();
    const start = performance.now();
    const requestId = randomUUID();
    const hash = createHash('sha256');
    let bytes = 0;
    let complete = false;
    let digest = null;
    let emitted = false;
    // Observe the original HTTP entity stream, including compressed bytes.
    // No payload buffer, headers, query strings, or body values are logged.
    req.on('data', chunk => {
      bytes += chunk.length;
      hash.update(chunk);
    });
    req.once('end', () => {
      complete = req.complete;
      if (complete) digest = hash.digest('hex');
    });
    function emit(outcome) {
      if (emitted) return;
      emitted = true;
      const record = {
        schema: 'argo.gateway.5v.v1',
        received_at: receivedAt,
        completed_at: new Date().toISOString(),
        channel,
        gateway_run_id: processRunId,
        request_id: requestId,
        content_encoding: ['gzip', 'deflate', 'br', 'identity'].includes(req.headers['content-encoding'])
          ? req.headers['content-encoding'] : (req.headers['content-encoding'] ? 'other' : 'identity'),
        raw_bytes: complete ? bytes : null,
        raw_bytes_observed: bytes,
        raw_complete: complete,
        raw_sha256: digest,
        ...nativeIds(req.body, channel),
        http_status: outcome === 'finished' ? res.statusCode : null,
        outcome,
        duration_ms: Number((performance.now() - start).toFixed(3))
      };
      // Telemetry must not change an HTTP response if a sink fails.
      try { writeLog(JSON.stringify(record)); } catch { /* sink unavailable */ }
    }
    req.once('aborted', () => emit('aborted'));
    res.once('finish', () => emit('finished'));
    res.once('close', () => emit(res.writableFinished ? 'finished' : 'aborted'));
    next();
  };
}
module.exports = { observability5v };
