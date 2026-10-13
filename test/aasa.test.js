const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { once } = require("node:events");
const { createApp } = require("../server");
const { randomUUID, createHash } = require("node:crypto");
const records = [];

let server;
let base;
before(async () => {
  const previous = process.env.VERIFY_TOKEN;
  let app;
  try {
    process.env.VERIFY_TOKEN = randomUUID();
    app = createApp({ writeLog: line => records.push(JSON.parse(line)) });
  } finally {
    if (previous === undefined) delete process.env.VERIFY_TOKEN;
    else process.env.VERIFY_TOKEN = previous;
  }
  server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  if (server) await new Promise((resolve, reject) =>
    server.close(error => error ? reject(error) : resolve()));
});

test("extensionless AASA returns 200, JSON MIME, exact body and no redirect", async () => {
  const response = await fetch(base + "/.well-known/apple-app-site-association", {
    redirect: "manual"
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("location"), null);
  assert.equal(response.redirected, false);
  assert.match(response.headers.get("content-type"), /^application\/json(?:;|$)/i);
  assert.deepEqual(JSON.parse(await response.text()), {
    applinks: {
      details: [{
        appIDs: ["N6JGN24QMU.it.vincenzocalce.argo.wearable"],
        components: [{ "/": "/argo/wearable/callback" }]
      }]
    }
  });
});

test("only the exact AASA path is served; no .json or directory redirects", async () => {
  for (const path of [
    "/.well-known/apple-app-site-association.json",
    "/.well-known/apple-app-site-association/",
    "/.well-known/apple-app-site-association/extra",
    "/.well-known/APPLE-APP-SITE-ASSOCIATION",
    "/apple-app-site-association",
    "/.well-known"
  ]) {
    const response = await fetch(base + path, { redirect: "manual" });
    assert.equal(response.status, 404, path);
    assert.equal(response.headers.get("location"), null, path);
    await response.text();
  }
});

test("documented callback including query remains available with no redirect", async () => {
  const response = await fetch(base + "/argo/wearable/callback?source=aasa-test", {
    redirect: "manual"
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("location"), null);
  assert.deepEqual(await response.json(), {
    status: "ok",
    service: "argo-field-gateway-v2",
    channel: "wearable",
    endpoint: "/argo/wearable/callback"
  });
});

test("HEAD exposes JSON MIME without a response body", async () => {
  const response = await fetch(base + "/.well-known/apple-app-site-association", {
    method: "HEAD", redirect: "manual"
  });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /^application\/json(?:;|$)/i);
  assert.equal(response.headers.get("location"), null);
  assert.equal(await response.text(), "");
});


test("AASA requests do not produce ingestion logs; wearable POST retains 5V", async () => {
  records.length = 0;
  await (await fetch(base + "/.well-known/apple-app-site-association")).text();
  assert.equal(records.length, 0);
  const body = '{"event_id":"synthetic-aasa-integration"}';
  const response = await fetch(base + "/argo/wearable/callback", {
    method: "POST", headers: { "Content-Type": "application/json" }, body
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "received", channel: "wearable" });
  assert.equal(records.length, 1);
  assert.equal(records[0].channel, "wearable");
  assert.equal(records[0].raw_bytes, Buffer.byteLength(body));
  assert.equal(records[0].raw_sha256, createHash("sha256").update(body).digest("hex"));
  assert.equal(records[0].http_status, 200);
});

test("callback descendants and suffixes are not implemented HTTP routes", async () => {
  for (const path of ["/argo/wearable/callback/extra", "/argo/wearable/callbackExtra"]) {
    for (const method of ["GET", "POST"]) {
      const response = await fetch(base + path, { method, redirect: "manual" });
      assert.equal(response.status, 404);
      assert.equal(response.headers.get("location"), null);
      await response.text();
    }
  }
});
