const test = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const request = require("supertest");
const { createApp, start } = require("../server");

const cwd = path.resolve(__dirname, "..");

function captureLogger() {
  const lines = [];
  return {
    lines,
    logger: Object.fromEntries(["log", "error", "warn"].map((name) => [name, (...args) => lines.push(args)]))
  };
}

test("importing either entrypoint has no database, listener or logging side effects without VERIFY_TOKEN", () => {
  const env = { ...process.env, DATABASE_URL: "postgres://PRIVATE_IMPORT_DSN_CANARY", PORT: "0" };
  delete env.VERIFY_TOKEN;
  const result = spawnSync(process.execPath, ["-e", `
    const assert = require('node:assert/strict');
    const http = require('node:http');
    const pg = require('pg');
    http.Server.prototype.listen = () => { throw new Error('Import attempted to listen'); };
    pg.Pool = function () { throw new Error('Import attempted to create a database pool'); };
    for (const method of ['log', 'warn', 'error']) {
      console[method] = () => { throw new Error('Import attempted to log'); };
    }
    const factory = require('./src/app');
    const entrypoint = require('./server');
    assert.strictEqual(entrypoint.createApp, factory.createApp);
    assert.equal(typeof entrypoint.start, 'function');
    assert.throws(() => factory.createApp(), /VERIFY_TOKEN/);
  `], { cwd, env, encoding: "utf8", timeout: 5000 });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "");
});

for (const [label, token] of [["missing", undefined], ["empty", ""], ["blank", " \t "]]) {
  test(`startup rejects ${label} VERIFY_TOKEN before pool creation, schema checks or listening`, async () => {
    const { logger, lines } = captureLogger();
    const calls = [];
    const unexpected = (operation) => () => {
      calls.push(operation);
      throw new Error(`Startup unexpectedly reached ${operation}`);
    };
    await assert.rejects(start({
      env: { VERIFY_TOKEN: token, DATABASE_URL: "postgres://PRIVATE_STARTUP_DSN_CANARY", PORT: "0" },
      logger,
      databaseFactory: unexpected("databaseFactory"),
      schemaInitializer: unexpected("schemaInitializer"),
      diagnosticsReader: unexpected("diagnosticsReader")
    }), /VERIFY_TOKEN/);
    assert.deepEqual(calls, []);
    assert.equal(JSON.stringify(lines).includes("PRIVATE_STARTUP_DSN_CANARY"), false);
  });
}

test("startup uses one factory, initializes DB before listening and preserves configured HTTP behavior", async (t) => {
  const { logger, lines } = captureLogger();
  const calls = [];
  const database = { query() { throw new Error("Unexpected query in startup seam"); }, async end() {} };
  const result = await start({
    env: { VERIFY_TOKEN: "synthetic-startup-token", ARGO_API_TOKEN: "synthetic-api-token", DATABASE_URL: "postgres://PRIVATE_STARTUP_DSN_CANARY", PORT: "0" },
    logger,
    databaseFactory(dsn) {
      assert.equal(dsn, "postgres://PRIVATE_STARTUP_DSN_CANARY");
      calls.push("pool");
      return database;
    },
    async schemaInitializer(actual) { assert.equal(actual, database); calls.push("schema"); },
    async diagnosticsReader(actual) {
      assert.equal(actual, database);
      calls.push("diagnostics");
      return { total_rows: 0, distinct_ids: 0, duplicate_rows: 0, latest_created_at: null, recent_missions: [] };
    }
  });
  t.after(() => new Promise((resolve, reject) => result.server.close((error) => error ? reject(error) : resolve())));
  assert.deepEqual(calls, ["pool", "schema", "diagnostics"]);
  assert.equal(result.database, database);
  assert.equal(result.server.listening, true);
  assert.equal(typeof result.app, "function");
  const health = await request(result.app).get("/");
  assert.equal(health.status, 200);
  assert.equal(health.body.database, "configured");
  const handshake = await request(result.app).get("/webhook").query({
    "hub.mode": "subscribe", "hub.verify_token": "synthetic-startup-token", "hub.challenge": "123"
  });
  assert.equal(handshake.status, 200);
  assert.equal(handshake.text, "123");
  assert.doesNotMatch(JSON.stringify(lines), /PRIVATE_STARTUP_DSN_CANARY|synthetic-startup-token|synthetic-api-token/);
});

test("a schema failure closes the owned database and never opens a listener", () => {
  const env = { ...process.env };
  delete env.VERIFY_TOKEN;
  const result = spawnSync(process.execPath, ["-e", `
    const assert = require('node:assert/strict');
    const http = require('node:http');
    http.Server.prototype.listen = () => { throw new Error('Listener opened before schema was ready'); };
    const { start } = require('./server');
    let ended = 0;
    const database = { async end() { ended++; } };
    (async () => {
      await assert.rejects(start({
        env: { VERIFY_TOKEN: 'synthetic-startup-token', DATABASE_URL: 'synthetic-dsn', PORT: '0' },
        logger: { log() {}, error() {}, warn() {} },
        databaseFactory: () => database,
        schemaInitializer: async () => { throw new Error('PRIVATE_SCHEMA_ERROR_CANARY'); },
        diagnosticsReader: async () => { throw new Error('Diagnostics must not run after a schema failure'); }
      }));
      assert.equal(ended, 1);
    })().catch(error => { console.error(error); process.exitCode = 1; });
  `], { cwd, env, encoding: "utf8", timeout: 5000 });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "");
});

test("an HTTP listener failure rejects startup and closes the owned database", () => {
  const result = spawnSync(process.execPath, ["-e", `
    const assert = require('node:assert/strict');
    const http = require('node:http');
    let listeners = 0;
    http.Server.prototype.listen = function () {
      listeners++;
      process.nextTick(() => this.emit('error', new Error('PRIVATE_LISTENER_ERROR_CANARY')));
      return this;
    };
    const { start } = require('./server');
    let ended = 0;
    const database = { async end() { ended++; } };
    (async () => {
      await assert.rejects(start({
        env: { VERIFY_TOKEN: 'synthetic-startup-token', DATABASE_URL: 'synthetic-dsn', PORT: '0' },
        logger: { log() {}, error() {}, warn() {} },
        databaseFactory: () => database,
        schemaInitializer: async () => {},
        diagnosticsReader: async () => ({ total_rows: 0, distinct_ids: 0, duplicate_rows: 0, latest_created_at: null, recent_missions: [] })
      }));
      assert.equal(listeners, 1);
      assert.equal(ended, 1);
    })().catch(error => { console.error(error); process.exitCode = 1; });
  `], { cwd, encoding: "utf8", timeout: 5000 });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "");
});

test("valid token without DATABASE_URL starts legacy HTTP with the mission DB explicitly unavailable", async (t) => {
  const { logger } = captureLogger();
  const result = await start({
    env: { VERIFY_TOKEN: "synthetic-startup-token", ARGO_API_TOKEN: "synthetic-api-token", PORT: "0" },
    logger,
    databaseFactory: () => null,
    schemaInitializer: () => { throw new Error("Schema initialization without DB"); },
    diagnosticsReader: () => { throw new Error("Diagnostics without DB"); }
  });
  t.after(() => new Promise((resolve, reject) => result.server.close((error) => error ? reject(error) : resolve())));
  assert.equal(result.database, null);
  assert.equal((await request(result.app).get("/")).body.database, "not_configured");
  assert.equal((await request(result.app).get("/argo/missions/00000000-0000-4000-8000-000000000001").set("x-argo-api-key", "synthetic-api-token")).status, 503);
  assert.strictEqual(createApp, require("../src/app").createApp);
});
