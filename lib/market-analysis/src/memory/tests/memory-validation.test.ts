import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  validateSetupMemory,
  validateSkippedSetupMemory,
  validateMarketSnapshot,
  validateMemoryMetadata,
  validateTimestamps,
  computeDataHash,
  verifyDataHash,
} from "../memory-validation/index.js";

// ─── Setup Memory Validation ───────────────────────────────────────────────

describe("validateSetupMemory", () => {
  it("accepts a valid setup record", () => {
    const result = validateSetupMemory({
      pair: "EURUSD",
      direction: "long",
      session: "london",
      zoneScore: "75",
      liquidityScore: "80",
      amdScore: "65",
      confirmationScore: "90",
      confidence: "72",
    });
    assert.equal(result.valid, true);
    assert.deepEqual(result.errors, []);
  });

  it("rejects missing pair", () => {
    const result = validateSetupMemory({ direction: "long", session: "london" });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes("pair")));
  });

  it("rejects invalid pair", () => {
    const result = validateSetupMemory({ pair: "BTCUSD", direction: "long", session: "london" });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes("pair")));
  });

  it("rejects missing direction", () => {
    const result = validateSetupMemory({ pair: "GBPUSD", session: "london" });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes("direction")));
  });

  it("rejects invalid direction", () => {
    const result = validateSetupMemory({ pair: "GBPUSD", direction: "sideways", session: "london" });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes("direction")));
  });

  it("rejects score out of range (>100)", () => {
    const result = validateSetupMemory({
      pair: "EURUSD", direction: "long", session: "london",
      zoneScore: "105",
    });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes("zoneScore")));
  });

  it("rejects score out of range (<0)", () => {
    const result = validateSetupMemory({
      pair: "EURUSD", direction: "long", session: "london",
      confidence: "-5",
    });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes("confidence")));
  });

  it("accepts all supported pairs", () => {
    const pairs = ["EURUSD", "GBPUSD", "USDJPY"];
    for (const pair of pairs) {
      const r = validateSetupMemory({ pair, direction: "long", session: "london" });
      assert.equal(r.valid, true, `Expected valid for pair ${pair}`);
    }
  });

  it("accepts all supported directions", () => {
    for (const direction of ["long", "short", "buy", "sell"]) {
      const r = validateSetupMemory({ pair: "EURUSD", direction, session: "london" });
      assert.equal(r.valid, true, `Expected valid for direction ${direction}`);
    }
  });

  it("accepts zero scores", () => {
    const result = validateSetupMemory({
      pair: "EURUSD", direction: "long", session: "london",
      zoneScore: "0", confidence: "0",
    });
    assert.equal(result.valid, true);
  });
});

// ─── Skipped Setup Validation ──────────────────────────────────────────────

describe("validateSkippedSetupMemory", () => {
  it("accepts a valid skipped setup", () => {
    const result = validateSkippedSetupMemory({
      pair: "USDJPY",
      direction: "short",
      session: "new_york",
      skipReason: "below_confidence",
      rejectingRule: "confidence_threshold",
      rejectingModule: "signal_generator",
    });
    assert.equal(result.valid, true);
  });

  it("rejects missing skipReason", () => {
    const result = validateSkippedSetupMemory({
      pair: "EURUSD",
      direction: "long",
      session: "london",
      skipReason: "",
      rejectingRule: "some_rule",
      rejectingModule: "module",
    });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes("skipReason")));
  });

  it("rejects missing rejectingRule", () => {
    const result = validateSkippedSetupMemory({
      pair: "EURUSD",
      direction: "long",
      session: "london",
      skipReason: "below_confidence",
      rejectingRule: "",
      rejectingModule: "module",
    });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes("rejectingRule")));
  });

  it("rejects missing rejectingModule", () => {
    const result = validateSkippedSetupMemory({
      pair: "EURUSD",
      direction: "long",
      session: "london",
      skipReason: "below_confidence",
      rejectingRule: "some_rule",
      rejectingModule: "",
    });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes("rejectingModule")));
  });

  it("accumulates multiple errors", () => {
    const result = validateSkippedSetupMemory({});
    assert.equal(result.valid, false);
    assert.ok(result.errors.length >= 3);
  });
});

