import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseCommonQuery,
  parseSetupQuery,
  parseSkippedQuery,
  parseStoreRequest,
  apiError,
  apiNotFound,
} from "../memory-api/index.js";

// ─── parseCommonQuery ──────────────────────────────────────────────────────

describe("parseCommonQuery", () => {
  it("parses pair and uppercases it", () => {
    const result = parseCommonQuery({ pair: "eurusd" });
    assert.equal(result.pair, "EURUSD");
  });

  it("lowercases direction", () => {
    const result = parseCommonQuery({ direction: "LONG" });
    assert.equal(result.direction, "long");
  });

  it("lowercases session", () => {
    const result = parseCommonQuery({ session: "London" });
    assert.equal(result.session, "london");
  });

  it("parses dateFrom as a Date", () => {
    const result = parseCommonQuery({ dateFrom: "2025-01-01T00:00:00Z" });
    assert.ok(result.dateFrom instanceof Date);
    assert.ok(!isNaN(result.dateFrom!.getTime()));
  });

  it("omits invalid dateFrom", () => {
    const result = parseCommonQuery({ dateFrom: "not-a-date" });
    assert.equal(result.dateFrom, undefined);
  });

  it("uses default pagination", () => {
    const result = parseCommonQuery({});
    assert.equal(result.pagination.limit, 50);
    assert.equal(result.pagination.offset, 0);
  });
});

// ─── parseSetupQuery ───────────────────────────────────────────────────────

describe("parseSetupQuery", () => {
  it("parses isAccepted=true flag", () => {
    const { filters } = parseSetupQuery({ isAccepted: "true" });
    assert.equal(filters.isAccepted, true);
  });

  it("parses isAccepted=false flag", () => {
    const { filters } = parseSetupQuery({ isAccepted: "false" });
    assert.equal(filters.isAccepted, false);
  });

  it("leaves isAccepted undefined when not provided", () => {
    const { filters } = parseSetupQuery({});
    assert.equal(filters.isAccepted, undefined);
  });

  it("parses minConfidence as number", () => {
    const { filters } = parseSetupQuery({ minConfidence: "75.5" });
    assert.equal(filters.minConfidence, 75.5);
  });
});

// ─── parseSkippedQuery ─────────────────────────────────────────────────────

describe("parseSkippedQuery", () => {
  it("passes skipReason through", () => {
    const { filters } = parseSkippedQuery({ skipReason: "below_confidence" });
    assert.equal(filters.skipReason, "below_confidence");
  });

  it("passes rejectingRule through", () => {
    const { filters } = parseSkippedQuery({ rejectingRule: "confidence_threshold" });
    assert.equal(filters.rejectingRule, "confidence_threshold");
  });
});

// ─── parseStoreRequest ─────────────────────────────────────────────────────

describe("parseStoreRequest", () => {
  it("parses a valid store request", () => {
    const result = parseStoreRequest({
      table: "setup_memory",
      sourceModule: "paper_engine",
      data: { pair: "EURUSD" },
    });
    assert.notEqual(result, null);
    assert.equal(result!.table, "setup_memory");
    assert.equal(result!.sourceModule, "paper_engine");
  });

  it("returns null for null body", () => {
    assert.equal(parseStoreRequest(null), null);
  });

  it("returns null for missing table", () => {
    assert.equal(parseStoreRequest({ sourceModule: "x", data: {} }), null);
  });

  it("returns null for empty table string", () => {
    assert.equal(parseStoreRequest({ table: "  ", sourceModule: "x", data: {} }), null);
  });

  it("returns null for missing data", () => {
    assert.equal(parseStoreRequest({ table: "t", sourceModule: "x" }), null);
  });

  it("returns null for non-object body", () => {
    assert.equal(parseStoreRequest("invalid"), null);
    assert.equal(parseStoreRequest(42), null);
  });
});

// ─── apiError / apiNotFound ────────────────────────────────────────────────

describe("apiError", () => {
  it("returns an object with error field", () => {
    const result = apiError("Something went wrong");
    assert.equal(result.error, "Something went wrong");
    assert.equal(result.details, undefined);
  });

  it("includes details when provided", () => {
    const result = apiError("Validation failed", ["field is required"]);
    assert.deepEqual(result.details, ["field is required"]);
  });
});

describe("apiNotFound", () => {
  it("formats not-found message", () => {
    const result = apiNotFound("setup");
    assert.equal(result.error, "setup not found");
  });
});
