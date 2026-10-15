const { randomUUID } = require("node:crypto");

// Synthetic contract fixture: no operational or personal data.
function validMission(overrides = {}) {
  return {
    id: randomUUID(),
    data: "2026-10-10T10:00:00Z",
    alias: "TEST_OPERATOR",
    mezzo: "TEST_VEHICLE",
    area: "TEST_AREA",
    produttori: Array.from({ length: 15 }, (_, producerIndex) => ({
      id: randomUUID(),
      attivo: producerIndex === 0,
      codice: `TEST_P${String(producerIndex + 1).padStart(2, "0")}`,
      nome: producerIndex === 0 ? "Synthetic producer" : "",
      indirizzo: "",
      note: "",
      lotti: ["150106", "200301", "200108"].map((cer, lotIndex) => ({
        id: randomUUID(),
        cer,
        numero: lotIndex === 0 ? "4" : "",
        litri: lotIndex === 0 ? "110" : "",
        marca: "",
        riempimento: "Non rilevato",
        kg: "",
        fontePeso: "Non rilevata",
        operatore: "",
        sollevamenti: "",
        minuti: "",
        modalita: "Non rilevata",
        note: ""
      }))
    })),
    ...overrides
  };
}

module.exports = { validMission };
