import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  scoreToScoreBucket,
  buildClusterKey,
  parseClusterKey,
  buildSnapshotRefKey,
  buildSetupIdentityKey,
  buildSearchCacheKey,
  computeCompositeScore,
} from "../memory-index/index.js";

// ─── Score Bucketing ───────────────────────────────────────────────────────

describe("scoreToScoreBucket", () => {
  it("returns <70 for scores below 70", () => {
    assert.equal(scoreToScoreBucket(0),  "<70");
    assert.equal(scoreToScoreBucket(50), "<70");
    assert.equal(scoreToScoreBucket(69), "<70");
  });

  it("returns 70-79 for scores 70–79", () => {
    assert.equal(scoreToScoreBucket(70), "70-79");
    assert.equal(scoreToScoreBucket(75), "70-79");
    assert.equal(scoreToScoreBucket(79), "70-79");
  });

  it("returns 80-89 for scores 80–89", () => {
    assert.equal(scoreToScoreBucket(80), "80-89");
    assert.equal(scoreToScoreBucket(85), "80-89");
    assert.equal(scoreToScoreBucket(89), "80-89");
  });

  it("returns 90+ for scores >= 90", () => {
    assert.equal(scoreToScoreBucket(90),  "90+");
    assert.equal(scoreToScoreBucket(95),  "90+");
    assert.equal(scoreToScoreBucket(100), "90+");
  });
});

// ─── Cluster Key ───────────────────────────────────────────────────────────

describe("buildClusterKey", () => {
  it("produces a pipe-delimited composite key", () => {
    const key = buildClusterKey({
      zoneScore: 85,
      liquidityScore: 75,
      amdScore: 92,
      confirmationScore: 68,
      session: "London",
    });
    assert.equal(key, "z80-89|l70-79|a90+|c<70|slondon");
  });

  it("normalises session to lowercase", () => {
    const key = buildClusterKey({
      zoneScore: 80, liquidityScore: 80, amdScore: 80,
      confirmationScore: 80, session: "NEW_YORK",
    });
    assert.ok(key.includes("|snew_york"));
  });

  it("produces deterministic keys for same inputs", () => {
    const input = { zoneScore: 70, liquidityScore: 70, amdScore: 70, confirmationScore: 70, session: "london" };
    assert.equal(buildClusterKey(input), buildClusterKey(input));
  });
});

describe("parseClusterKey", () => {
  it("round-trips a valid cluster key", () => {
    const key = "z80-89|l70-79|a90+|c<70|slondon";
    const parsed = parseClusterKey(key);
    assert.notEqual(parsed, null);
    assert.equal(parsed!.session, "london");
    assert.equal(parsed!.amdScore, 95);
    assert.equal(parsed!.confirmationScore, 65);
  });

  it("returns null for an invalid key", () => {
    assert.equal(parseClusterKey("not_a_key"), null);
    assert.equal(parseClusterKey(""), null);
  });
});

// ─── Snapshot Reference Key ────────────────────────────────────────────────

describe("buildSnapshotRefKey", () => {
  it("produces a key with pair, session, and 15-min bucket", () => {
    const date = new Date("2025-06-27T10:07:00Z");
    const key = buildSnapshotRefKey("EURUSD", "london", date);
    // bucket should round to 10:00 UTC
    assert.ok(key.startsWith("EURUSD|london|"));
    assert.match(key, /\d{13}$/);
  });

  it("identical keys for times within the same 15-min bucket", () => {
    const t1 = new Date("2025-06-27T10:00:00Z");
    const t2 = new Date("2025-06-27T10:14:59Z");
    assert.equal(
      buildSnapshotRefKey("GBPUSD", "london", t1),
      buildSnapshotRefKey("GBPUSD", "london", t2),
    );
  });

  it("different keys across 15-min buckets", () => {
    const t1 = new Date("2025-06-27T10:00:00Z");
    const t2 = new Date("2025-06-27T10:15:00Z");
    assert.notEqual(
      buildSnapshotRefKey("GBPUSD", "london", t1),
      buildSnapshotRefKey("GBPUSD", "london", t2),
    );
  });
});

// ─── Setup Identity Key ────────────────────────────────────────────────────

describe("buildSetupIdentityKey", () => {
  it("groups setups in same 5-min window", () => {
    const k1 = buildSetupIdentityKey({ pair: "EURUSD", direction: "long", session: "london", evaluatedAt: new Date("2025-06-27T09:01:00Z") });
    const k2 = buildSetupIdentityKey({ pair: "EURUSD", direction: "long", session: "london", evaluatedAt: new Date("2025-06-27T09:04:59Z") });
    assert.equal(k1, k2);
  });

  it("different keys for different directions", () => {
    const base = { pair: "EURUSD", session: "london", evaluatedAt: new Date("2025-06-27T09:00:00Z") };
    const k1 = buildSetupIdentityKey({ ...base, direction: "long" });
    const k2 = buildSetupIdentityKey({ ...base, direction: "short" });
    assert.notEqual(k1, k2);
  });
});

// ─── Search Cache Key ──────────────────────────────────────────────────────

describe("buildSearchCacheKey", () => {
  it("produces a stable cache key", () => {
    const k = buildSearchCacheKey("setups", { pair: "EURUSD", session: "london", limit: 50 });
    assert.equal(k, "setups|p:EURUSD|s:london|lim:50");
  });

  it("omits undefined filters", () => {
    const k = buildSearchCacheKey("trades", {});
    assert.equal(k, "trades");
  });
});

// ─── Composite Score ───────────────────────────────────────────────────────

describe("computeCompositeScore", () => {
  it("returns 0 for all-zero record", () => {
    const score = computeCompositeScore({ zoneScore: 0, liquidityScore: 0, amdScore: 0, confirmationScore: 0, confidence: 0 });
    assert.equal(score, 0);
  });

  it("returns 100 for all-100 record", () => {
    const score = computeCompositeScore({ zoneScore: 100, liquidityScore: 100, amdScore: 100, confirmationScore: 100, confidence: 100 });
    assert.equal(score, 100);
  });

  it("handles null/undefined fields as zero", () => {
    const score = computeCompositeScore({});
    assert.equal(score, 0);
  });

  it("computes weighted average correctly", () => {
    const score = computeCompositeScore({
      zoneScore: 100,         // weight 0.25 → 25
      liquidityScore: 100,    // weight 0.20 → 20
      amdScore: 100,          // weight 0.25 → 25
      confirmationScore: 100, // weight 0.20 → 20
      confidence: 100,        // weight 0.10 → 10
    });
    assert.equal(score, 100);
  });
});
