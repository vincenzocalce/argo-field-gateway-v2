const test = require("node:test");
const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { gzipSync } = require("node:zlib");
const request = require("supertest");
const { createApp } = require("../src/app");
const { validMission } = require("./helpers/mission");

const VERIFY_TOKEN = " synthetic-gateway-verify-token ";
const API_TOKEN = "synthetic-gateway-api-token";
const uuid = (index) => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
const sha256 = (body) => createHash("sha256").update(body).digest("hex");

function mission(id = uuid(1)) {
  const payload = validMission({
    id,
    alias: "SYNTHETIC_OPERATOR",
    mezzo: "SYNTHETIC_VEHICLE",
    area: "SYNTHETIC_AREA"
  });
  payload.produttori[0].nome = "PRIVATE_PRODUCER_CANARY";
  for (const producer of payload.produttori) {
    producer.indirizzo = "PRIVATE_ADDRESS_CANARY";
    producer.note = "PRIVATE_NOTES_CANARY";
  }
  return payload;
}

// A deliberately isolated SQL seam: these HTTP tests do not establish a
// PostgreSQL deployment result. The separate PostgreSQL suite covers the DB.
function databaseFixture() {
  const payloads = new Map();
  const calls = [];
  return {
    payloads,
    calls,
    async query(sql, values) {
      calls.push({ sql, values });
      const normalizedSql = sql.trim();
      const id = values?.[0]?.toLowerCase();
      if (normalizedSql.startsWith("INSERT INTO argo_missions")) {
        if (payloads.has(id)) return { rowCount: 0, rows: [] };
        payloads.set(id, JSON.parse(values[6]));
        return { rowCount: 1, rows: [{ id }] };
      }
      if (normalizedSql.startsWith("SELECT payload FROM argo_missions")) {
        const payload = payloads.get(id);
        return { rowCount: payload ? 1 : 0, rows: payload ? [{ payload }] : [] };
      }
      throw new Error("Unexpected query in isolated HTTP fixture");
    }
  };
}

function fixture(options = {}) {
  const database = databaseFixture();
  const httpLogs = [];
  const ingestionLogs = [];
  const errors = [];
  const logger = {
    log(line) { httpLogs.push(JSON.parse(line)); },
    error(...args) { errors.push(args); },
    warn(...args) { errors.push(args); }
  };
  const app = createApp({
    database,
    verifyToken: VERIFY_TOKEN,
    apiToken: API_TOKEN,
    logger,
    writeLog: (line) => ingestionLogs.push(JSON.parse(line)),
    ...options
  });
  return { app, database, httpLogs, ingestionLogs, errors };
}

