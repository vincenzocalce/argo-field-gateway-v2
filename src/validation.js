const ALLOWED_CER = ["150106", "200108", "200301"];
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function nonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function validateMission(mission) {
  const errors = [];
  if (!mission || typeof mission !== "object" || Array.isArray(mission)) return ["Il corpo della richiesta deve essere un oggetto JSON"];
  if (!UUID_PATTERN.test(mission.id || "")) errors.push("id deve essere un UUID valido");
  if (!nonEmptyString(mission.data) || Number.isNaN(Date.parse(mission.data))) errors.push("data deve essere una data ISO 8601 valida");
  if (!nonEmptyString(mission.alias)) errors.push("alias è obbligatorio");
  if (!nonEmptyString(mission.mezzo)) errors.push("mezzo è obbligatorio");
  if (!nonEmptyString(mission.area)) errors.push("area è obbligatoria");
  if (!Array.isArray(mission.produttori) || mission.produttori.length < 15) {
    errors.push("produttori deve contenere almeno 15 schede");
    return errors;
  }

  const producerIds = new Set();
  mission.produttori.forEach((producer, producerIndex) => {
    const prefix = `produttori[${producerIndex}]`;
    if (!UUID_PATTERN.test(producer?.id || "")) errors.push(`${prefix}.id non valido`);
    if (producerIds.has(producer?.id)) errors.push(`${prefix}.id duplicato`);
    producerIds.add(producer?.id);
    if (typeof producer?.attivo !== "boolean") errors.push(`${prefix}.attivo deve essere booleano`);
    if (!Array.isArray(producer?.lotti)) {
      errors.push(`${prefix}.lotti deve essere un elenco`);
      return;
    }
    const codes = new Set(producer.lotti.map((lot) => lot?.cer));
    ALLOWED_CER.forEach((code) => {
      if (!codes.has(code)) errors.push(`${prefix} non contiene il CER ${code}`);
    });
    producer.lotti.forEach((lot, lotIndex) => {
      const lotPrefix = `${prefix}.lotti[${lotIndex}]`;
      if (!UUID_PATTERN.test(lot?.id || "")) errors.push(`${lotPrefix}.id non valido`);
      if (!ALLOWED_CER.includes(lot?.cer)) errors.push(`${lotPrefix}.cer non ammesso`);
    });
  });
  return errors;
}

module.exports = { ALLOWED_CER, validateMission };
