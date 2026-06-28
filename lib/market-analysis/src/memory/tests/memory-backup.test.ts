/**
 * Memory Backup Engine Tests
 *
 * Tests for checksum computation, manifest structure, backup validation,
 * and restore test logic — all pure functions, no DB required.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "crypto";

// ─── Inline implementations (mirrors memory-backup.ts logic) ─────────────────

interface BackupManifest {
  backupId:           string;
  backupType:         "full" | "incremental";
  triggeredBy:        string;
  createdAt:          string;
  sinceDate?:         string;
  checksum:           string;
  recordCounts:       Record<string, number>;
  totalRecords:       number;
  estimatedSizeBytes: number;
  tables:             string[];
  version:            string;
}

interface BackupPayload {
  manifest:           BackupManifest;
  experiences:        unknown[];
  relationships:      unknown[];
  relationshipHistory: unknown[];
  tradeEvents:        unknown[];
  screenshots:        unknown[];
  contexts:           unknown[];
  timelineEvents:     unknown[];
  setups:             unknown[];
  skippedSetups:      unknown[];
  snapshots:          unknown[];
  metadata:           unknown[];
  reviews:            unknown[];
}

function computeChecksum(data: unknown): string {
  const str = JSON.stringify(data, Object.keys(data as object).sort());
  return createHash("sha256").update(str).digest("hex");
}

function buildManifest(
  tables: Record<string, unknown[]>,
  backupType: "full" | "incremental" = "full",
): BackupManifest {
  const recordCounts: Record<string, number> = {};
  let totalRecords = 0;
  for (const [table, rows] of Object.entries(tables)) {
    recordCounts[table] = rows.length;
    totalRecords += rows.length;
  }
  const checksum = computeChecksum(tables);
  return {
    backupId:           crypto.randomUUID(),
    backupType,
    triggeredBy:        "test",
    createdAt:          new Date().toISOString(),
    checksum,
    recordCounts,
    totalRecords,
    estimatedSizeBytes: JSON.stringify(tables).length,
    tables:             Object.keys(tables),
    version:            "2.0",
  };
}

interface VerificationResult {
  passed:        boolean;
  checksumMatch: boolean;
  missing:       string[];
  extra:         string[];
  details:       string;
}

function verifyManifest(manifest: BackupManifest, data: Record<string, unknown[]>): VerificationResult {
  const recomputed    = computeChecksum(data);
  const checksumMatch = recomputed === manifest.checksum;
  const missing: string[] = [];

  for (const [table, expected] of Object.entries(manifest.recordCounts)) {
    const actual = (data[table] ?? []).length;
    if (actual !== expected) missing.push(`${table}: expected ${expected}, got ${actual}`);
  }

  return {
    passed:        checksumMatch && missing.length === 0,
    checksumMatch,
    missing,
    extra:         [],
    details:       checksumMatch && missing.length === 0 ? "Backup verified" : "Backup has issues",
  };
}

interface RestoreTestResult {
  wouldRestore:    boolean;
  tables:          string[];
  relationshipsOk: boolean;
  timelinesOk:     boolean;
  screenshotsOk:   boolean;
  issues:          string[];
}

function testRestoreFromManifest(payload: Partial<BackupPayload>): RestoreTestResult {
  if (!payload.manifest) {
    return { wouldRestore: false, tables: [], relationshipsOk: false, timelinesOk: false, screenshotsOk: false, issues: ["Missing manifest"] };
  }
  const issues: string[] = [];
  const expIds = new Set((payload.experiences ?? []).map((e: unknown) => (e as { tradeId?: number }).tradeId));

  let brokenRels = 0;
  for (const rel of (payload.relationships ?? []) as Array<{ from_type: string; from_id: string }>) {
    if (rel.from_type === "trade" && !expIds.has(parseInt(rel.from_id))) brokenRels++;
  }
  if (brokenRels > 0) issues.push(`${brokenRels} relationship(s) point to non-existent experiences`);

  const orphanTimeline = ((payload.timelineEvents ?? []) as Array<{ trade_id?: number }>)
    .filter(e => e.trade_id != null && !expIds.has(e.trade_id)).length;
  if (orphanTimeline > 0) issues.push(`${orphanTimeline} timeline event(s) reference non-existent trades`);

  const totalShots = (payload.screenshots ?? []).length;
  const withHash   = ((payload.screenshots ?? []) as Array<{ fileHash?: string }>).filter(s => s.fileHash).length;
  const screenshotsOk = totalShots === 0 || withHash / totalShots >= 0.5;
  if (!screenshotsOk) issues.push(`Only ${withHash}/${totalShots} screenshots have integrity hashes`);

  return {
    wouldRestore:    issues.length === 0,
    tables:          payload.manifest.tables,
    relationshipsOk: brokenRels === 0,
    timelinesOk:     orphanTimeline === 0,
    screenshotsOk,
    issues,
  };
}

// ─── Checksum Tests ───────────────────────────────────────────────────────────

describe("computeChecksum", () => {
  it("returns a 64-char hex string (SHA-256)", () => {
    const cs = computeChecksum({ a: 1 });
    assert.equal(cs.length, 64);
    assert.match(cs, /^[a-f0-9]+$/);
  });

  it("same data produces same checksum", () => {
    const cs1 = computeChecksum({ foo: "bar", count: 42 });
    const cs2 = computeChecksum({ foo: "bar", count: 42 });
    assert.equal(cs1, cs2);
  });

  it("different data produces different checksum", () => {
    const cs1 = computeChecksum({ count: 1 });
    const cs2 = computeChecksum({ count: 2 });
    assert.notEqual(cs1, cs2);
  });

  it("key ordering does not affect checksum (keys are sorted)", () => {
    const cs1 = computeChecksum({ a: 1, b: 2 });
    const cs2 = computeChecksum({ b: 2, a: 1 });
    assert.equal(cs1, cs2);
  });

  it("empty object produces consistent checksum", () => {
    const cs1 = computeChecksum({});
    const cs2 = computeChecksum({});
    assert.equal(cs1, cs2);
  });
});

// ─── Manifest Tests ───────────────────────────────────────────────────────────

describe("buildManifest", () => {
  it("produces correct record counts", () => {
    const tables = {
      memory_experiences: [{ id: 1 }, { id: 2 }],
      trade_events:       [{ id: 10 }],
    };
    const manifest = buildManifest(tables);
    assert.equal(manifest.recordCounts["memory_experiences"], 2);
    assert.equal(manifest.recordCounts["trade_events"], 1);
  });

  it("computes totalRecords correctly", () => {
    const tables = {
      memory_experiences: [{}, {}, {}],
      trade_events:       [{}, {}],
    };
    const manifest = buildManifest(tables);
    assert.equal(manifest.totalRecords, 5);
  });

  it("version is always '2.0'", () => {
    const manifest = buildManifest({});
    assert.equal(manifest.version, "2.0");
  });

  it("has a UUID backupId", () => {
    const manifest = buildManifest({});
    assert.match(manifest.backupId, /^[0-9a-f-]{36}$/);
  });

  it("tables array matches provided keys", () => {
    const tables = { t1: [], t2: [], t3: [] };
    const manifest = buildManifest(tables);
    assert.deepEqual([...manifest.tables].sort(), ["t1", "t2", "t3"]);
  });

  it("checksum is a 64-char hex string", () => {
    const manifest = buildManifest({ t1: [{ a: 1 }] });
    assert.equal(manifest.checksum.length, 64);
  });

  it("supports incremental backup type", () => {
    const manifest = buildManifest({}, "incremental");
    assert.equal(manifest.backupType, "incremental");
  });
});

// ─── Verification Tests ───────────────────────────────────────────────────────

describe("verifyManifest", () => {
  it("passes for untampered backup", () => {
    const data = { memory_experiences: [{ id: 1 }], trade_events: [{ id: 10 }] };
    const manifest = buildManifest(data);
    const result = verifyManifest(manifest, data);
    assert.equal(result.passed, true);
    assert.equal(result.checksumMatch, true);
    assert.equal(result.missing.length, 0);
  });

  it("fails when data is modified", () => {
    const data = { memory_experiences: [{ id: 1 }] };
    const manifest = buildManifest(data);
    const tampered = { memory_experiences: [{ id: 1 }, { id: 2 }] }; // extra record
    const result = verifyManifest(manifest, tampered);
    assert.equal(result.passed, false);
    assert.equal(result.checksumMatch, false);
  });

  it("reports missing count mismatches", () => {
    const data = { memory_experiences: [{ id: 1 }, { id: 2 }] };
    const manifest = buildManifest(data);
    const result = verifyManifest(manifest, { memory_experiences: [{ id: 1 }] });
    assert.equal(result.missing.length, 1);
    assert.ok(result.missing[0]!.includes("memory_experiences"));
  });

  it("empty backup passes verification", () => {
    const manifest = buildManifest({});
    const result = verifyManifest(manifest, {});
    assert.equal(result.passed, true);
  });
});

// ─── Restore Test Tests ───────────────────────────────────────────────────────

describe("testRestoreFromManifest", () => {
  function makeManifest(): BackupManifest {
    return buildManifest({ memory_experiences: [], memory_relationships: [], trade_screenshots: [] });
  }

  it("fails without a manifest", () => {
    const result = testRestoreFromManifest({});
    assert.equal(result.wouldRestore, false);
    assert.ok(result.issues.some(i => i.includes("manifest")));
  });

  it("passes for clean backup with consistent data", () => {
    const payload: Partial<BackupPayload> = {
      manifest:      makeManifest(),
      experiences:   [{ tradeId: 1 }],
      relationships: [{ from_type: "trade", from_id: "1" }],
      timelineEvents: [{ trade_id: 1 }],
      screenshots:   [{ fileHash: "abc123" }],
    };
    const result = testRestoreFromManifest(payload);
    assert.equal(result.relationshipsOk, true);
    assert.equal(result.timelinesOk, true);
    assert.equal(result.screenshotsOk, true);
    assert.equal(result.wouldRestore, true);
  });

  it("detects orphaned relationships", () => {
    const payload: Partial<BackupPayload> = {
      manifest:      makeManifest(),
      experiences:   [{ tradeId: 1 }],
      relationships: [{ from_type: "trade", from_id: "999" }],  // 999 not in experiences
    };
    const result = testRestoreFromManifest(payload);
    assert.equal(result.relationshipsOk, false);
    assert.ok(result.issues.some(i => i.includes("relationship")));
  });

  it("detects orphaned timeline events", () => {
    const payload: Partial<BackupPayload> = {
      manifest:        makeManifest(),
      experiences:     [{ tradeId: 1 }],
      timelineEvents:  [{ trade_id: 999 }],  // 999 not in experiences
    };
    const result = testRestoreFromManifest(payload);
    assert.equal(result.timelinesOk, false);
  });

  it("detects screenshots missing hashes (< 50% have hash)", () => {
    const payload: Partial<BackupPayload> = {
      manifest:    makeManifest(),
      screenshots: [{ id: "a" }, { id: "b" }, { id: "c", fileHash: "abc" }], // 33% have hash
    };
    const result = testRestoreFromManifest(payload);
    assert.equal(result.screenshotsOk, false);
  });

  it("screenshots all OK when more than 50% have hashes", () => {
    const payload: Partial<BackupPayload> = {
      manifest:    makeManifest(),
      screenshots: [
        { id: "a", fileHash: "h1" },
        { id: "b", fileHash: "h2" },
        { id: "c" },                     // 66% have hashes — OK
      ],
    };
    const result = testRestoreFromManifest(payload);
    assert.equal(result.screenshotsOk, true);
  });

  it("empty screenshots array is OK", () => {
    const payload: Partial<BackupPayload> = { manifest: makeManifest(), screenshots: [] };
    const result = testRestoreFromManifest(payload);
    assert.equal(result.screenshotsOk, true);
  });
});