test("one gateway serves secure Meta handshake, iOS persistence, wearable 5V and exact AASA", async () => {
  const { app, database, httpLogs, ingestionLogs } = fixture();
  const health = await request(app).get("/");
  assert.deepEqual(health.body, {
    status: "ok", service: "argo-field-gateway-v2", database: "configured"
  });
  assert.equal(health.headers["x-powered-by"], undefined);

  const verify = (token) => request(app).get("/webhook").query({
    "hub.mode": "subscribe", "hub.verify_token": token, "hub.challenge": "314159"
  });
  assert.equal((await verify(VERIFY_TOKEN)).text, "314159");
  for (const invalid of ["argo-test-token", VERIFY_TOKEN.trim(), "wrong", ""]) {
    assert.equal((await verify(invalid)).status, 403);
  }

  const aasa = await request(app).get("/.well-known/apple-app-site-association");
  assert.equal(aasa.status, 200);
  assert.match(aasa.headers["content-type"], /^application\/json(?:;|$)/i);
  assert.equal(aasa.headers.location, undefined);
  assert.deepEqual(aasa.body, {
    applinks: { details: [{
      appIDs: ["N6JGN24QMU.it.vincenzocalce.argo.wearable"],
      components: [{ "/": "/argo/wearable/callback" }]
    }] }
  });
  const head = await request(app).head("/.well-known/apple-app-site-association");
  assert.equal(head.status, 200);
  assert.equal(head.text, undefined);
  for (const path of ["/.well-known/apple-app-site-association.json", "/.well-known/apple-app-site-association/"]) {
    assert.equal((await request(app).get(path)).status, 404);
  }

  const body = '{ "event_id":"synthetic-wearable-1", "private":"PRIVATE_WEARABLE_CANARY à" }';
  const callback = await request(app).post("/argo/wearable/callback").type("json").send(body);
  assert.equal(callback.status, 200);
  assert.deepEqual(callback.body, { status: "received", channel: "wearable" });
  assert.equal((await request(app).get("/argo/wearable/callback?source=ios")).status, 200);

  const payload = mission();
  const first = await request(app).post("/argo/missions").set("Authorization", `Bearer ${API_TOKEN}`).send(payload);
  assert.equal(first.status, 201);
  assert.deepEqual(first.body, { status: "created", id: payload.id });
  const repeated = { ...payload, alias: "CHANGED_ON_RETRY" };
  const retry = await request(app).post("/argo/missions").set("x-argo-api-key", API_TOKEN).send(repeated);
  assert.equal(retry.status, 200);
  assert.deepEqual(retry.body, { status: "already_exists", id: payload.id });
  const read = await request(app).get(`/argo/missions/${payload.id}`).set("x-argo-api-key", API_TOKEN);
  assert.equal(read.status, 200);
  assert.deepEqual(read.body, payload, "same UUID retries retain the originally persisted payload");
  assert.equal(database.payloads.size, 1);

  assert.equal(ingestionLogs.length, 1, "iOS and AASA do not become legacy ingestion events");
  const event = ingestionLogs[0];
  assert.equal(event.channel, "wearable");
  assert.equal(event.raw_bytes, Buffer.byteLength(body));
  assert.equal(event.raw_sha256, sha256(body));
  assert.equal(event.raw_complete, true);
  assert.deepEqual(event.native_ids, [{ kind: "event_id", id: "synthetic-wearable-1" }]);
  assert.equal(event.http_status, 200);
  assert.ok(event.duration_ms >= 0);
  const missionLogs = httpLogs.filter((item) => item.channel === "ios");
  assert.equal(missionLogs.length, 3);
  assert.deepEqual(missionLogs.map((item) => item.status_code), [201, 200, 200]);
  assert.equal(missionLogs[2].path, "/argo/missions/:id");
  assert.equal(missionLogs[0].mission_ref, sha256(payload.id).slice(0, 12));
  const serialized = JSON.stringify({ httpLogs, ingestionLogs });
  for (const canary of [VERIFY_TOKEN, API_TOKEN, payload.id, "PRIVATE_WEARABLE_CANARY", "PRIVATE_PRODUCER_CANARY", "PRIVATE_ADDRESS_CANARY", "PRIVATE_NOTES_CANARY"]) {
    assert.equal(serialized.includes(canary), false, `log privacy: ${canary}`);
  }
});

test("the same app keeps Meta acknowledgement and wire-level 5V for compressed payloads and route aliases", async () => {
  const { app, ingestionLogs } = fixture();
  const raw = gzipSync(Buffer.from('{"entry":[{"changes":[{"value":{"messages":[{"id":"synthetic-msg-1","text":{"body":"PRIVATE_META_CANARY"}}]}}]}]}'));
  const response = await request(app).post("/WEBHOOK/?secret=PRIVATE_QUERY_CANARY")
    .type("json").set("Content-Encoding", "gzip").serialize((data) => data).send(raw);
  assert.equal(response.status, 200);
  assert.equal(response.text, "OK");
  assert.equal(ingestionLogs.length, 1);
  assert.equal(ingestionLogs[0].raw_bytes, raw.length);
  assert.equal(ingestionLogs[0].raw_sha256, sha256(raw));
  assert.equal(ingestionLogs[0].content_encoding, "gzip");
  assert.deepEqual(ingestionLogs[0].native_ids, [{ kind: "message", id: "synthetic-msg-1" }]);
  assert.doesNotMatch(JSON.stringify(ingestionLogs), /PRIVATE_META_CANARY|PRIVATE_QUERY_CANARY/);
});

