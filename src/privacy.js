const { createHash } = require("node:crypto");

function normalizeMissionId(id) {
  return String(id).trim().toLowerCase();
}

function missionReference(id) {
  if (id === undefined || id === null || String(id).trim() === "") return undefined;
  return createHash("sha256").update(normalizeMissionId(id)).digest("hex").slice(0, 12);
}

module.exports = { normalizeMissionId, missionReference };
