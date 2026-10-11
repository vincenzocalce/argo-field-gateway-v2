const { missionReference } = require("./src/privacy");
const { createApp } = require("./src/app");
const { createDatabase, ensureSchema, getDatabaseDiagnostics } = require("./src/database");

const PORT = process.env.PORT || 3000;
const database = createDatabase(process.env.DATABASE_URL);

async function logDatabaseDiagnostics() {
  const diagnostics = await getDatabaseDiagnostics(database);
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    event: "database_diagnostics",
    total_rows: diagnostics.total_rows,
    distinct_ids: diagnostics.distinct_ids,
    duplicate_rows: diagnostics.duplicate_rows,
    latest_created_at: diagnostics.latest_created_at,
    recent_mission_refs: diagnostics.recent_missions.map((mission) => ({
      mission_ref: missionReference(mission.id),
      created_at: mission.created_at
    }))
  }));
}

async function start() {
  if (database) {
    await ensureSchema(database);
    await logDatabaseDiagnostics();
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