test("invalid gzip retains HTTP 400, raw 5V hash and sanitized parser diagnostics", async () => {
  const { app, ingestionLogs, httpLogs, errors } = fixture();
  const raw = Buffer.from("PRIVATE_COMPRESSED_CANARY: this is not a gzip stream");
  const response = await request(app).post("/webhook").type("json")
    .set("Content-Encoding", "gzip").serialize((data) => data).send(raw);
  assert.equal(response.status, 400);
  assert.equal(ingestionLogs.length, 1);
  assert.equal(ingestionLogs[0].raw_sha256, sha256(raw));
  assert.equal(ingestionLogs[0].raw_bytes, raw.length);
  assert.equal(ingestionLogs[0].http_status, 400);
  assert.equal(ingestionLogs[0].content_encoding, "gzip");
  assert.equal(httpLogs.at(-1).status_code, 400);
  assert.doesNotMatch(JSON.stringify({ response: response.body, httpLogs, ingestionLogs, errors }),
    /PRIVATE_COMPRESSED_CANARY|incorrect header check|unexpected end of file|Z_DATA_ERROR|stack/);
});

test("malformed JSON and route-specific limits keep 400/413 while valid larger iOS payloads persist", async () => {
  const { app, database, ingestionLogs, httpLogs } = fixture();
  for (const path of ["/webhook", "/argo/wearable/callback", "/argo/missions"]) {
    const invalid = await request(app).post(path).set("x-argo-api-key", API_TOKEN).type("json").send('{"private":"PRIVATE_PARSE_CANARY",');
    assert.equal(invalid.status, 400, path);
    assert.doesNotMatch(invalid.text, /PRIVATE_PARSE_CANARY|SyntaxError|stack/);
  }
  assert.equal(database.calls.length, 0);
  const largeLegacyBody = JSON.stringify({ private: "x".repeat(110000) });
  for (const path of ["/webhook", "/argo/wearable/callback"]) {
    const tooLarge = await request(app).post(path).type("json").send(largeLegacyBody);
    assert.equal(tooLarge.status, 413, path);
  }
  const largeMission = mission();
  largeMission.produttori[0].note = "x".repeat(110000);
  assert.equal((await request(app).post("/argo/missions").set("x-argo-api-key", API_TOKEN).send(largeMission)).status, 201);
  const oversizedMission = mission(uuid(2));
  oversizedMission.produttori[0].note = "x".repeat(1100000);
  assert.equal((await request(app).post("/argo/missions").set("x-argo-api-key", API_TOKEN).send(oversizedMission)).status, 413);
  assert.equal(database.payloads.size, 1);
  assert.deepEqual(ingestionLogs.map((item) => item.http_status), [400, 400, 413, 413]);
  assert.equal(ingestionLogs[0].raw_sha256, sha256('{"private":"PRIVATE_PARSE_CANARY",'));
  const iosLogs = httpLogs.filter((item) => item.channel === "ios");
  assert.deepEqual(iosLogs.map((item) => item.status_code), [400, 201, 413]);
});

test("unconfigured or wrong API credentials fail closed before persistence", async () => {
  for (const apiToken of [undefined, "", " \t "]) {
    const { app, database } = fixture({ apiToken });
    assert.equal((await request(app).post("/argo/missions").set("x-argo-api-key", "argo-test-token").send(mission())).status, 503);
    assert.equal((await request(app).get(`/argo/missions/${uuid(1)}`).set("Authorization", "Bearer wrong")).status, 503);
    assert.equal(database.calls.length, 0);
  }
  const { app, database } = fixture();
  for (const method of ["post", "get"]) {
    const path = method === "post" ? "/argo/missions" : `/argo/missions/${uuid(1)}`;
    for (const credential of [undefined, "wrong"]) {
      const req = request(app)[method](path);
      if (credential) req.set("Authorization", `Bearer ${credential}`);
      if (method === "post") req.send(mission());
      assert.equal((await req).status, 401);
    }
    for (const unsupported of [API_TOKEN, `Basic ${API_TOKEN}`]) {
      const req = request(app)[method](path).set("Authorization", unsupported);
      if (method === "post") req.send(mission());
      assert.equal((await req).status, 401, "only documented Bearer or x-argo-api-key credentials are accepted");
    }
  }
  assert.equal(database.calls.length, 0);
});

