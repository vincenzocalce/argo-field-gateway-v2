const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const { createApp } = require("../src/app");
const { createZenitClient, ZenitUpstreamError, validateWindow } = require("../src/zenit-client");

const VERIFY_TOKEN = "meta-test-token";
const ARGO_TOKEN = "argo-test-token";
const auth = { Authorization: `Bearer ${ARGO_TOKEN}` };

function appWith(zenitClient) {
  return createApp({ verifyToken: VERIFY_TOKEN, apiToken: ARGO_TOKEN, zenitClient, logger: { log() {}, error() {} } });
}

test("telemetria richiede il token ARGO e la configurazione Zenit", async () => {
  const app = appWith(null);
  await request(app).get("/argo/telemetry/vehicles").expect(401, { error: "unauthorized" });
  await request(app).get("/argo/telemetry/vehicles").set(auth).expect(503, { error: "zenit_not_configured" });
});

test("elenco mezzi passa solo attraverso il gateway autenticato", async () => {
  const zenitClient = {
    async listVehicles() { return [{ id: "veh_ABC123", plate: "EM599FG", capabilities: { position: true } }]; }
  };
  const response = await request(appWith(zenitClient))
    .get("/argo/telemetry/vehicles")
    .set(auth)
    .expect(200);
  assert.equal(response.body.provider, "zenit");
  assert.equal(response.body.vehicles[0].plate, "EM599FG");
  assert.match(response.body.capturedAt, /^\d{4}-/);
});

test("daily rifiuta ID e finestre non validi prima di chiamare Zenit", async () => {
  let calls = 0;
  const zenitClient = { async getDailyTelemetry() { calls += 1; return {}; } };
  const app = appWith(zenitClient);
  await request(app)
    .get("/argo/telemetry/vehicles/not-valid/daily")
    .query({ from: "2026-10-12T00:00:00+02:00", to: "2026-10-13T00:00:00+02:00" })
    .set(auth)
    .expect(400, { error: "invalid_vehicle_id" });
  const invalidWindow = await request(app)
    .get("/argo/telemetry/vehicles/veh_ABC123/daily")
    .query({ from: "2026-10-12", to: "2026-10-13" })
    .set(auth)
    .expect(400);
  assert.equal(invalidWindow.body.error, "invalid_window");
  assert.equal(calls, 0);
});

test("daily restituisce il riepilogo pronto per l'app", async () => {
  const expected = {
    provider: "zenit",
    vehicleId: "veh_ABC123",
    summary: { missionsCount: 7, distanceKm: 108.53, stopsCount: 7, stopMinutes: 1317 },
    missions: [], stops: [], latestPosition: null
  };
  const zenitClient = {
    async getDailyTelemetry(id, window) {
      assert.equal(id, "veh_ABC123");
      assert.deepEqual(window, { from: "2026-10-12T00:00:00+02:00", to: "2026-10-13T00:00:00+02:00" });
      return expected;
    }
  };
  const response = await request(appWith(zenitClient))
    .get("/argo/telemetry/vehicles/veh_ABC123/daily")
    .query({ from: "2026-10-12T00:00:00+02:00", to: "2026-10-13T00:00:00+02:00" })
    .set(auth)
    .expect(200);
  assert.deepEqual(response.body, expected);
});

test("errori Zenit sono redatti e Retry-After viene conservato", async () => {
  const zenitClient = {
    async listVehicles() { throw new ZenitUpstreamError("zenit_rate_limited", 503, { retryAfter: "10" }); }
  };
  const response = await request(appWith(zenitClient))
    .get("/argo/telemetry/vehicles")
    .set(auth)
    .expect(503, { error: "zenit_rate_limited" });
  assert.equal(response.headers["retry-after"], "10");
});

test("client Zenit pagina, normalizza e non espone la chiave", async () => {
  const calls = [];
  const responses = [
    { data: [{ id: "msn_1", distanceKm: 50 }], page: { nextCursor: "next" } },
    { data: [{ id: "stp_1", durationSeconds: 120, location: { lat: 40.8, lon: 14.2 } }], page: { nextCursor: null } },
    { data: { recordedAt: "2026-10-12T08:00:00Z", location: { lat: 40.8, lon: 14.2 } } },
    { data: [{ id: "msn_2", distanceKm: 58.53 }], page: { nextCursor: null } }
  ];
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), authorization: options.headers.Authorization });
    const body = responses.shift();
    return { ok: true, status: 200, headers: { get() { return null; } }, async json() { return body; } };
  };
  const client = createZenitClient({ apiKey: "secret-key", fetchImpl });
  const result = await client.getDailyTelemetry("veh_ABC123", {
    from: "2026-10-12T00:00:00+02:00",
    to: "2026-10-13T00:00:00+02:00"
  });
  assert.equal(result.summary.missionsCount, 2);
  assert.equal(result.summary.distanceKm, 108.53);
  assert.equal(result.summary.stopMinutes, 2);
  assert.ok(calls.some(call => call.url.includes("cursor=next")));
  assert.ok(calls.every(call => call.authorization === "Bearer secret-key"));
  assert.ok(calls.every(call => !call.url.includes("secret-key")));
});

test("finestra massima Zenit è 31 giorni", () => {
  assert.equal(validateWindow("2026-10-01T00:00:00Z", "2026-11-02T00:00:00Z"), "la finestra non può superare 31 giorni");
});
