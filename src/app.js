const express = require("express");
const { createHash } = require("node:crypto");
const { validateMission } = require("./validation");
const { saveMission, findMission } = require("./database");

function missionReference(req) {
  const rawId = req.body?.id || req.params?.id || req.path.match(/^\/argo\/missions\/([^/]+)$/)?.[1];
  if (!rawId) return undefined;
  return createHash("sha256").update(String(rawId)).digest("hex").slice(0, 12);
}

function requestChannel(path) {
  if (path.startsWith("/argo/missions")) return "ios";
  if (path.startsWith("/argo/wearable")) return "wearable";
  if (path === "/webhook") return "meta";
  return "service";
}

function createApp({ database = null, apiToken, verifyToken, logger = console } = {}) {
  const app = express();
  const webhookToken = verifyToken || "argo-test-token";

  app.disable("x-powered-by");
  app.use(express.json({ limit: "1mb" }));
  app.use((req, res, next) => {
    const startedAt = process.hrtime.bigint();
    res.on("finish", () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
      const event = {
        timestamp: new Date().toISOString(),
        event: "http_request",
        channel: requestChannel(req.path),
        method: req.method,
        path: req.route?.path || req.path,
        status_code: res.statusCode,
        duration_ms: Number(durationMs.toFixed(1))
      };
      const missionRef = missionReference(req);
      if (missionRef) event.mission_ref = missionRef;
      logger.log(JSON.stringify(event));
    });
    next();
  });

  app.get("/", (_req, res) => {
    res.json({ status: "ok", service: "argo-field-gateway-v2", database: database ? "configured" : "not_configured" });
  });

  app.get("/webhook", (req, res) => {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];
    if (mode === "subscribe" && token === webhookToken) {
      logger.log("Webhook Meta verificato");
      return res.status(200).send(challenge);
    }
    return res.sendStatus(403);
  });

  app.post("/webhook", (req, res) => {
    const entries = Array.isArray(req.body?.entry) ? req.body.entry.length : 0;
    logger.log("Evento Meta ricevuto", { entries });
    res.sendStatus(200);
  });

  app.get("/argo/wearable/callback", (_req, res) => {
    res.status(200).json({ status: "ok", service: "argo-field-gateway-v2", channel: "wearable", endpoint: "/argo/wearable/callback" });
  });

  app.post("/argo/wearable/callback", (req, res) => {
    logger.log("Evento wearable ricevuto", { eventType: typeof req.body?.type === "string" ? req.body.type : "unknown" });
    res.status(200).json({ status: "received", channel: "wearable" });
  });

  function requireApiToken(req, res, next) {
    if (!apiToken) {
      return res.status(503).json({ error: "service_not_configured", message: "ARGO_API_TOKEN non configurato sul server" });
    }
    const bearer = req.get("authorization")?.replace(/^Bearer\s+/i, "");
    const supplied = req.get("x-argo-api-key") || bearer;
    if (supplied !== apiToken) return res.status(401).json({ error: "unauthorized" });
    next();
  }

  app.post("/argo/missions", requireApiToken, async (req, res, next) => {
    try {
      if (!database) return res.status(503).json({ error: "database_not_configured", message: "DATABASE_URL non configurata sul server" });
      const errors = validateMission(req.body);
      if (errors.length > 0) return res.status(422).json({ error: "invalid_mission", details: errors });
      const result = await saveMission(database, req.body);
      return res.status(result.created ? 201 : 200).json({ status: result.created ? "created" : "already_exists", id: req.body.id });
    } catch (error) {
      next(error);
    }
  });

  app.get("/argo/missions/:id", requireApiToken, async (req, res, next) => {
    try {
      if (!database) return res.status(503).json({ error: "database_not_configured" });
      const mission = await findMission(database, req.params.id);
      if (!mission) return res.status(404).json({ error: "not_found" });
      return res.json(mission);
    } catch (error) {
      next(error);
    }
  });

  app.use((error, _req, res, _next) => {
    logger.error("Errore richiesta ARGO", { name: error.name, message: error.message });
    res.status(500).json({ error: "internal_error" });
  });

  return app;
}

module.exports = { createApp };