test("mission validation, invalid lookup UUID and missing records never manufacture database success", async () => {
  const { app, database } = fixture();
  for (const invalid of [null, {}, { ...mission(), id: "invalid-uuid" }, { ...mission(), produttori: [] }]) {
    const response = await request(app).post("/argo/missions").set("x-argo-api-key", API_TOKEN).send(invalid);
    // Express's strict JSON parser rejects literal null before schema validation.
    assert.ok([400, 422].includes(response.status));
  }
  const invalidId = await request(app).get("/argo/missions/PRIVATE_INVALID_UUID_CANARY").set("x-argo-api-key", API_TOKEN);
  assert.equal(invalidId.status, 400);
  assert.equal(database.calls.length, 0, "validation failures must not reach SQL");
  const missing = await request(app).get(`/argo/missions/${uuid(9)}`).set("x-argo-api-key", API_TOKEN);
  assert.equal(missing.status, 404);
  assert.equal(database.calls.length, 1);
  const unconfigured = fixture({ database: null });
  assert.equal((await request(unconfigured.app).post("/argo/missions").set("x-argo-api-key", API_TOKEN).send(mission())).status, 503);
  assert.equal((await request(unconfigured.app).get(`/argo/missions/${uuid(1)}`).set("x-argo-api-key", API_TOKEN)).status, 503);
});

test("concurrent UUID retries and a second mission preserve distinct first-write records through the SQL seam", async () => {
  const { app, database } = fixture();
  const firstMission = mission(uuid(1));
  const secondMission = mission(uuid(2));
  const responses = await Promise.all([
    ...Array.from({ length: 8 }, () => request(app).post("/argo/missions").set("x-argo-api-key", API_TOKEN).send(firstMission)),
    request(app).post("/argo/missions").set("x-argo-api-key", API_TOKEN).send(secondMission)
  ]);
  assert.equal(responses.filter((item) => item.status === 201).length, 2);
  assert.equal(responses.filter((item) => item.status === 200).length, 7);
  assert.equal(database.payloads.size, 2);
  for (const expected of [firstMission, secondMission]) {
    const result = await request(app).get(`/argo/missions/${expected.id}`).set("Authorization", `Bearer ${API_TOKEN}`);
    assert.equal(result.status, 200);
    assert.deepEqual(result.body, expected);
  }
});

test("database errors and unmatched paths cannot expose payloads, credentials or raw identifiers in logs", async () => {
  const privateError = `PRIVATE_DB_CANARY password=${API_TOKEN} postgres://PRIVATE_DSN_CANARY`;
  const { app, httpLogs, ingestionLogs, errors } = fixture({ database: {
    async query() { throw new Error(privateError); }
  } });
  const payload = mission();
  assert.equal((await request(app).post("/argo/missions").set("x-argo-api-key", API_TOKEN).send(payload)).status, 500);
  assert.equal((await request(app).get(`/argo/missions/${payload.id}`).set("Authorization", `Bearer ${API_TOKEN}`)).status, 500);
  assert.equal((await request(app).get(`/PRIVATE_UNMATCHED_CANARY/${payload.id}?token=${API_TOKEN}`)).status, 404);
  assert.equal((await request(app).post(`/OTHER_PRIVATE_UNMATCHED_CANARY/${payload.id}`).send({ token: API_TOKEN })).status, 404);
  assert.equal(errors.length, 2);
  const unmatched = httpLogs.filter((entry) => entry.status_code === 404);
  assert.equal(unmatched.length, 2);
  assert.equal(unmatched[0].path, unmatched[1].path, "unmatched requests must use a fixed route label");
  const serialized = JSON.stringify({ httpLogs, ingestionLogs, errors });
  assert.doesNotMatch(serialized, /PRIVATE_DB_CANARY|PRIVATE_DSN_CANARY|PRIVATE_UNMATCHED_CANARY|OTHER_PRIVATE_UNMATCHED_CANARY|PRIVATE_PRODUCER_CANARY/);
  assert.equal(serialized.includes(payload.id), false);
  assert.equal(serialized.includes(API_TOKEN), false);
});

test("both HTTP and ingestion log sink failures preserve acknowledgements, mission writes and safe errors", async () => {
  const sinkError = new Error("PRIVATE_SINK_CANARY");
  const { app, database } = fixture({
    logger: { log() { throw sinkError; }, error() { throw sinkError; }, warn() { throw sinkError; } },
    writeLog() { throw sinkError; }
  });
  assert.equal((await request(app).post("/webhook").send({})).status, 200);
  assert.equal((await request(app).post("/argo/wearable/callback").send({})).status, 200);
  assert.equal((await request(app).post("/argo/missions").set("x-argo-api-key", API_TOKEN).send(mission())).status, 201);
  assert.equal(database.payloads.size, 1);
  assert.equal((await request(app).post("/webhook").type("json").send("{")).status, 400);
});
