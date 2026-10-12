// Entirely synthetic records: none of these UUIDs, weights or source references
// are observations from the historical M1 dataset.
const CER_CODES = ["150106", "200108", "200301"];
const MISSION_ID = "00000000-0000-4000-8000-000000000001";

function clone(value) {
  return structuredClone(value);
}

function evidence(ref) {
  return { origin: "NATIVE_SOURCE", ref: `synthetic://${ref}` };
}

function uuid(index) {
  return `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

function documentaryRecord(overrides = {}) {
  return {
    record_id: "SYN-DOC-001",
    source_id: "SYN-SOURCE-001",
    source_record_id: "SYN-SOURCE-ROW-001",
    source_table_index: 1,
    source_row_index: 1,
    evidence_ref: "synthetic://document/SYN-DOC-001",
    source_version: "SYNTHETIC-0.1.0",
    source_last_edited_at: "2026-10-10T10:00:00Z",
    event_date: "2026-09-21",
    event_type: "ENTRATA",
    direction: "inflow",
    subject_alias: "M1-S001",
    vehicle_alias: "M1-V001",
    area: "Area sintetica",
    fraction: "secco",
    total_kg: 120,
    dry_kg: 120,
    wet_kg: null,
    unclassified_kg: null,
    data_status: "REVIEW_REQUIRED",
    source_quality_status: "DOCUMENTARY_ONLY",
    excluded_from_unique_total: false,
    inclusion_rule: "SYNTHETIC_BASELINE",
    conflict_group: null,
    ...clone(overrides)
  };
}

function nativeProducer(index) {
  const producerId = uuid(100 + index);
  return {
    id: producerId,
    attivo: index % 2 === 0,
    lotti: CER_CODES.map((cer, lotIndex) => ({
      id: uuid(1000 + index * 3 + lotIndex),
      cer,
      field_evidence: {
        id: evidence(`producer/${index}/lot/${lotIndex}/id`),
        cer: evidence(`producer/${index}/lot/${lotIndex}/cer`)
      }
    })),
    field_evidence: {
      id: evidence(`producer/${index}/id`),
      attivo: evidence(`producer/${index}/attivo`)
    }
  };
}

function documentedNativeRecord(overrides = {}) {
  const row = documentaryRecord({
    record_id: "SYN-NATIVE-001",
    mission_id: MISSION_ID,
    event_timestamp: "2026-09-21T10:15:30+02:00",
    operator_alias: "Operatore sintetico",
    vehicle_code: "SYNTHETIC-VEHICLE",
    produttori: Array.from({ length: 15 }, (_, index) => nativeProducer(index)),
    field_evidence: {
      mission_id: evidence("mission/id"),
      event_timestamp: evidence("mission/event_timestamp"),
      operator_alias: evidence("mission/operator_alias"),
      vehicle_code: evidence("mission/vehicle_code"),
      produttori: evidence("mission/produttori")
    }
  });
  return { ...row, ...clone(overrides) };
}

function segment(name, records, overrides = {}) {
  return {
    name,
    file: `synthetic/${name}.json`,
    input_sha256: "a".repeat(64),
    records: clone(records),
    provenance: records.filter((row) => row && typeof row === "object").map((row) => ({
      record_id: row.record_id,
      source_id: row.source_id,
      source_record_id: row.source_record_id,
      url: `synthetic://document/${row.record_id}`,
      provenance_status: "SYNTHETIC_FIXTURE_ONLY"
    })),
    source_rows: records.filter((row) => row && typeof row === "object").map((row) => ({
      record_id: row.record_id,
      source_id: row.source_id,
      source_record_id: row.source_record_id,
      table_index: row.source_table_index,
      row_index: row.source_row_index,
      original_text: `Synthetic documentary evidence for ${row.record_id}`
    })),
    ...clone(overrides)
  };
}

function scenarioSegments() {
  const baseline = documentaryRecord();
  const addendum = documentaryRecord({
    record_id: "SYN-ADD-001",
    source_record_id: "SYN-SOURCE-ROW-ADD-001",
    total_kg: 30,
    dry_kg: 30,
    inclusion_rule: "SYNTHETIC_ADDENDUM",
    data_status: "REVIEW_REQUIRED"
  });
  return [
    segment("baseline", [baseline]),
    segment("addendum", [addendum]),
    segment("additive", [baseline, addendum])
  ];
}

module.exports = {
  CER_CODES,
  MISSION_ID,
  clone,
  evidence,
  uuid,
  documentaryRecord,
  documentedNativeRecord,
  segment,
  scenarioSegments
};
