const express = require("express");
const fs = require("node:fs");
const path = require("node:path");
const { observability5v } = require("../observability-5v");
const { validateVerifyToken } = require("./config");
const { missionReference } = require("./privacy");
const { validateMission, isValidMissionId } = require("./validation");
const { saveMission, findMission } = require("./database");
const { ZenitUpstreamError, isValidVehicleId, validateWindow } = require("./zenit-client");

function missionReferenceFromRequest(req) {
  const rawId = req.body?.id || req.params?.id || req.path.match(/^\/argo\/missions\/([^/]+)$/)?.[1];
  return missionReference(rawId);
}

function requestChannel(path) {
  path = path.toLowerCase();
  if (path.startsWith("/argo/missions")) return "ios";
  if (path.startsWith("/argo/telemetry")) return "zenit";
  if (path.startsWith("/argo/wearable")) return "wearable";
  if (path === "/webhook") return "meta";
  return "service";
}

function createApp({ database = null, apiToken, zenitClient = null,
  verifyToken = process.env.VERIFY_TOKEN, logger = console, writeLog } = {}) {
  const webhookToken = validateVerifyToken(verifyToken);
  const appleAppSiteAssociation = JSON.parse(
    fs.readFileSync(path.join(__dirname, "../.well-known/apple-app-site-association"), "utf8")
  );
  const app = express();
  const safeLog = (method, ...values) => {
    try { logger[method]?.(...values); } catch { /* telemetry must not change HTTP */ }
  };

  app.disable("x-powered-by");
  // Observe the original wire entity before either JSON parser (including gzip).
  app.use(observability5v({ writeLog: writeLog || (line => safeLog("log", line)) }));
  app.use((req, res, next) => {
    const startedAt = process.hrtime.bigint();
    res.on("finish", () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
      const event = {
        timestamp: new Date().toISOString(),
        event: "http_request",
        channel: requestChannel(req.path),
        method: req.method,
        // No raw URL/UUID/query in unmatched request logs.
        path: typeof req.route?.path === "string" ? req.route.path : "<unmatched>",
        status_code: res.statusCode,
        duration_ms: Number(durationMs.toFixed(1))
      };
      const missionRef = missionReferenceFromRequest(req);
      if (missionRef) event.mission_ref = missionRef;
      safeLog("log", JSON.stringify(event));
    });
    next();
  });
  // Preserve PR #7's 100 KB limit on Meta/wearable; iOS missions need 1 MB.
  app.use("/argo/missions", express.json({ limit: "1mb" }));
  app.use(express.json());

  app.get(/^\/\.well-known\/apple-app-site-association$/, (_req, res) => {
    res.status(200).type("application/json").json(appleAppSiteAssociation);
  });

  app.get("/", (_req, res) => {
    res.json({ status: "ok", service: "argo-field-gateway-v2", database: database ? "configured" : "not_configured" });
  });

  app.get("/webhook", (req, res) => {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];
    if (mode === "subscribe" && token === webhookToken) {
      safeLog("log", "Webhook Meta verificato");
      return res.status(200).send(challenge);
    }
    return res.sendStatus(403);
  });

  app.post("/webhook", (_req, res) => {
    res.sendStatus(200);
  });

  app.get("/argo/wearable/callback", (_req, res) => {
    res.status(200).json({ status: "ok", service: "argo-field-gateway-v2", channel: "wearable", endpoint: "/argo/wearable/callback" });
  });

  app.post("/argo/wearable/callback", (_req, res) => {
    res.status(200).json({ status: "received", channel: "wearable" });
  });

  function requireApiToken(req, res, next) {
    if (typeof apiToken !== "string" || apiToken.trim().length === 0) {
      return res.status(503).json({ error: "service_not_configured", message: "ARGO_API_TOKEN non configurato sul server" });
    }
    const bearer = /^Bearer\s+(.+)$/i.exec(req.get("authorization") || "")?.[1];
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
      if (!isValidMissionId(req.params.id)) return res.status(400).json({ error: "invalid_mission_id" });
      const mission = await findMission(database, req.params.id);
      if (!mission) return res.status(404).json({ error: "not_found" });
      return res.json(mission);
    } catch (error) {
      next(error);
    }
  });

  app.get("/argo/telemetry/vehicles", requireApiToken, async (_req, res, next) => {
    try {
      if (!zenitClient) return res.status(503).json({ error: "zenit_not_configured" });
      const vehicles = await zenitClient.listVehicles();
      return res.json({ provider: "zenit", capturedAt: new Date().toISOString(), vehicles });
    } catch (error) {
      next(error);
    }
  });

  app.get("/argo/telemetry/vehicles/:vehicleId/daily", requireApiToken, async (req, res, next) => {
    try {
      if (!zenitClient) return res.status(503).json({ error: "zenit_not_configured" });
      if (!isValidVehicleId(req.params.vehicleId)) return res.status(400).json({ error: "invalid_vehicle_id" });
      const windowError = validateWindow(req.query.from, req.query.to);
      if (windowError) return res.status(400).json({ error: "invalid_window", message: windowError });
      const telemetry = await zenitClient.getDailyTelemetry(req.params.vehicleId, {
        from: req.query.from,
        to: req.query.to
      });
      return res.json(telemetry);
    } catch (error) {
      next(error);
    }
  });

  app.use((error, _req, res, next) => {
    if (res.headersSent) return next(error);
    if (error instanceof ZenitUpstreamError) {
      if (error.retryAfter) res.set("Retry-After", error.retryAfter);
      safeLog("error", JSON.stringify({ event: "zenit_error", status_code: error.status, error: error.code }));
      return res.status(error.status).json({ error: error.code });
    }
    // Parser failures keep their HTTP contract. DB details/payload never enter logs.
    const parserErrors = {
      "entity.parse.failed": [400, "invalid_json"],
      "entity.too.large": [413, "payload_too_large"],
      "encoding.unsupported": [415, "unsupported_encoding"],
      "charset.unsupported": [415, "unsupported_charset"],
      "request.aborted": [400, "request_aborted"],
      "request.size.invalid": [400, "invalid_body_size"]
    };
    // Decompression failures carry a 4xx status without a body-parser type.
    const clientStatus = Number.isInteger(error.status) && error.status >= 400 && error.status < 500;
    const [status, code] = parserErrors[error.type] || (clientStatus
      ? [error.status, "invalid_request"] : [500, "internal_error"]);
    safeLog("error", JSON.stringify({ event: "request_error", status_code: status, error: code }));
    res.status(status).json({ error: code });
  });

  return app;
}

module.exports = { createApp };
