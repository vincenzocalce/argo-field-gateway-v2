"use strict";

// Pure documentary adapter: no database, HTTP, UUID generation or clock access.
const { validateMission } = require("./validation");

const ADAPTER_VERSION = "0.1.0";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const text = (v) => typeof v === "string" && v.trim().length > 0;
const object = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const clone = (v) => JSON.parse(JSON.stringify(v));
const nativeEvidence = (row, field) => object(row.field_evidence?.[field]) &&
  row.field_evidence[field].origin === "NATIVE_SOURCE" && text(row.field_evidence[field].ref);

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (object(value)) return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${stable(value[k])}`).join(",")}}`;
  return JSON.stringify(value);
}

// Check calendar components independently: Date.parse normalizes 30 February.
function validTimestamp(value) {
  if (typeof value !== "string") return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!m) return false;
  const [year, month, day, hour, minute, second] = m.slice(1, 7).map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (year === 0 || month < 1 || month > 12 || day < 1 || day > days[month - 1] || hour > 23 || minute > 59 || second > 59) return false;
  if (m[7] !== "Z") {
    const offsetHour = Number(m[7].slice(1, 3));
    const offsetMinute = Number(m[7].slice(4, 6));
    if (offsetHour > 14 || offsetMinute > 59 || (offsetHour === 14 && offsetMinute !== 0) || m[7] === "-00:00") return false;
  }
  return Number.isFinite(Date.parse(value));
}

function issue(envelope, code, field) {
  if (!envelope.issues.some((v) => v.code === code && v.field === field)) envelope.issues.push({ code, field });
}

