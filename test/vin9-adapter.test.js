const test = require("node:test");
const assert = require("node:assert/strict");
const { adaptSegments } = require("../src/vin9-adapter");
const {
  MISSION_ID,
  clone,
  documentaryRecord,
  documentedNativeRecord,
  segment,
  scenarioSegments
} = require("./fixtures/vin9");

function one(row, segmentOverrides = {}) {
  return adaptSegments([segment("baseline", [row], segmentOverrides)]).segments[0].records[0];
}

function hasIssue(record, code) {
  return record.issues.some((issue) => issue.code === code);
}

function assertBlocked(record) {
  assert.equal(record.eligible_for_import, false);
}

function deepFreeze(value) {
  if (value && typeof value === "object") {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
}

test("historical documentary ids, date and aliases cannot manufacture SQL fields", () => {
  const row = documentaryRecord();
  const record = one(row);

  assert.deepEqual(record.documentary_record, row);
  assert.equal(record.projection.id, null);
  assert.equal(record.projection.mission_date, null);
  assert.equal(record.projection.operator_alias, null);
  assert.equal(record.projection.vehicle_code, null);
  assert.equal(record.projection.producer_count, null);
  assert.equal(record.sql_shape_compatible, false);
  assert.equal(record.api_shape_compatible, false);
  assertBlocked(record);
  assert.ok(hasIssue(record, "MISSING_NATIVE_MISSION_ID"));
  assert.ok(hasIssue(record, "MISSING_OPERATIONAL_TIMESTAMP"));
  assert.ok(hasIssue(record, "MISSING_OPERATOR_ALIAS"));
  assert.ok(hasIssue(record, "MISSING_VEHICLE_CODE"));
  assert.ok(hasIssue(record, "MISSING_PRODUCERS"));
});

test("a record_id that looks like a valid UUID still is not a native mission_id", () => {
  const record = one(documentaryRecord({ record_id: MISSION_ID }));
  assert.equal(record.projection.id, null);
  assert.equal(record.sql_shape_compatible, false);
  assertBlocked(record);
});

test("a source quality label cannot replace missing native evidence", () => {
  const record = one(documentaryRecord({ data_status: "VALIDATED", source_quality_status: "PASS" }));
  assert.equal(record.projection.id, null);
  assert.equal(record.projection.mission_date, null);
  assert.equal(record.sql_shape_compatible, false);
  assert.equal(record.api_shape_compatible, false);
  assertBlocked(record);
});

test("provenance, source quality and exclusions remain inspectable", () => {
  const row = documentaryRecord({
    source_quality_status: "REVIEW_REQUIRED",
    quality_basis: "SYNTHETIC_DOCUMENTARY_CONFLICT",
    excluded_from_unique_total: true,
    inclusion_rule: "SYNTHETIC_ALTERNATIVE_ONLY",
    conflict_group: "SYN-CONFLICT-1"
  });
  const input = segment("alternative", [row]);
  const record = adaptSegments([input]).segments[0].records[0];

  assert.equal(record.provenance.file, input.file);
  assert.equal(record.provenance.input_sha256, input.input_sha256);
  assert.deepEqual(record.provenance.source_metadata, input.provenance);
  assert.deepEqual(record.provenance.source_rows, input.source_rows);
  assert.equal(record.quality.source_quality_status, row.source_quality_status);
  assert.equal(record.quality.excluded_from_unique_total, true);
  assert.equal(record.quality.inclusion_rule, row.inclusion_rule);
  assert.equal(record.quality.conflict_group, row.conflict_group);
  assert.ok(hasIssue(record, "SOURCE_EXCLUDED"));
  assert.ok(hasIssue(record, "DECLARED_CONFLICT"));
  assertBlocked(record);
});

test("an entirely synthetic documented native record can be shape compatible but never importable", () => {
  const row = documentedNativeRecord();
  const record = one(row);

  assert.equal(record.projection.id, row.mission_id);
  assert.equal(record.projection.mission_date, row.event_timestamp);
  assert.equal(record.projection.operator_alias, row.operator_alias);
  assert.equal(record.projection.vehicle_code, row.vehicle_code);
  assert.equal(record.projection.area, row.area);
  assert.equal(record.projection.producer_count, 8);
  assert.equal(record.sql_shape_compatible, true);
  assert.equal(record.api_shape_compatible, true);
  assertBlocked(record);
  assert.deepEqual(record.documentary_record, row);
  assert.ok(JSON.stringify(record.projection.payload).includes(row.record_id));
});

test("native-looking extensions without native evidence are not projected", () => {
  const row = documentedNativeRecord();
  delete row.field_evidence;
  const record = one(row);

  for (const key of ["id", "mission_date", "operator_alias", "vehicle_code", "producer_count"]) {
    assert.equal(record.projection[key], null, key);
  }
  assert.ok(hasIssue(record, "UNDOCUMENTED_FIELD"));
  assert.equal(record.sql_shape_compatible, false);
  assert.equal(record.api_shape_compatible, false);
  assertBlocked(record);
});

test("empty or non-native evidence cannot attest a mission id", async (t) => {
  for (const badEvidence of [
    { origin: "NATIVE_SOURCE", ref: "" },
    { origin: "NATIVE_SOURCE", ref: "   " },
    { origin: "INFERRED", ref: "synthetic://inferred/id" },
    { ref: "synthetic://missing-origin/id" },
    null
  ]) {
    await t.test(JSON.stringify(badEvidence), () => {
      const row = documentedNativeRecord();
      row.field_evidence.mission_id = badEvidence;
      const record = one(row);
      assert.equal(record.projection.id, null);
      assert.equal(record.sql_shape_compatible, false);
      assertBlocked(record);
    });
  }
});

test("invalid ids are not repaired or replaced", async (t) => {
  for (const id of ["M1-ENTRY-001", "", "not-a-uuid", "00000000-0000-0000-0000-000000000000", 12]) {
    await t.test(String(id), () => {
      const row = documentedNativeRecord({ mission_id: id });
      const record = one(row);
      assert.equal(record.projection.id, null);
      assert.equal(record.sql_shape_compatible, false);
      assertBlocked(record);
    });
  }
});

test("date-only, timezone-free, impossible calendar dates and invalid offsets do not create timestamps", async (t) => {
  const invalidTimestamps = [
    "2026-09-21",
    "2026-09-21T10:15:30",
    "2026-02-29T10:15:30Z",
    "2026-09-31T10:15:30+02:00",
    "2026-09-21T24:00:00Z",
    "2026-09-21T10:15:30+25:00",
    "2026-09-21T10:15:30+02:60",
    "not-a-date"
  ];
  for (const timestamp of invalidTimestamps) {
    await t.test(timestamp, () => {
      const row = documentedNativeRecord({ event_timestamp: timestamp });
      const record = one(row);
      assert.equal(record.projection.mission_date, null);
      assert.equal(record.sql_shape_compatible, false);
      assertBlocked(record);
      assert.equal(record.documentary_record.event_timestamp, timestamp);
    });
  }
});

test("a last-edited timestamp cannot replace the operational event timestamp", () => {
  const row = documentedNativeRecord();
  delete row.event_timestamp;
  delete row.field_evidence.event_timestamp;
  const record = one(row);
  assert.equal(record.projection.mission_date, null);
  assert.ok(hasIssue(record, "MISSING_OPERATIONAL_TIMESTAMP"));
  assertBlocked(record);
});

test("synthetic M1 subject and vehicle aliases never become native identity fields", () => {
  const row = documentedNativeRecord({ operator_alias: "M1-S001", vehicle_code: "M1-V001" });
  const record = one(row);
  assert.equal(record.projection.operator_alias, null);
  assert.equal(record.projection.vehicle_code, null);
  assert.equal(record.sql_shape_compatible, false);
  assertBlocked(record);
});

test("case variations of local M1 subject and vehicle aliases remain noncanonical", async (t) => {
  for (const [operatorAlias, vehicleCode] of [
    ["m1-s001", "m1-v001"],
    ["M1-s001", "M1-v001"],
    ["m1-S001", "m1-V001"]
  ]) {
    await t.test(`${operatorAlias}/${vehicleCode}`, () => {
      const row = documentedNativeRecord({ operator_alias: operatorAlias, vehicle_code: vehicleCode });
      const record = one(row);
      assert.equal(record.projection.operator_alias, null);
      assert.equal(record.projection.vehicle_code, null);
      assert.equal(record.sql_shape_compatible, false);
      assert.equal(record.api_shape_compatible, false);
      assertBlocked(record);
    });
  }
});

test("missing mandatory area is preserved and blocks shape compatibility", () => {
  const row = documentedNativeRecord();
  delete row.area;
  const record = one(row);
  assert.equal(record.projection.area, null);
  assert.equal(record.sql_shape_compatible, false);
  assert.ok(hasIssue(record, "MISSING_AREA"));
  assert.equal(Object.hasOwn(record.documentary_record, "area"), false);
  assertBlocked(record);
});

test("producer counts require a documented actual array and actual booleans", async (t) => {
  const cases = [
    { label: "no producers", alter(row) { delete row.produttori; } },
    { label: "string collection", alter(row) { row.produttori = "15 producers"; } },
    { label: "string activity", alter(row) { row.produttori[0].attivo = "false"; } },
    { label: "missing activity", alter(row) { delete row.produttori[0].attivo; } },
    { label: "null producer", alter(row) { row.produttori[0] = null; } }
  ];
  for (const { label, alter } of cases) {
    await t.test(label, () => {
      const row = documentedNativeRecord();
      alter(row);
      const record = one(row);
      assert.equal(record.projection.producer_count, null);
      assert.equal(record.sql_shape_compatible, false);
      assert.equal(record.api_shape_compatible, false);
      assertBlocked(record);
    });
  }
});

test("SQL shape compatibility does not imply the 15-producer API contract", () => {
  const row = documentedNativeRecord();
  row.produttori = row.produttori.slice(0, 1);
  const record = one(row);
  assert.equal(record.projection.producer_count, 1);
  assert.equal(record.sql_shape_compatible, true);
  assert.equal(record.api_shape_compatible, false);
  assertBlocked(record);
});

test("missing nested ids, CER and source evidence are not synthesized", async (t) => {
  const cases = [
    { label: "producer id", alter(row) { delete row.produttori[0].id; } },
    { label: "producer id evidence", alter(row) { delete row.produttori[0].field_evidence.id; } },
    { label: "producer activity evidence", alter(row) { delete row.produttori[0].field_evidence.attivo; } },
    { label: "lot id", alter(row) { delete row.produttori[0].lotti[0].id; } },
    { label: "lot id evidence", alter(row) { delete row.produttori[0].lotti[0].field_evidence.id; } },
    { label: "lot CER", alter(row) { delete row.produttori[0].lotti[0].cer; } },
    { label: "CER evidence", alter(row) { delete row.produttori[0].lotti[0].field_evidence.cer; } },
    { label: "incomplete lot collection", alter(row) { row.produttori[0].lotti.pop(); } },
    { label: "missing lot collection", alter(row) { delete row.produttori[0].lotti; } }
  ];
  for (const { label, alter } of cases) {
    await t.test(label, () => {
      const row = documentedNativeRecord();
      alter(row);
      const before = clone(row);
      const record = one(row);
      assert.equal(record.api_shape_compatible, false);
      assertBlocked(record);
      assert.deepEqual(record.documentary_record, before);
      assert.deepEqual(row, before);
    });
  }
});

test("a documentary fraction cannot supply a missing CER code", () => {
  const row = documentedNativeRecord({ fraction: "secco", eer_code: null });
  delete row.produttori[0].lotti[2].cer;
  delete row.produttori[0].lotti[2].field_evidence.cer;
  const record = one(row);
  assert.equal(record.api_shape_compatible, false);
  assert.equal(Object.hasOwn(record.documentary_record.produttori[0].lotti[2], "cer"), false);
  assertBlocked(record);
});

test("producer and lot UUID duplicates are case-insensitive", async (t) => {
  await t.test("producer ids", () => {
    const row = documentedNativeRecord();
    row.produttori[0].id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    row.produttori[1].id = row.produttori[0].id.toUpperCase();
    const record = one(row);
    assert.equal(record.api_shape_compatible, false);
    assertBlocked(record);
  });
  await t.test("lot ids across producers", () => {
    const row = documentedNativeRecord();
    row.produttori[0].lotti[0].id = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    row.produttori[1].lotti[0].id = row.produttori[0].lotti[0].id.toUpperCase();
    const record = one(row);
    assert.equal(record.api_shape_compatible, false);
    assertBlocked(record);
  });
});

test("duplicate producer UUIDs leave the operational producer count unknown", () => {
  const row = documentedNativeRecord();
  row.produttori[1].id = row.produttori[0].id;
  const record = one(row);

  assert.equal(record.projection.producer_count, null);
  assert.equal(record.sql_shape_compatible, false);
  assert.equal(record.api_shape_compatible, false);
  assertBlocked(record);
  assert.deepEqual(record.documentary_record.produttori, row.produttori);
});

test("invalid documentary weights are preserved with a quality issue", async (t) => {
  for (const weight of [-1, "120", "unknown"]) {
    await t.test(String(weight), () => {
      const row = documentaryRecord({ total_kg: weight });
      const record = one(row);
      assert.equal(record.documentary_record.total_kg, weight);
      assert.ok(hasIssue(record, "INVALID_WEIGHT"));
      assertBlocked(record);
    });
  }
});

test("unknown documentary weights remain null rather than a measured zero", () => {
  const row = documentaryRecord({ total_kg: null, dry_kg: null, wet_kg: null, unclassified_kg: null });
  const result = adaptSegments([segment("baseline", [row])]);
  assert.equal(result.segments[0].records[0].documentary_record.total_kg, null);
  assert.equal(result.segments[0].summary.inflows.total_kg, null);
});

test("known weight components above the total are a conflict even when remaining components are unknown", () => {
  const row = documentedNativeRecord({ total_kg: 100, dry_kg: 200, wet_kg: null, unclassified_kg: null });
  const record = one(row);

  assert.ok(hasIssue(record, "WEIGHT_CONFLICT"));
  assert.equal(record.sql_shape_compatible, false);
  assert.equal(record.api_shape_compatible, false);
  assertBlocked(record);
  assert.deepEqual(record.documentary_record, row);
});

test("an outflow total with every weight component unknown does not invent a weight conflict", () => {
  const row = documentaryRecord({
    record_id: "SYN-OUT-001",
    event_type: "USCITA",
    total_kg: 1680,
    dry_kg: null,
    wet_kg: null,
    unclassified_kg: null
  });
  const result = adaptSegments([segment("baseline_outflows", [row])]);
  const record = result.segments[0].records[0];

  assert.equal(hasIssue(record, "WEIGHT_CONFLICT"), false);
  assert.equal(result.segments[0].summary.outflows.count, 1);
  assert.equal(result.segments[0].summary.outflows.total_kg, 1680);
  assert.deepEqual(record.documentary_record, row);
  assertBlocked(record);
});

test("duplicate documentary records remain visible and all receive duplicate issues", () => {
  const row = documentaryRecord();
  const result = adaptSegments([segment("baseline", [row, clone(row)])]);
  const records = result.segments[0].records;
  assert.equal(records.length, 2);
  assert.ok(records.every((record) => hasIssue(record, "DUPLICATE_DOCUMENTARY_ID")));
  records.forEach(assertBlocked);
});

test("conflicting records with one source key remain visible with conflict issues", () => {
  const row = documentaryRecord();
  const altered = { ...clone(row), record_id: "SYN-DOC-OTHER", total_kg: 999, dry_kg: 999 };
  const result = adaptSegments([segment("baseline", [row, altered])]);
  const records = result.segments[0].records;
  assert.equal(records.length, 2);
  assert.ok(records.every((record) => hasIssue(record, "DOCUMENTARY_ID_CONFLICT")));
  assert.deepEqual(records.map((record) => record.documentary_record.total_kg), [120, 999]);
  records.forEach(assertBlocked);
});

test("native UUID collisions are case-insensitive and a changed payload is a conflict", () => {
  const row = documentedNativeRecord({ mission_id: "abcdefab-cdef-4abc-8abc-abcdefabcdef" });
  const altered = documentedNativeRecord({
    record_id: "SYN-NATIVE-002",
    source_record_id: "SYN-SOURCE-ROW-002",
    mission_id: row.mission_id.toUpperCase(),
    area: "Different synthetic area"
  });
  const result = adaptSegments([segment("baseline", [row, altered])]);
  const records = result.segments[0].records;
  assert.ok(records.every((record) => hasIssue(record, "NATIVE_ID_CONFLICT")));
  records.forEach(assertBlocked);
});

test("same-segment duplicate native UUIDs are retained and flagged on every record", () => {
  const row = documentedNativeRecord();
  const result = adaptSegments([segment("baseline", [row, clone(row)])]);
  const records = result.segments[0].records;
  assert.equal(records.length, 2);
  assert.ok(records.every((record) => hasIssue(record, "DUPLICATE_NATIVE_ID")));
  records.forEach(assertBlocked);
});

test("same native identity and evidence reused across scenarios is not a same-segment duplicate", () => {
  const row = documentedNativeRecord();
  const view = { ...clone(row), dataset_version: "SYNTHETIC-ADDITIVE", inclusion_rule: "SYNTHETIC_VIEW" };
  const result = adaptSegments([segment("baseline", [row]), segment("additive", [view])]);
  const records = result.segments.flatMap((item) => item.records);
  assert.ok(records.every((record) => !hasIssue(record, "DUPLICATE_NATIVE_ID")));
  assert.ok(records.every((record) => !hasIssue(record, "NATIVE_ID_CONFLICT")));
  assert.ok(result.overlaps.some((overlap) => overlap.segments.includes("baseline") && overlap.segments.includes("additive")));
  records.forEach(assertBlocked);
});

test("divergent native evidence across distinct scenarios is still a conflict", () => {
  const row = documentedNativeRecord();
  const divergent = { ...clone(row), area: "Concurrent synthetic alternative" };
  const result = adaptSegments([segment("baseline", [row]), segment("alternative", [divergent])]);
  const records = result.segments.flatMap((item) => item.records);
  assert.ok(records.every((record) => hasIssue(record, "NATIVE_ID_CONFLICT")));
  records.forEach(assertBlocked);
});

test("documentary drift across scenarios is a conflict even when neither row has a native UUID", () => {
  const row = documentaryRecord();
  const divergent = { ...clone(row), total_kg: 999, dry_kg: 999 };
  const result = adaptSegments([segment("baseline", [row]), segment("alternative", [divergent])]);
  const records = result.segments.flatMap((item) => item.records);

  assert.equal(records.length, 2);
  assert.ok(records.every((record) => hasIssue(record, "DOCUMENTARY_ID_CONFLICT")));
  assert.ok(records.every((record) => record.projection.id === null));
  assert.ok(records.every((record) => record.sql_shape_compatible === false && record.api_shape_compatible === false));
  assert.deepEqual(records.map((record) => record.documentary_record.total_kg), [120, 999]);
  assert.deepEqual(records.map((record) => record.documentary_record), [row, divergent]);
  records.forEach(assertBlocked);
});

test("a reused assigned documentary id with null source_record_id forms an overlap without a conflict", () => {
  const row = documentaryRecord({ record_id: "SYN-DOC-ASSIGNED-001", source_record_id: null });
  const view = { ...clone(row), dataset_version: "SYNTHETIC-ADDITIVE", inclusion_rule: "SYNTHETIC_VIEW" };
  const result = adaptSegments([segment("baseline", [row]), segment("additive", [view])]);
  const records = result.segments.flatMap((item) => item.records);

  assert.equal(records.length, 2);
  assert.ok(records.every((record) => record.documentary_record.source_record_id === null));
  assert.ok(records.every((record) => !hasIssue(record, "DOCUMENTARY_ID_CONFLICT")));
  assert.ok(records.every((record) => !hasIssue(record, "DUPLICATE_DOCUMENTARY_ID")));
  assert.equal(result.overlaps.length, 1);
  assert.deepEqual(result.overlaps[0].segments, ["baseline", "additive"]);
  assert.deepEqual(records.map((record) => record.documentary_record), [row, view]);
  records.forEach(assertBlocked);
});

test("baseline, addendum and additive views keep independent summaries without a global total", () => {
  const inputs = scenarioSegments();
  const result = adaptSegments(inputs);
  assert.deepEqual(result.segments.map((item) => item.name), ["baseline", "addendum", "additive"]);
  assert.deepEqual(result.segments.map((item) => item.summary.documentary_rows), [1, 1, 2]);
  assert.deepEqual(result.segments.map((item) => item.summary.inflows.total_kg), [120, 30, 150]);
  assert.equal(Object.hasOwn(result, "total_kg"), false);
  assert.equal(Object.hasOwn(result, "summary"), false);
  assert.equal(result.overlaps.length, 2);
  assert.ok(result.segments.flatMap((item) => item.records).every((record) => !hasIssue(record, "DUPLICATE_DOCUMENTARY_ID")));
});

test("invalid records are retained as blocked documentary evidence", async (t) => {
  for (const invalid of [null, 12, "documentary text", []]) {
    await t.test(JSON.stringify(invalid), () => {
      const record = one(invalid);
      assert.deepEqual(record.documentary_record, invalid);
      assert.ok(hasIssue(record, "INVALID_RECORD"));
      assert.equal(record.sql_shape_compatible, false);
      assert.equal(record.api_shape_compatible, false);
      assertBlocked(record);
    });
  }
});

test("adaptation is deterministic, accepts frozen inputs, and does not mutate source or output aliases", () => {
  const inputs = [segment("baseline", [documentedNativeRecord(), documentaryRecord({ record_id: "SYN-DOC-002" })])];
  const before = clone(inputs);
  deepFreeze(inputs);
  const first = adaptSegments(inputs);
  const second = adaptSegments(inputs);
  assert.deepEqual(first, second);
  assert.deepEqual(inputs, before);
  first.segments[0].records[0].documentary_record.area = "Output-only change";
  assert.equal(inputs[0].records[0].area, before[0].records[0].area);
});

test("adapter output explicitly leaves database imports and M1 reproducibility unperformed", () => {
  const result = adaptSegments([segment("baseline", [documentedNativeRecord()])]);
  assert.equal(result.mode, "DOCUMENTARY_STAGING_ONLY");
  assert.equal(result.database_import, "NOT_EXECUTED");
  assert.equal(result.m1_reproducibility, "NOT_DEMONSTRATED");
  assert.equal(result.segments[0].summary.eligible_for_import, 0);
  assert.ok(result.adapter_version);
  result.segments[0].records.forEach(assertBlocked);
});
