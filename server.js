const { createApp } = require("./src/app");
const { createDatabase, ensureSchema } = require("./src/database");

const PORT = process.env.PORT || 3000;
const database = createDatabase(process.env.DATABASE_URL);

async function start() {
  if (database) {
    await ensureSchema(database);
  } else {
    console.warn("DATABASE_URL non configurata: le API missioni risponderanno 503");
  }

  const app = createApp({
    database,
    apiToken: process.env.ARGO_API_TOKEN,
    verifyToken: process.env.VERIFY_TOKEN
  });

  app.listen(PORT, () => {
    console.log(`ARGO Field Gateway v2 attivo sulla porta ${PORT}`);
  });
}

start().catch((error) => {
  console.error("Avvio ARGO non riuscito:", error.message);
  process.exit(1);
});