function projectRecord(row, context) {
  const validRow = object(row);
  const r = validRow ? row : {};
  const e = {
    documentary_record: clone(row),
    provenance: {
      file: context.file,
      input_sha256: context.input_sha256 ?? null,
      hash_scope: "GENERATED_INPUT_FILE_BYTES_NOT_NATIVE_SOURCE",
      source_metadata: clone((context.provenance || []).filter((s) => s.url === r.evidence_ref)),
      source_rows: clone((context.source_rows || []).filter((s) => s.source_id === r.source_id &&
        s.record_id === r.record_id && s.table_index === r.source_table_index && s.row_index === r.source_row_index))
    },
    quality: {
      data_status: r.data_status ?? null,
      source_quality_status: r.source_quality_status ?? null,
      quality_basis: r.quality_basis ?? null,
      missing_fields: clone(r.missing_fields ?? []),
      excluded_from_unique_total: r.excluded_from_unique_total ?? null,
      inclusion_rule: r.inclusion_rule ?? null,
      conflict_group: r.conflict_group ?? null
    },
    projection: { id: null, mission_date: null, operator_alias: null, vehicle_code: null,
      area: text(r.area) ? r.area : null, producer_count: null, payload: null },
    issues: [],
    sql_shape_compatible: false,
    api_shape_compatible: false,
    eligible_for_import: false
  };
  if (!validRow) issue(e, "INVALID_RECORD", "record");
  if (!text(r.record_id) || !text(r.source_id)) issue(e, "MISSING_DOCUMENTARY_ID", "record_id/source_id");
  if (!text(r.source_record_id)) issue(e, "ASSIGNED_DOCUMENTARY_ID", "source_record_id");
  if (!text(r.evidence_ref)) issue(e, "MISSING_PROVENANCE", "evidence_ref");
  if (!text(r.mission_id)) issue(e, "MISSING_NATIVE_MISSION_ID", "mission_id");
  else if (!UUID.test(r.mission_id)) issue(e, "INVALID_NATIVE_MISSION_ID", "mission_id");
  else if (!nativeEvidence(r, "mission_id")) issue(e, "UNDOCUMENTED_FIELD", "mission_id");
  else e.projection.id = r.mission_id;

  if (!text(r.event_timestamp)) issue(e, "MISSING_OPERATIONAL_TIMESTAMP", "event_timestamp");
  else if (!validTimestamp(r.event_timestamp)) issue(e, "INVALID_OPERATIONAL_TIMESTAMP", "event_timestamp");
  else if (!nativeEvidence(r, "event_timestamp")) issue(e, "UNDOCUMENTED_FIELD", "event_timestamp");
  else if (text(r.event_date) && r.event_timestamp.slice(0, 10) !== r.event_date) issue(e, "TIMESTAMP_DATE_CONFLICT", "event_timestamp");
  else e.projection.mission_date = r.event_timestamp;

  for (const [field, missing, localPattern] of [
    ["operator_alias", "MISSING_OPERATOR_ALIAS", /^M1-S\d+$/i],
    ["vehicle_code", "MISSING_VEHICLE_CODE", /^M1-V\d+$/i]
  ]) {
    if (!text(r[field])) issue(e, missing, field);
    else if (!nativeEvidence(r, field)) issue(e, "UNDOCUMENTED_FIELD", field);
    else if (localPattern.test(r[field].trim())) issue(e, "LOCAL_ALIAS_NOT_CANONICAL", field);
    else e.projection[field] = r[field];
  }
  if (!text(r.area)) issue(e, "MISSING_AREA", "area");
  if (!text(r.eer_code)) issue(e, "MISSING_EER_CODE", "eer_code");
  else if (!/^\d{6}$/.test(r.eer_code)) issue(e, "INVALID_EER_CODE", "eer_code");
  // eer_code stays documentary. It is never expanded into producer lots.

  const weights = ["dry_kg", "wet_kg", "unclassified_kg", "total_kg"];
  for (const field of weights) {
    if (r[field] != null && (typeof r[field] !== "number" || !Number.isFinite(r[field]) || r[field] < 0)) issue(e, "INVALID_WEIGHT", field);
  }
  if (r.total_kg == null) issue(e, "MISSING_WEIGHT", "total_kg");
  const components = weights.slice(0, 3).map((f) => r[f]);
  const knownComponents = components.filter((v) => typeof v === "number" && Number.isFinite(v) && v >= 0);
  if (knownComponents.length && typeof r.total_kg === "number" && Number.isFinite(r.total_kg) &&
      knownComponents.reduce((a, b) => a + b, 0) > r.total_kg) issue(e, "WEIGHT_CONFLICT", "total_kg");
  if (components.every((v) => typeof v === "number" && Number.isFinite(v) && v >= 0) &&
      typeof r.total_kg === "number" && components.reduce((a, b) => a + b, 0) !== r.total_kg) issue(e, "WEIGHT_CONFLICT", "total_kg");

  let producersValid = Array.isArray(r.produttori) && nativeEvidence(r, "produttori");
  let countValid = producersValid;
  if (!Array.isArray(r.produttori)) issue(e, "MISSING_PRODUCERS", "produttori");
  else if (!nativeEvidence(r, "produttori")) issue(e, "UNDOCUMENTED_FIELD", "produttori");
  if (Array.isArray(r.produttori)) {
    const producerIds = new Set();
    const lotIds = new Set();
    for (const [i, p] of r.produttori.entries()) {
      if (!object(p)) { issue(e, "INVALID_PRODUCER", `produttori[${i}]`); producersValid = false; countValid = false; continue; }
      for (const field of ["id", "attivo"]) {
        if (!nativeEvidence(p, field)) { issue(e, "UNDOCUMENTED_FIELD", `produttori[${i}].${field}`); producersValid = false; }
      }
      if (!nativeEvidence(p, "attivo")) countValid = false;
      if (typeof p.attivo !== "boolean") { issue(e, "INVALID_PRODUCER", `produttori[${i}].attivo`); producersValid = false; countValid = false; }
      const id = typeof p.id === "string" ? p.id.toLowerCase() : null;
      if (!UUID.test(p.id || "") || producerIds.has(id)) { issue(e, "INVALID_OR_DUPLICATE_PRODUCER_ID", `produttori[${i}].id`); producersValid = false; countValid = false; }
      producerIds.add(id);
      if (!Array.isArray(p.lotti)) { issue(e, "MISSING_LOTS", `produttori[${i}].lotti`); producersValid = false; continue; }
      const codes = new Set();
      for (const [j, lot] of p.lotti.entries()) {
        if (!object(lot)) { issue(e, "INVALID_LOT", `produttori[${i}].lotti[${j}]`); producersValid = false; continue; }
        for (const field of ["id", "cer"]) {
          if (!nativeEvidence(lot, field)) { issue(e, "UNDOCUMENTED_FIELD", `produttori[${i}].lotti[${j}].${field}`); producersValid = false; }
        }
        const lotId = typeof lot.id === "string" ? lot.id.toLowerCase() : null;
        if (!UUID.test(lot.id || "") || lotIds.has(lotId)) { issue(e, "INVALID_OR_DUPLICATE_LOT_ID", `produttori[${i}].lotti[${j}].id`); producersValid = false; }
        lotIds.add(lotId);
        if (!["150106", "200301", "200108"].includes(lot.cer) || codes.has(lot.cer)) { issue(e, "INVALID_OR_DUPLICATE_CER", `produttori[${i}].lotti[${j}].cer`); producersValid = false; }
        codes.add(lot.cer);
      }
    }
    if (countValid) e.projection.producer_count = r.produttori.filter((p) => p.attivo).length;
  }
  if (r.conflict_group != null) issue(e, "DECLARED_CONFLICT", "conflict_group");
  if (r.excluded_from_unique_total === true) issue(e, "SOURCE_EXCLUDED", "excluded_from_unique_total");
  if (!["ENTRATA", "USCITA"].includes(r.event_type)) issue(e, "INVALID_EVENT_TYPE", "event_type");

  e.projection.payload = {
    adapter_version: ADAPTER_VERSION,
    mode: "DOCUMENTARY_STAGING_ONLY",
    segment: context.name,
    documentary_record: clone(row),
    provenance: clone(e.provenance),
    quality: clone(e.quality)
  };
  const shapeFields = ["id", "mission_date", "operator_alias", "vehicle_code", "area", "producer_count"];
  const generalBlockers = new Set(["INVALID_RECORD", "INVALID_WEIGHT", "MISSING_WEIGHT", "WEIGHT_CONFLICT", "MISSING_DOCUMENTARY_ID", "MISSING_PROVENANCE", "DECLARED_CONFLICT", "SOURCE_EXCLUDED", "INVALID_EVENT_TYPE"]);
  e.sql_shape_compatible = shapeFields.every((f) => e.projection[f] !== null) && !e.issues.some((i) => generalBlockers.has(i.code));
  if (e.sql_shape_compatible && producersValid) {
    const candidate = { id: e.projection.id, data: e.projection.mission_date, alias: e.projection.operator_alias,
      mezzo: e.projection.vehicle_code, area: e.projection.area, produttori: clone(r.produttori) };
    const errors = validateMission(candidate);
    e.api_shape_compatible = errors.length === 0;
    if (errors.length) issue(e, "API_STRUCTURE_INCOMPATIBLE", "produttori");
  }
  return e;
}

