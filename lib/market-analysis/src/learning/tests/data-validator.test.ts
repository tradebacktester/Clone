import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  validateTrades,
  toNumber,
  clamp,
  safeDivide,
  MIN_SAMPLE_FOR_PASSED,
  MIN_SAMPLE_FOR_DEGRADED,
} from "../learning-validation/data-validator.js";
import type { RawTradeRecord } from "../learning-core/types.js";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeRec(overrides: Partial<RawTradeRecord> = {}): RawTradeRecord {
  return {
    id: Math.floor(Math.random() * 100000),
    pair: "EURUSD",
    direction: "buy",
    session: "london",
    regime: "trending",
    regimeConfidence: 80,
    zoneScore: 75,
    liquidityScore: 70,
    amdScore: 65,
    confirmationScore: 80,
    finalScore: 73,
    confidence: 72,
    riskRewardPlanned: 2.5,
    riskRewardActual: 2.1,
    outcome: "win",
    pnl: 120,
    pnlPercent: 1.2,
    timeInTradeMins: 90,
    openedAt: new Date("2024-01-15T09:00:00Z"),
    closedAt: new Date("2024-01-15T10:30:00Z"),
    ...overrides,
  };
}

function makeRecs(n: number, overrides: Partial<RawTradeRecord> = {}): RawTradeRecord[] {
  return Array.from({ length: n }, (_, i) => makeRec({ id: i + 1, ...overrides }));
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("validateTrades", () => {
  describe("Empty input", () => {
    it("returns invalid result for empty array", () => {
      const r = validateTrades([]);
      assert.equal(r.isValid, false);
      assert.equal(r.totalRecords, 0);
      assert.equal(r.usableRecords, 0);
      assert.ok(r.issues.some(i => i.severity === "error"));
    });
  });

  describe("Minimum sample size", () => {
    it("invalid when below MIN_SAMPLE_FOR_DEGRADED", () => {
      const recs = makeRecs(MIN_SAMPLE_FOR_DEGRADED - 1);
      const r = validateTrades(recs);
      assert.equal(r.isValid, false);
      assert.ok(r.issues.some(i => i.field === "sampleSize" && i.severity === "error"));
    });

    it("valid (degraded) at exactly MIN_SAMPLE_FOR_DEGRADED", () => {
      const recs = makeRecs(MIN_SAMPLE_FOR_DEGRADED);
      const r = validateTrades(recs);
      assert.equal(r.isValid, true);
      assert.equal(r.usableRecords, MIN_SAMPLE_FOR_DEGRADED);
    });

    it("produces warning (not error) below MIN_SAMPLE_FOR_PASSED but above degraded", () => {
      const recs = makeRecs(MIN_SAMPLE_FOR_PASSED - 1);
      const r = validateTrades(recs);
      assert.ok(r.issues.some(i => i.field === "sampleSize" && i.severity === "warning"));
      assert.ok(!r.issues.some(i => i.field === "sampleSize" && i.severity === "error"));
    });

    it("no sample size issue at or above MIN_SAMPLE_FOR_PASSED", () => {
      const recs = makeRecs(MIN_SAMPLE_FOR_PASSED);
      const r = validateTrades(recs);
      assert.ok(!r.issues.some(i => i.field === "sampleSize"));
    });
  });

  describe("Outcome filtering", () => {
    it("excludes records without outcome", () => {
      const recs = [
        makeRec({ id: 1, outcome: "win" }),
        makeRec({ id: 2, outcome: null as any }),
        makeRec({ id: 3, outcome: undefined as any }),
        makeRec({ id: 4, outcome: "loss" }),
        makeRec({ id: 5, outcome: "break_even" }),
      ];
      const r = validateTrades(recs);
      assert.equal(r.totalRecords, 5);
      assert.equal(r.usableRecords, 3);
      assert.equal(r.rejectedRecords, 2);
    });

    it("accepts all valid outcome values", () => {
      const recs = [
        makeRec({ outcome: "win" }),
        makeRec({ outcome: "loss" }),
        makeRec({ outcome: "break_even" }),
      ];
      const r = validateTrades(recs);
      assert.equal(r.usableRecords, 3);
    });
  });

  describe("Pair validation", () => {
    it("warns on unknown pair but still uses record if outcome present", () => {
      const recs = [
        ...makeRecs(5),
        makeRec({ pair: "XAUUSD", id: 99 }),
      ];
      const r = validateTrades(recs);
      assert.ok(r.issues.some(i => i.field === "pair" && i.severity === "warning"));
    });
  });

  describe("Completeness score", () => {
    it("produces score > 0 for complete records", () => {
      const recs = makeRecs(10);
      const r = validateTrades(recs);
      assert.ok(r.completenessScore > 50);
    });

    it("produces lower score for sparse records", () => {
      const sparse = makeRecs(10, {
        zoneScore: null as any,
        liquidityScore: null as any,
        amdScore: null as any,
        regime: null as any,
        riskRewardActual: null as any,
        pnl: null as any,
        timeInTradeMins: undefined as any,
      });
      const rFull = validateTrades(makeRecs(10));
      const rSparse = validateTrades(sparse);
      assert.ok(rSparse.completenessScore < rFull.completenessScore);
    });
  });

  describe("Quality notes", () => {
    it("adds note when records are rejected", () => {
      const recs = [
        makeRec({ outcome: "win" }),
        makeRec({ outcome: null as any }),
        makeRec({ outcome: "loss" }),
        makeRec({ outcome: "win" }),
      ];
      const r = validateTrades(recs);
      assert.ok(r.qualityNotes.some(n => n.includes("excluded")));
    });
  });
});

describe("toNumber", () => {
  it("converts string numbers", () => { assert.equal(toNumber("3.14"), 3.14); });
  it("returns null for null", () => { assert.equal(toNumber(null), null); });
  it("returns null for undefined", () => { assert.equal(toNumber(undefined), null); });
  it("returns null for empty string", () => { assert.equal(toNumber(""), null); });
  it("returns null for NaN", () => { assert.equal(toNumber(NaN), null); });
  it("returns null for Infinity", () => { assert.equal(toNumber(Infinity), null); });
  it("passes through finite numbers", () => { assert.equal(toNumber(42), 42); });
  it("handles negative numbers", () => { assert.equal(toNumber(-1.5), -1.5); });
  it("returns null for non-numeric strings", () => { assert.equal(toNumber("abc"), null); });
});

describe("clamp", () => {
  it("clamps below min", () => { assert.equal(clamp(-5, 0, 100), 0); });
  it("clamps above max", () => { assert.equal(clamp(150, 0, 100), 100); });
  it("passes through values in range", () => { assert.equal(clamp(50, 0, 100), 50); });
  it("handles boundary min", () => { assert.equal(clamp(0, 0, 100), 0); });
  it("handles boundary max", () => { assert.equal(clamp(100, 0, 100), 100); });
});

describe("safeDivide", () => {
  it("divides normally", () => { assert.ok(Math.abs(safeDivide(10, 3) - 10 / 3) < 1e-10); });
  it("returns fallback for zero denominator", () => { assert.equal(safeDivide(10, 0), 0); });
  it("returns custom fallback", () => { assert.equal(safeDivide(10, 0, -1), -1); });
  it("handles negative numerator", () => { assert.ok(safeDivide(-10, 5) === -2); });
});
