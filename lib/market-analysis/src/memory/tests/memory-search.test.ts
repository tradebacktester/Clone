import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  normalisePagination,
  buildPaginatedResult,
} from "../memory-search/index.js";

// ─── Pagination Normalisation ──────────────────────────────────────────────

describe("normalisePagination", () => {
  it("uses defaults when no params given", () => {
    const p = normalisePagination(undefined, undefined);
    assert.equal(p.limit, 50);
    assert.equal(p.offset, 0);
  });

  it("clamps limit to maxLimit", () => {
    const p = normalisePagination(1000, 0, 500);
    assert.equal(p.limit, 500);
  });

  it("enforces minimum limit of 1", () => {
    const p = normalisePagination(0, 0);
    assert.equal(p.limit, 1);
  });

  it("clamps negative offset to 0", () => {
    const p = normalisePagination(50, -10);
    assert.equal(p.offset, 0);
  });

  it("parses string numbers", () => {
    const p = normalisePagination("25", "100");
    assert.equal(p.limit, 25);
    assert.equal(p.offset, 100);
  });
});

// ─── Paginated Result Builder ──────────────────────────────────────────────

describe("buildPaginatedResult", () => {
  it("correctly sets hasMore when more records exist", () => {
    const result = buildPaginatedResult(["a", "b", "c"], 10, { limit: 3, offset: 0 });
    assert.equal(result.hasMore, true);
    assert.equal(result.total, 10);
    assert.equal(result.data.length, 3);
  });

  it("sets hasMore = false on last page", () => {
    const result = buildPaginatedResult(["a", "b"], 7, { limit: 5, offset: 5 });
    assert.equal(result.hasMore, false);
  });

  it("handles empty result set", () => {
    const result = buildPaginatedResult([], 0, { limit: 50, offset: 0 });
    assert.equal(result.hasMore, false);
    assert.equal(result.total, 0);
    assert.deepEqual(result.data, []);
  });

  it("echoes limit and offset", () => {
    const result = buildPaginatedResult([], 0, { limit: 25, offset: 50 });
    assert.equal(result.limit, 25);
    assert.equal(result.offset, 50);
  });
});
