const test = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID, createHash } = require("node:crypto");
const request = require("supertest");
const { createApp } = require("../../src/app");
const { createDatabase, ensureSchema, getDatabaseDiagnostics } = require("../../src/database");
const { validMission } = require("../helpers/mission");

// Do not silently skip integration tests or use DATABASE_URL from an operational
// environment. This suite creates and drops only its own unique schemas.
const connectionString = process.env.ARGO_TEST_DATABASE_URL;
if (!connectionString) {
  throw new Error("ARGO_TEST_DATABASE_URL is required for real PostgreSQL integration tests");
}
const connection = new URL(connectionString);
const databaseName = decodeURIComponent(connection.pathname.slice(1));
if (!["postgres:", "postgresql:"].includes(connection.protocol) || !/(^|[_-])test($|[_-])/i.test(databaseName)) {
  throw new Error("ARGO_TEST_DATABASE_URL must identify an explicitly named test database (e.g. argo_gateway_test)");
}

const API_TOKEN = "synthetic-api-token-for-postgres-suite";
const VERIFY_TOKEN = "synthetic-verify-token-for-postgres-suite";

function captureLogger() {
  const lines = [];
  return {
    lines,
    logger: {
      log(...args) { lines.push(args.map((value) => typeof value === "string" ? value : JSON.stringify(value)).join(" ")); },
      error(...args) { lines.push(args.map((value) => typeof value === "string" ? value : JSON.stringify(value)).join(" ")); }
    },
    writeLog(line) { lines.push(line); }
  };
}

async function isolatedDatabase(t) {
  const schema = `argo_test_${randomUUID().replaceAll("-", "")}`;
  const admin = createDatabase(connectionString);
  const scopedConnection = new URL(connectionString);
  scopedConnection.searchParams.set("options", `-c search_path=${schema}`);
  let database;
  let schemaCreated = false;
  t.after(async () => {
    try {
      if (database) await database.end();
      if (schemaCreated) await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
    } finally {
      await admin.end();
    }
  });
  await admin.query(`CREATE SCHEMA "${schema}"`);
  schemaCreated = true;
  database = createDatabase(scopedConnection.toString());
  assert.equal((await database.query("SELECT current_schema() AS schema")).rows[0].schema, schema);
  await ensureSchema(database);
  return {
    database,
    schema,
    connectionString: scopedConnection.toString(),
    async restartPool() {
      await database.end();
      database = createDatabase(scopedConnection.toString());
      this.database = database;
      return database;
    }
  };
}

function appFor(database, capture = captureLogger()) {
  return createApp({ database, apiToken: API_TOKEN, verifyToken: VERIFY_TOKEN, logger: capture.logger, writeLog: capture.writeLog });
}

function postMission(app, mission) {
  return request(app).post("/argo/missions").set("authorization", `Bearer ${API_TOKEN}`).send(mission);
}

function getMission(app, id) {
  return request(app).get(`/argo/missions/${id}`).set("x-argo-api-key", API_TOKEN);
}

test("PostgreSQL: ensureSchema is repeatable and retains existing missions", async (t) => {
  const { database } = await isolatedDatabase(t);
  const mission = validMission();
  assert.equal((await postMission(appFor(database), mission)).status, 201);
  await ensureSchema(database);
  await ensureSchema(database);
  const rows = await database.query("SELECT id::text AS id, payload FROM argo_missions");
  assert.equal(rows.rowCount, 1);
  assert.equal(rows.rows[0].id, mission.id);
  assert.deepEqual(rows.rows[0].payload, mission);
  const indexes = await database.query("SELECT indexname FROM pg_indexes WHERE schemaname = current_schema()");
  assert.ok(indexes.rows.some((row) => row.indexname === "argo_missions_date_idx"));
});

