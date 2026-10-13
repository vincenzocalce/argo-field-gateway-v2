const { missionReference } = require("./src/privacy");
const { validateVerifyToken } = require("./src/config");
const { createApp } = require("./src/app");
const { createDatabase, ensureSchema, getDatabaseDiagnostics } = require("./src/database");

async function start({ env = process.env, logger = console,
  databaseFactory = createDatabase, schemaInitializer = ensureSchema,
  diagnosticsReader = getDatabaseDiagnostics } = {}) {
  // Fail before constructing a Pool, performing SQL or opening an HTTP listener.
  const verifyToken = validateVerifyToken(env.VERIFY_TOKEN);
  const database = databaseFactory(env.DATABASE_URL);
  let server;
  try {
    if (database) {
      await schemaInitializer(database);
      const diagnostics = await diagnosticsReader(database);
      logger.log(JSON.stringify({
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
    } else {
      logger.warn("DATABASE_URL non configurata: le API missioni risponderanno 503");
    }

    const app = createApp({ database, apiToken: env.ARGO_API_TOKEN, verifyToken, logger });
    const port = env.PORT || 3000;
    await new Promise((resolve, reject) => {
      server = app.listen(port, resolve);
      server.once("error", reject);
    });
    logger.log(`ARGO Field Gateway v2 attivo sulla porta ${server.address().port}`);
    return { app, server, database };
  } catch (error) {
    if (server?.listening) await new Promise(resolve => server.close(resolve));
    if (database?.end) await database.end().catch(() => {});
    throw error;
  }
}

// One factory, available through both imports; importing never starts SQL/HTTP.
module.exports = { createApp, start };

if (require.main === module) {
  start().catch(() => {
    // No connection URL, database error detail or token value on stderr.
    const token = process.env.VERIFY_TOKEN;
    if (typeof token !== "string" || token.trim().length === 0) {
      console.error("Configurazione non valida: VERIFY_TOKEN è obbligatorio e non può essere vuoto.");
    } else {
      console.error("Avvio ARGO non riuscito: verificare configurazione e disponibilità del database.");
    }
    process.exitCode = 1;
  });
}
