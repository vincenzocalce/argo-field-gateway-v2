const express = require("express");

const app = express();
app.use(express.json({ limit: "10mb" }));

const PORT = process.env.PORT || 10000;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || "argo-test-token";

app.get("/", (req, res) => {
  res.status(200).json({
    status: "ok",
    service: "argo-field-gateway-v2"
  });
});

app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
});

app.post("/webhook", (req, res) => {
  const body = req.body;

  console.log(JSON.stringify({
    event: "webhook_received",
    timestamp: new Date().toISOString(),
    body
  }));

  const entries = body.entry || [];

  for (const entry of entries) {
    const changes = entry.changes || [];

    for (const change of changes) {
      const value = change.value || {};
      const messages = value.messages || [];

      for (const message of messages) {
        if (message.type === "text") {
          console.log(JSON.stringify({
            event: "text_received",
            messageId: message.id,
            from: message.from,
            text: message.text?.body || null
          }));
        }

        if (message.type === "image") {
          console.log(JSON.stringify({
            event: "image_received",
            messageId: message.id,
            from: message.from,
            mediaId: message.image?.id || null,
            mimeType: message.image?.mime_type || null,
            sha256: message.image?.sha256 || null
          }));
        }
      }
    }
  }

  res.sendStatus(200);
});

app.listen(PORT, () => {
  console.log(ARGO Field Gateway v2 attivo sulla porta ${PORT});
});
