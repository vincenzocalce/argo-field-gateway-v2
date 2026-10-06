const express = require("express");
const fs = require("node:fs");
const path = require("node:path");
const appleAppSiteAssociation = JSON.parse(
  fs.readFileSync(path.join(__dirname, ".well-known/apple-app-site-association"), "utf8")
);

const app = express();
const PORT = process.env.PORT || 3000;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || "argo-test-token";

app.use(express.json());

// Exact extensionless endpoint: no static-directory redirects or wildcard grants.
app.get(/^\/\.well-known\/apple-app-site-association$/, (req, res) => {
  res.status(200).type("application/json").json(appleAppSiteAssociation);
});

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
  console.log("Messaggio ricevuto da Meta/WhatsApp:");
  console.log(JSON.stringify(req.body, null, 2));

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
  console.log("Wearable callback ricevuta:");
  console.log(JSON.stringify(req.body, null, 2));

  res.status(200).json({
    status: "received",
    channel: "wearable"
  });
});
if (require.main === module) {
  app.listen(PORT, () => {
    console.log("ARGO Field Gateway v2 attivo sulla porta " + PORT);
  });
}

module.exports = app;