test("PostgreSQL: HTTP insert/read retains the complete mission and two UUIDs remain distinct", async (t) => {
  const { database } = await isolatedDatabase(t);
  const app = appFor(database);
  const missions = [validMission(), validMission({ alias: "SECOND_TEST_OPERATOR" })];
  for (const mission of missions) {
    const response = await postMission(app, mission);
    assert.equal(response.status, 201);
    assert.deepEqual(response.body, { status: "created", id: mission.id });
    const read = await getMission(app, mission.id);
    assert.equal(read.status, 200);
    assert.deepEqual(read.body, mission);
  }
  const rows = await database.query("SELECT id, producer_count FROM argo_missions");
  assert.equal(rows.rowCount, 2);
  assert.equal(new Set(rows.rows.map((row) => row.id)).size, 2);
  assert.ok(rows.rows.every((row) => row.producer_count === 1));
});

test("PostgreSQL: UUID retry, including upper case, creates only one row", async (t) => {
  const { database } = await isolatedDatabase(t);
  const app = appFor(database);
  const mission = validMission({ id: "abcdef12-abcd-4abc-8abc-abcdef123456" });
  const initial = await postMission(app, mission);
  const retry = await postMission(app, mission);
  const upperCaseRetry = await postMission(app, { ...mission, id: mission.id.toUpperCase() });
  assert.equal(initial.status, 201);
  for (const response of [retry, upperCaseRetry]) {
    assert.equal(response.status, 200);
    assert.equal(response.body.status, "already_exists");
  }
  assert.equal((await database.query("SELECT COUNT(*)::integer AS count FROM argo_missions")).rows[0].count, 1);
  const read = await getMission(app, mission.id.toUpperCase());
  assert.equal(read.status, 200);
  assert.deepEqual(read.body, mission);
});

test("PostgreSQL: concurrent retries of the same UUID have one winner and one row", async (t) => {
  const { database } = await isolatedDatabase(t);
  const app = appFor(database);
  const mission = validMission();
  const responses = await Promise.all(Array.from({ length: 12 }, () => postMission(app, mission)));
  assert.equal(responses.filter((response) => response.status === 201).length, 1);
  assert.equal(responses.filter((response) => response.status === 200).length, 11);
  assert.ok(responses.every((response) => ["created", "already_exists"].includes(response.body.status)));
  assert.equal((await database.query("SELECT COUNT(*)::integer AS count FROM argo_missions")).rows[0].count, 1);
  assert.deepEqual((await getMission(app, mission.id)).body, mission);
});

test("PostgreSQL: changed retry preserves the first payload and stored columns", async (t) => {
  const { database } = await isolatedDatabase(t);
  const app = appFor(database);
  const initial = validMission();
  const changed = structuredClone(initial);
  Object.assign(changed, { alias: "CHANGED_OPERATOR", mezzo: "CHANGED_VEHICLE", area: "CHANGED_AREA", data: "2026-10-12T10:00:00Z" });
  changed.produttori[1].attivo = true;
  changed.produttori[0].lotti[0].numero = "99";
  assert.equal((await postMission(app, initial)).status, 201);
  const before = (await database.query("SELECT * FROM argo_missions WHERE id = $1", [initial.id])).rows[0];
  assert.equal((await postMission(app, changed)).status, 200);
  const after = (await database.query("SELECT * FROM argo_missions WHERE id = $1", [initial.id])).rows[0];
  assert.deepEqual(after, before);
  assert.deepEqual((await getMission(app, initial.id)).body, initial);
});

test("PostgreSQL: app and Pool restart retain the mission and idempotency", async (t) => {
  const isolated = await isolatedDatabase(t);
  const mission = validMission();
  assert.equal((await postMission(appFor(isolated.database), mission)).status, 201);
  const restartedPool = await isolated.restartPool();
  await ensureSchema(restartedPool);
  const restartedApp = appFor(restartedPool);
  const read = await getMission(restartedApp, mission.id);
  assert.equal(read.status, 200);
  assert.deepEqual(read.body, mission);
  assert.equal((await postMission(restartedApp, mission)).status, 200);
  assert.equal((await restartedPool.query("SELECT COUNT(*)::integer AS count FROM argo_missions")).rows[0].count, 1);
});

