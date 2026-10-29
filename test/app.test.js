const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const { createApp: createGateway } = require("../src/app");
// Explicit synthetic configuration; the production factory has no fallback.
const createApp = options => createGateway({ verifyToken: "synthetic-ios-test-token", ...options });

function uuid(index) {
  return `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

function validMission() {
  return {
    id: uuid(1),
    data: "2026-10-10T10:00:00Z",
    alias: "ZIDANE",
    mezzo: "MEZZO03",
    area: "AGRO",
    produttori: Array.from({ length: 15 }, (_, producerIndex) => ({
      id: uuid(100 + producerIndex),
      attivo: producerIndex === 0,
      codice: `P${String(producerIndex + 1).padStart(2, "0")}`,
      nome: producerIndex === 0 ? "Produttore prova" : "",
      indirizzo: "",
      note: "",
      lotti: ["150106", "200301", "200108"].map((cer, lotIndex) => ({
        id: uuid(1000 + producerIndex * 10 + lotIndex),
        cer,
        numero: lotIndex === 0 ? "4" : "",
        litri: lotIndex === 0 ? "110" : "",
        marca: "",
        riempimento: "Non rilevato",
        kg: "",
        fontePeso: "Non rilevata",
        operatore: "",
        sollevamenti: "",
        minuti: "",
        modalita: "Non rilevata",
        note: ""
      }))
    }))
  };
}

function fakeDatabase() {
  const ids = new Set();
  const payloads = new Map();
  return {
    async query(sql, values) {
      if (sql.startsWith("INSERT")) {
        const id = values[0];
        if (ids.has(id)) return { rowCount: 0, rows: [] };
        ids.add(id);
        payloads.set(id, JSON.parse(values[6]));
        return { rowCount: 1, rows: [{ id }] };
      }
      if (sql.startsWith("SELECT")) {
        const payload = payloads.get(values[0]);
        return { rowCount: payload ? 1 : 0, rows: payload ? [{ payload }] : [] };
      }
      throw new Error("Query inattesa nel test");
    }
  };
}

test("health check non espone segreti", async () => {
  const response = await request(createApp()).get("/");
  assert.equal(response.status, 200);
  assert.equal(response.body.service, "argo-field-gateway-v2");
  assert.equal(response.body.database, "not_configured");
});

test("rifiuta missioni senza credenziale", async () => {
  const app = createApp({ database: fakeDatabase(), apiToken: "secret" });
  const response = await request(app).post("/argo/missions").send(validMission());
  assert.equal(response.status, 401);
});

test("valida la presenza dei 15 produttori", async () => {
  const app = createApp({ database: fakeDatabase(), apiToken: "secret" });
  const mission = validMission();
  mission.produttori = mission.produttori.slice(0, 14);
  const response = await request(app).post("/argo/missions").set("x-argo-api-key", "secret").send(mission);
  assert.equal(response.status, 422);
  assert.match(response.body.details.join(" "), /almeno 15/);
});

test("valida i tre CER per ogni produttore", async () => {
  const app = createApp({ database: fakeDatabase(), apiToken: "secret" });
  const mission = validMission();
  mission.produttori[0].lotti = mission.produttori[0].lotti.filter((lot) => lot.cer !== "200108");
  const response = await request(app).post("/argo/missions").set("x-argo-api-key", "secret").send(mission);
  assert.equal(response.status, 422);
  assert.match(response.body.details.join(" "), /200108/);
});

test("salva, legge e non duplica una missione", async () => {
  const database = fakeDatabase();
  const app = createApp({ database, apiToken: "secret" });
  const mission = validMission();
  const first = await request(app).post("/argo/missions").set("authorization", "Bearer secret").send(mission);
  const second = await request(app).post("/argo/missions").set("authorization", "Bearer secret").send(mission);
  const read = await request(app).get(`/argo/missions/${mission.id}`).set("x-argo-api-key", "secret");
  assert.equal(first.status, 201);
  assert.equal(first.body.status, "created");
  assert.equal(second.status, 200);
  assert.equal(second.body.status, "already_exists");
  assert.equal(read.status, 200);
  assert.equal(read.body.produttori.length, 15);
});

test("registra richieste iOS senza token, payload o UUID in chiaro", async () => {
  const lines = [];
  const logger = {
    log(value) {
      lines.push(typeof value === "string" ? value : JSON.stringify(value));
    },
    error(value) {
      lines.push(typeof value === "string" ? value : JSON.stringify(value));
    }
  };
  const mission = validMission();
  const app = createApp({ database: fakeDatabase(), apiToken: "secret", logger });

  const response = await request(app)
    .post("/argo/missions")
    .set("authorization", "Bearer secret")
    .send(mission);

  assert.equal(response.status, 201);
  const combined = lines.join("\n");
  assert.doesNotMatch(combined, /secret/);
  assert.doesNotMatch(combined, /Produttore prova/);
  assert.doesNotMatch(combined, new RegExp(mission.id));

  const requestLog = lines.map((line) => JSON.parse(line)).find((entry) => entry.event === "http_request");
  assert.equal(requestLog.channel, "ios");
  assert.equal(requestLog.method, "POST");
  assert.equal(requestLog.path, "/argo/missions");
  assert.equal(requestLog.status_code, 201);
  assert.match(requestLog.mission_ref, /^[a-f0-9]{12}$/);
});
