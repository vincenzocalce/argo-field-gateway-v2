const test = require("node:test");
const assert = require("node:assert/strict");
const { getDatabaseDiagnostics } = require("../src/database");

test("diagnostica PostgreSQL restituisce solo conteggi e record recenti", async () => {
  const calls = [];
  const database = {
    async query(sql, values) {
      calls.push({ sql, values });
      if (sql.includes("COUNT(*)")) {
        return {
          rows: [{
            total_rows: 2,
            distinct_ids: 2,
            duplicate_rows: 0,
            latest_created_at: "2026-10-11T21:05:22.000Z"
          }]
        };
      }
      if (sql.includes("ORDER BY created_at DESC")) {
        return {
          rows: [{
            id: "00000000-0000-4000-8000-000000000001",
            created_at: "2026-10-11T21:05:22.000Z"
          }]
        };
      }
      throw new Error("Query inattesa");
    }
  };

  const result = await getDatabaseDiagnostics(database, 10);

  assert.equal(result.total_rows, 2);
  assert.equal(result.distinct_ids, 2);
  assert.equal(result.duplicate_rows, 0);
  assert.equal(result.recent_missions.length, 1);
  assert.equal(calls[1].values[0], 10);
});

test("limita la diagnostica recente a un massimo di 25 righe", async () => {
  const database = {
    async query(sql, values) {
      if (sql.includes("COUNT(*)")) {
        return { rows: [{ total_rows: 0, distinct_ids: 0, duplicate_rows: 0, latest_created_at: null }] };
      }
      assert.equal(values[0], 25);
      return { rows: [] };
    }
  };

  await getDatabaseDiagnostics(database, 1000);
});
