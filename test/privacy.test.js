const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeMissionId, missionReference } = require("../src/privacy");

test("normalizza UUID con spazi e maiuscole", () => {
  const upper = " AF788CD8-E087-4000-8000-000000000001 ";
  const lower = "af788cd8-e087-4000-8000-000000000001";

  assert.equal(normalizeMissionId(upper), lower);
  assert.equal(missionReference(upper), missionReference(lower));
});

test("non produce riferimenti per identificativi mancanti", () => {
  assert.equal(missionReference(undefined), undefined);
  assert.equal(missionReference(null), undefined);
  assert.equal(missionReference("   "), undefined);
});

test("produce un riferimento privacy-safe di 12 caratteri", () => {
  assert.match(missionReference("00000000-0000-4000-8000-000000000001"), /^[a-f0-9]{12}$/);
});
