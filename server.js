const express = require("express");

const { observability5v } = require("./observability-5v");

function createApp(options = {}) {
  const app = express();
  const VERIFY_TOKEN = process.env.VERIFY_TOKEN || "argo-test-token";

  app.use(observability5v(options));
  app.use(express.json());

  app.get("/", (req, res) => {
    res.json({
      status: "ok",
      service: "argo-field-gateway-v2"
    });
  });

  app.get("/webhook", (req, res) => {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      console.log("Webhook verificato correttamente");
      return res.status(200).send(challenge);
    }

    console.log("Verifica webhook fallita");
    return res.sendStatus(403);
  });

  app.post("/webhook", (req, res) => {

    res.sendStatus(200);
  });
  app.get("/argo/wearable/callback", (req, res) => {
    res.status(200).json({
      status: "ok",
      service: "argo-field-gateway-v2",
      channel: "wearable",
      endpoint: "/argo/wearable/callback"
    });
  });

  app.post("/argo/wearable/callback", (req, res) => {

    res.status(200).json({
      status: "received",
      channel: "wearable"
    });
  });
  return app;
}

module.exports = { createApp };

if (require.main === module) createApp().listen(process.env.PORT || 3000, () => {
  console.log("ARGO Field Gateway v2 attivo sulla porta " + (process.env.PORT || 3000));
});