function contentIdentity(row) {
  // Scenario metadata do not make reused evidence a divergent mission.
  const copy = clone(row);
  if (object(copy)) for (const key of ["dataset_version", "origin_dataset_version", "package_version", "inclusion_rule"]) delete copy[key];
  if (object(copy) && typeof copy.mission_id === "string") copy.mission_id = copy.mission_id.toLowerCase();
  return stable(copy);
}

function markGroup(group, duplicateCode, conflictCode) {
  if (group.length < 2) return;
  const conflict = new Set(group.map((e) => contentIdentity(e.documentary_record))).size > 1;
  for (const e of group) {
    issue(e, conflict ? conflictCode : duplicateCode, "identity");
    e.sql_shape_compatible = false;
    e.api_shape_compatible = false;
  }
}

function summarize(records) {
  const result = { documentary_rows: records.length,
    inflows: { count: 0, total_kg: null }, outflows: { count: 0, total_kg: null },
    sql_shape_compatible: 0, api_shape_compatible: 0, eligible_for_import: 0, issue_counts: {} };
  for (const e of records) {
    const row = e.documentary_record;
    if (object(row)) {
      const category = row.event_type === "ENTRATA" ? result.inflows : row.event_type === "USCITA" ? result.outflows : null;
      if (category) category.count += 1;
    }
    result.sql_shape_compatible += Number(e.sql_shape_compatible);
    result.api_shape_compatible += Number(e.api_shape_compatible);
    for (const i of e.issues) result.issue_counts[i.code] = (result.issue_counts[i.code] || 0) + 1;
  }
  for (const [type, category] of [["ENTRATA", result.inflows], ["USCITA", result.outflows]]) {
    const rows = records.map((e) => e.documentary_record).filter((r) => object(r) && r.event_type === type);
    if (rows.length && rows.every((r) => typeof r.total_kg === "number" && Number.isFinite(r.total_kg) && r.total_kg >= 0)) category.total_kg = rows.reduce((n, r) => n + r.total_kg, 0);
  }
  return result;
}