// ─── Market Snapshot Validation ────────────────────────────────────────────

describe("validateMarketSnapshot", () => {
  it("accepts a valid snapshot", () => {
    const result = validateMarketSnapshot({
      pair: "EURUSD",
      session: "london",
      priceOpen: "1.08500",
      priceHigh: "1.08750",
      priceLow:  "1.08300",
      priceClose:"1.08600",
    });
    assert.equal(result.valid, true);
  });

  it("rejects missing pair", () => {
    const result = validateMarketSnapshot({ session: "london" });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes("pair")));
  });

  it("rejects high < low", () => {
    const result = validateMarketSnapshot({
      pair: "EURUSD",
      session: "london",
      priceOpen: "1.085",
      priceHigh: "1.083",
      priceLow:  "1.087",
      priceClose:"1.084",
    });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes("priceHigh")));
  });

  it("accepts null price fields (not yet available)", () => {
    const result = validateMarketSnapshot({ pair: "GBPUSD", session: "london" });
    assert.equal(result.valid, true);
  });
});

// ─── Memory Metadata Validation ────────────────────────────────────────────

describe("validateMemoryMetadata", () => {
  it("accepts valid metadata", () => {
    const result = validateMemoryMetadata({
      recordId:     "abc-123",
      recordTable:  "setup_memory",
      dataHash:     "deadbeef",
      sourceModule: "paper_engine",
    });
    assert.equal(result.valid, true);
  });

  it("rejects empty recordId", () => {
    const result = validateMemoryMetadata({
      recordId: "",
      recordTable: "setup_memory",
      dataHash: "deadbeef",
      sourceModule: "paper_engine",
    });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes("recordId")));
  });

  it("rejects empty dataHash", () => {
    const result = validateMemoryMetadata({
      recordId: "abc",
      recordTable: "setup_memory",
      dataHash: "",
      sourceModule: "paper_engine",
    });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes("dataHash")));
  });
});

// ─── Timestamp Validation ──────────────────────────────────────────────────

describe("validateTimestamps", () => {
  it("accepts valid timestamps in order", () => {
    const created = new Date("2025-01-01T00:00:00Z");
    const updated = new Date("2025-01-02T00:00:00Z");
    const result = validateTimestamps(created, updated);
    assert.equal(result.valid, true);
  });

  it("accepts identical timestamps", () => {
    const d = new Date("2025-06-01T12:00:00Z");
    const result = validateTimestamps(d, d);
    assert.equal(result.valid, true);
  });

  it("rejects updatedAt before createdAt", () => {
    const created = new Date("2025-06-15T00:00:00Z");
    const updated = new Date("2025-06-14T00:00:00Z");
    const result = validateTimestamps(created, updated);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes("updatedAt")));
  });

  it("accepts null timestamps", () => {
    const result = validateTimestamps(null, null);
    assert.equal(result.valid, true);
  });
});

// ─── Data Hash ─────────────────────────────────────────────────────────────

describe("computeDataHash / verifyDataHash", () => {
  it("produces a deterministic SHA-256 hash", () => {
    const input = {
      table: "setup_memory",
      recordId: "test-id",
      payload: { pair: "EURUSD", direction: "long" },
    };
    const h1 = computeDataHash(input);
    const h2 = computeDataHash(input);
    assert.equal(h1, h2);
    assert.equal(h1.length, 64);
  });

  it("produces different hashes for different payloads", () => {
    const base = { table: "setup_memory", recordId: "id1" };
    const h1 = computeDataHash({ ...base, payload: { pair: "EURUSD" } });
    const h2 = computeDataHash({ ...base, payload: { pair: "GBPUSD" } });
    assert.notEqual(h1, h2);
  });

  it("verifyDataHash returns true for correct hash", () => {
    const input = {
      table: "setup_memory",
      recordId: "test-id",
      payload: { direction: "short" },
    };
    const hash = computeDataHash(input);
    assert.equal(verifyDataHash(input, hash), true);
  });

  it("verifyDataHash returns false for tampered hash", () => {
    const input = {
      table: "setup_memory",
      recordId: "test-id",
      payload: { direction: "short" },
    };
    assert.equal(verifyDataHash(input, "0".repeat(64)), false);
  });
});
