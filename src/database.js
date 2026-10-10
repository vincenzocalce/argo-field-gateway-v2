const { Pool } = require("pg");

function createDatabase(connectionString) {
  if (!connectionString) return null;
  return new Pool({ connectionString, ssl: connectionString.includes("localhost") ? false : { rejectUnauthorized: false } });
}

async function ensureSchema(database) {
  await database.query(`
    CREATE TABLE IF NOT EXISTS argo_missions (
      id UUID PRIMARY KEY,
      mission_date TIMESTAMPTZ NOT NULL,
      operator_alias TEXT NOT NULL,
      vehicle_code TEXT NOT NULL,
      area TEXT NOT NULL,
      producer_count INTEGER NOT NULL,
      payload JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await database.query(`CREATE INDEX IF NOT EXISTS argo_missions_date_idx ON argo_missions (mission_date DESC)`);
}

async function saveMission(database, mission) {
  const activeProducerCount = mission.produttori.filter((item) => item.attivo).length;
  const result = await database.query(
    `INSERT INTO argo_missions
      (id, mission_date, operator_alias, vehicle_code, area, producer_count, payload)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
     ON CONFLICT (id) DO NOTHING
     RETURNING id`,
    [mission.id, mission.data, mission.alias.trim(), mission.mezzo.trim(), mission.area.trim(), activeProducerCount, JSON.stringify(mission)]
  );
  return { created: result.rowCount === 1 };
}

async function findMission(database, id) {
  const result = await database.query("SELECT payload FROM argo_missions WHERE id = $1", [id]);
  return result.rows[0]?.payload || null;
}

module.exports = { createDatabase, ensureSchema, saveMission, findMission };