test("PostgreSQL: diagnostics count persisted rows and bound recent results", async (t) => {
  const { database } = await isolatedDatabase(t);
  const app = appFor(database);
  const missions = [validMission(), validMission()];
  for (const mission of missions) assert.equal((await postMission(app, mission)).status, 201);
  assert.equal((await postMission(app, missions[0])).status, 200);
  const diagnostics = await getDatabaseDiagnostics(database, 1);
  assert.equal(diagnostics.total_rows, 2);
  assert.equal(diagnostics.distinct_ids, 2);
  assert.equal(diagnostics.duplicate_rows, 0);
  assert.ok(diagnostics.latest_created_at instanceof Date);
  assert.equal(diagnostics.recent_missions.length, 1);
  assert.deepEqual(Object.keys(diagnostics.recent_missions[0]).sort(), ["created_at", "id"]);
  assert.ok(missions.some((mission) => mission.id === diagnostics.recent_missions[0].id));
  assert.equal((await getDatabaseDiagnostics(database, 1000)).recent_missions.length, 2);
});

test("PostgreSQL: an actual SQL failure returns a sanitized error without leaking credentials or payload", async (t) => {
  const { database, schema } = await isolatedDatabase(t);
  const capture = captureLogger();
  const app = appFor(database, capture);
  const mission = validMission();
  await database.query("DROP TABLE argo_missions");
  const response = await postMission(app, mission);
  assert.equal(response.status, 500);
  assert.deepEqual(response.body, { error: "internal_error" });
  const combined = capture.lines.join("\n");
  for (const value of [API_TOKEN, VERIFY_TOKEN, mission.id, mission.alias, mission.mezzo, mission.produttori[0].nome, schema, connectionString, "argo_missions"]) {
    assert.ok(!combined.includes(value), `Logs must not expose ${value}`);
  }
});

test("PostgreSQL: security, AASA, 5V and mission APIs coexist in the same Express app", async (t) => {
  const { database } = await isolatedDatabase(t);
  const capture = captureLogger();
  const app = appFor(database, capture);
  const query = { "hub.mode": "subscribe", "hub.challenge": "synthetic-challenge" };
  const fallback = await request(app).get("/webhook").query({ ...query, "hub.verify_token": "argo-test-token" });
  assert.equal(fallback.status, 403);
  const verified = await request(app).get("/webhook").query({ ...query, "hub.verify_token": VERIFY_TOKEN });
  assert.equal(verified.status, 200);
  assert.equal(verified.text, query["hub.challenge"]);
  const aasa = await request(app).get("/.well-known/apple-app-site-association");
  assert.equal(aasa.status, 200);
  assert.match(aasa.headers["content-type"], /application\/json/);
  assert.equal(aasa.headers.location, undefined);
  assert.ok(aasa.body.applinks.details.some((detail) => detail.appIDs?.includes("N6JGN24QMU.it.vincenzocalce.argo.wearable")));
  const raw = JSON.stringify({ event_id: "synthetic-event", type: "integration_test" });
  const wearable = await request(app).post("/argo/wearable/callback").set("content-type", "application/json").send(raw);
  assert.equal(wearable.status, 200);
  const telemetry = capture.lines.map((line) => { try { return JSON.parse(line); } catch { return null; } })
    .find((entry) => entry?.schema === "argo.gateway.5v.v1" && entry.channel === "wearable");
  assert.ok(telemetry);
  assert.equal(telemetry.raw_bytes, Buffer.byteLength(raw));
  assert.equal(telemetry.raw_sha256, createHash("sha256").update(raw).digest("hex"));
  assert.equal(telemetry.raw_complete, true);
  assert.equal(telemetry.http_status, 200);
  const mission = validMission();
  assert.equal((await postMission(app, mission)).status, 201);
  assert.deepEqual((await getMission(app, mission.id)).body, mission);
});