function adaptSegments(segments) {
  if (!Array.isArray(segments)) throw new TypeError("segments must be an array");
  const names = new Set();
  const output = [];
  const evidenceGroups = new Map();
  const nativeGroups = new Map();
  for (const s of segments) {
    if (!object(s) || !text(s.name) || !text(s.file) || !Array.isArray(s.records) || names.has(s.name)) throw new TypeError("Each segment needs a unique name, file and records array");
    names.add(s.name);
    const records = s.records.map((r) => projectRecord(r, s));
    const localDoc = new Map();
    const localNative = new Map();
    for (const e of records) {
      const r = e.documentary_record;
      if (!object(r)) continue;
      if (text(r.source_id) && text(r.record_id)) {
        const key = stable([r.source_id, text(r.source_record_id) ? r.source_record_id : r.record_id]);
        if (!localDoc.has(key)) localDoc.set(key, []);
        localDoc.get(key).push(e);
        if (!evidenceGroups.has(key)) evidenceGroups.set(key, { source_id: r.source_id, record_id: r.record_id, source_record_id: r.source_record_id ?? null, segments: new Set(), records: [] });
        evidenceGroups.get(key).segments.add(s.name);
        evidenceGroups.get(key).records.push(e);
      }
      if (text(r.mission_id) && UUID.test(r.mission_id)) {
        const key = r.mission_id.toLowerCase();
        if (!localNative.has(key)) localNative.set(key, []);
        localNative.get(key).push(e);
        if (!nativeGroups.has(key)) nativeGroups.set(key, []);
        nativeGroups.get(key).push(e);
      }
    }
    for (const group of localDoc.values()) markGroup(group, "DUPLICATE_DOCUMENTARY_ID", "DOCUMENTARY_ID_CONFLICT");
    for (const group of localNative.values()) markGroup(group, "DUPLICATE_NATIVE_ID", "NATIVE_ID_CONFLICT");
    output.push({ name: s.name, file: s.file, records });
  }
  // Across scenarios, identical reuse is lineage, divergent UUIDs are conflicts.
  for (const group of evidenceGroups.values()) {
    if (new Set(group.records.map((e) => contentIdentity(e.documentary_record))).size > 1) {
      markGroup(group.records, "DUPLICATE_DOCUMENTARY_ID", "DOCUMENTARY_ID_CONFLICT");
    }
  }
  for (const group of nativeGroups.values()) {
    if (new Set(group.map((e) => contentIdentity(e.documentary_record))).size > 1) markGroup(group, "DUPLICATE_NATIVE_ID", "NATIVE_ID_CONFLICT");
  }
  for (const segment of output) segment.summary = summarize(segment.records);
  return {
    adapter_version: ADAPTER_VERSION,
    mode: "DOCUMENTARY_STAGING_ONLY",
    segments: output,
    overlaps: [...evidenceGroups.values()].filter((g) => g.segments.size > 1).map(({ records, segments, ...g }) => ({
      ...g, segments: [...segments],
      relation: new Set(records.map((e) => contentIdentity(e.documentary_record))).size > 1 ? "CONFLICTING_DOCUMENTARY_EVIDENCE" : "REUSED_DOCUMENTARY_EVIDENCE"
    })),
    database_import: "NOT_EXECUTED",
    m1_reproducibility: "NOT_DEMONSTRATED"
  };
}

module.exports = { ADAPTER_VERSION, adaptSegments, validTimestamp };
