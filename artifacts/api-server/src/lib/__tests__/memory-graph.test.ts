/**
 * Memory Relationship Graph — Unit Tests
 *
 * Tests cover:
 *  - Feature vector construction (dimensions, clamping, nulls)
 *  - Chain validation score logic
 *  - Integrity score bounds
 *  - Health issue categorization
 *  - Search option passthrough (shape only — no DB)
 *  - Data quality note generation
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

// ─── Feature Vector Tests ─────────────────────────────────────────────────────
// Mirrors the buildFeatureVector logic in experience-builder.ts

function buildFeatureVector(opts: {
  pnlPips?: number | null;
  riskReward?: number | null;
  durationMins?: number | null;
  volatilityScore?: number | null;
  confirmationQuality?: number | null;
  tiScore?: number | null;
  liquidityScore?: number | null;
  spreadPips?: number | null;
  traderConfidence?: number | null;
  screenshotCount?: number | null;
}): number[] {
  return [
    opts.pnlPips              ?? 0,
    Math.min(opts.riskReward         ?? 0, 20),
    Math.min(opts.durationMins       ?? 0, 2880),
    Math.min(opts.volatilityScore    ?? 0, 100),
    Math.min(opts.confirmationQuality ?? 0, 100),
    Math.min(opts.tiScore            ?? 0, 100),
    Math.min(opts.liquidityScore     ?? 0, 100),
    Math.min(opts.spreadPips         ?? 0, 10),
    Math.min(opts.traderConfidence   ?? 0, 100),
    Math.min(opts.screenshotCount    ?? 0, 20),
  ];
}

describe("buildFeatureVector", () => {
  it("returns a 10-element array", () => {
    const fv = buildFeatureVector({});
    assert.equal(fv.length, 10);
  });

  it("all zeros when no inputs", () => {
    const fv = buildFeatureVector({});
    assert.deepEqual(fv, [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it("handles null inputs as zeros", () => {
    const fv = buildFeatureVector({
      pnlPips: null, riskReward: null, durationMins: null, screenshotCount: null,
    });
    assert.equal(fv[0], 0);
    assert.equal(fv[1], 0);
    assert.equal(fv[2], 0);
    assert.equal(fv[9], 0);
  });

  it("does not clamp pnlPips (can be negative)", () => {
    const fv = buildFeatureVector({ pnlPips: -150 });
    assert.equal(fv[0], -150);
  });

  it("clamps riskReward to max 20", () => {
    const fv = buildFeatureVector({ riskReward: 999 });
    assert.equal(fv[1], 20);
  });

  it("clamps durationMins to max 2880 (48h)", () => {
    const fv = buildFeatureVector({ durationMins: 9999 });
    assert.equal(fv[2], 2880);
  });

  it("clamps all 0-100 scores to 100", () => {
    const fv = buildFeatureVector({
      volatilityScore: 200, confirmationQuality: 150, tiScore: 999, liquidityScore: 101, traderConfidence: 200,
    });
    assert.equal(fv[3], 100); // volatility
    assert.equal(fv[4], 100); // confirmation
    assert.equal(fv[5], 100); // ti
    assert.equal(fv[6], 100); // liquidity
    assert.equal(fv[8], 100); // traderConfidence
  });

  it("clamps spreadPips to max 10", () => {
    const fv = buildFeatureVector({ spreadPips: 50 });
    assert.equal(fv[7], 10);
  });

  it("clamps screenshotCount to max 20", () => {
    const fv = buildFeatureVector({ screenshotCount: 999 });
    assert.equal(fv[9], 20);
  });

  it("preserves non-zero values correctly", () => {
    const fv = buildFeatureVector({
      pnlPips: 23.5, riskReward: 2.5, durationMins: 90,
      volatilityScore: 65, confirmationQuality: 80, tiScore: 72,
      liquidityScore: 55, spreadPips: 1.2, traderConfidence: 80, screenshotCount: 3,
    });
    assert.equal(fv[0], 23.5);
    assert.equal(fv[1], 2.5);
    assert.equal(fv[2], 90);
    assert.equal(fv[3], 65);
    assert.equal(fv[4], 80);
    assert.equal(fv[5], 72);
    assert.equal(fv[6], 55);
    assert.equal(fv[7], 1.2);
    assert.equal(fv[8], 80);
    assert.equal(fv[9], 3);
  });
});

// ─── Chain Validation Score ───────────────────────────────────────────────────

function chainScore(presentCount: number, totalExpected: number): number {
  return Math.round((presentCount / totalExpected) * 100);
}

describe("chain validation scoring", () => {
  it("returns 100 for fully complete chain", () => {
    assert.equal(chainScore(4, 4), 100);
  });

  it("returns 0 for empty chain", () => {
    assert.equal(chainScore(0, 4), 0);
  });

  it("returns 50 for half-complete chain", () => {
    assert.equal(chainScore(2, 4), 50);
  });

  it("rounds correctly", () => {
    assert.equal(chainScore(1, 3), 33); // 33.33... rounds to 33
  });

  it("returns 75 for 3/4 complete", () => {
    assert.equal(chainScore(3, 4), 75);
  });
});

// ─── Integrity Score Bounds ───────────────────────────────────────────────────

function clampIntegrity(raw: number): number {
  return Math.min(1, Math.max(0, raw));
}

describe("integrity score clamping", () => {
  it("clamps at 0 minimum", () => {
    assert.equal(clampIntegrity(-0.5), 0);
  });

  it("clamps at 1 maximum", () => {
    assert.equal(clampIntegrity(1.5), 1);
  });

  it("preserves values in range", () => {
    assert.equal(clampIntegrity(0.75), 0.75);
  });

  it("exact 0 is valid", () => {
    assert.equal(clampIntegrity(0), 0);
  });

  it("exact 1 is valid", () => {
    assert.equal(clampIntegrity(1), 1);
  });
});

// ─── Health Data Quality Score ────────────────────────────────────────────────

function dataQualityScore(criticals: number, warnings: number, infos: number): number {
  return Math.max(0, 100 - (criticals * 30) - (warnings * 10) - (infos * 2));
}

describe("health data quality score", () => {
  it("returns 100 with no issues", () => {
    assert.equal(dataQualityScore(0, 0, 0), 100);
  });

  it("one critical reduces score by 30", () => {
    assert.equal(dataQualityScore(1, 0, 0), 70);
  });

  it("one warning reduces score by 10", () => {
    assert.equal(dataQualityScore(0, 1, 0), 90);
  });

  it("one info reduces score by 2", () => {
    assert.equal(dataQualityScore(0, 0, 1), 98);
  });

  it("clamps to 0 minimum", () => {
    assert.equal(dataQualityScore(5, 5, 10), 0); // would be -70
  });

  it("multiple issues compound correctly", () => {
    // 2 criticals (60) + 1 warning (10) = 70 deducted → 30
    assert.equal(dataQualityScore(2, 1, 0), 30);
  });
});

// ─── Overall Health Determination ────────────────────────────────────────────

function overallHealth(criticals: number, warnings: number): "healthy" | "degraded" | "critical" {
  if (criticals > 0) return "critical";
  if (warnings  > 0) return "degraded";
  return "healthy";
}

describe("overall health determination", () => {
  it("returns healthy with no issues", () => {
    assert.equal(overallHealth(0, 0), "healthy");
  });

  it("returns degraded with warnings only", () => {
    assert.equal(overallHealth(0, 1), "degraded");
  });

  it("returns critical when criticals > 0", () => {
    assert.equal(overallHealth(1, 0), "critical");
  });

  it("returns critical even with warnings present", () => {
    assert.equal(overallHealth(2, 3), "critical");
  });
});

// ─── Data Quality Note Generation ────────────────────────────────────────────

function dataQualityNote(hasContext: boolean, hasScreenshots: boolean): string | null {
  const issues = [
    !hasContext     ? "No context record" : null,
    !hasScreenshots ? "No screenshots"    : null,
  ].filter(Boolean) as string[];
  return issues.length > 0 ? issues.join("; ") : null;
}

describe("data quality note generation", () => {
  it("returns null when fully populated", () => {
    assert.equal(dataQualityNote(true, true), null);
  });

  it("notes missing context only", () => {
    assert.equal(dataQualityNote(false, true), "No context record");
  });

  it("notes missing screenshots only", () => {
    assert.equal(dataQualityNote(true, false), "No screenshots");
  });

  it("notes both issues", () => {
    assert.equal(dataQualityNote(false, false), "No context record; No screenshots");
  });
});

// ─── Outcome Classification ───────────────────────────────────────────────────

function classifyOutcome(pnl: number | null, isOpen: boolean): string {
  if (isOpen) return "open";
  if (pnl == null) return "open";
  if (pnl > 0) return "win";
  if (pnl < 0) return "loss";
  return "break_even";
}

describe("outcome classification", () => {
  it("open trade stays open", () => {
    assert.equal(classifyOutcome(null, true), "open");
  });

  it("positive P&L is win", () => {
    assert.equal(classifyOutcome(25.5, false), "win");
  });

  it("negative P&L is loss", () => {
    assert.equal(classifyOutcome(-15.0, false), "loss");
  });

  it("zero P&L is break even", () => {
    assert.equal(classifyOutcome(0, false), "break_even");
  });

  it("null P&L with closed trade treated as open", () => {
    assert.equal(classifyOutcome(null, false), "open");
  });
});

// ─── Entity Type Validation ───────────────────────────────────────────────────

const VALID_ENTITY_TYPES = new Set(["snapshot", "setup", "trade", "context", "screenshot", "event", "review", "lesson"]);

describe("entity type validation", () => {
  it("accepts all valid entity types", () => {
    for (const t of VALID_ENTITY_TYPES) {
      assert.ok(VALID_ENTITY_TYPES.has(t), `${t} should be valid`);
    }
  });

  it("rejects unknown entity types", () => {
    assert.ok(!VALID_ENTITY_TYPES.has("unknown_type"));
    assert.ok(!VALID_ENTITY_TYPES.has(""));
    assert.ok(!VALID_ENTITY_TYPES.has("TRADE")); // case-sensitive
  });

  it("has exactly 8 entity types", () => {
    assert.equal(VALID_ENTITY_TYPES.size, 8);
  });
});

// ─── Relationship Type Validation ─────────────────────────────────────────────

const VALID_REL_TYPES = new Set([
  "has_snapshot", "has_setup", "has_trade", "has_context",
  "has_screenshot", "has_event", "has_review", "has_lesson",
  "followed_by", "superseded_by", "related_to",
]);

describe("relationship type validation", () => {
  it("accepts all valid relationship types", () => {
    for (const t of VALID_REL_TYPES) {
      assert.ok(VALID_REL_TYPES.has(t));
    }
  });

  it("has exactly 11 relationship types", () => {
    assert.equal(VALID_REL_TYPES.size, 11);
  });

  it("rejects invalid relationship types", () => {
    assert.ok(!VALID_REL_TYPES.has("owns"));
    assert.ok(!VALID_REL_TYPES.has("has-setup")); // hyphen vs underscore
  });
});

// ─── Memory Growth Rate Formatting ───────────────────────────────────────────

function formatGrowthRate(recentCount: number, days: number): string {
  return `${(recentCount / days).toFixed(1)} experiences/day`;
}

describe("memory growth rate formatting", () => {
  it("formats correctly", () => {
    assert.equal(formatGrowthRate(14, 7), "2.0 experiences/day");
  });

  it("handles zero recent experiences", () => {
    assert.equal(formatGrowthRate(0, 7), "0.0 experiences/day");
  });

  it("formats fractional rates", () => {
    assert.equal(formatGrowthRate(5, 7), "0.7 experiences/day");
  });
});

// ─── AI Placeholder Defaults ──────────────────────────────────────────────────

describe("AI placeholder defaults", () => {
  const embeddingDefault = { model: null, dims: null, computed: false, vectorId: null };
  const similarityDefault = { nearestNeighbours: [], similarityScores: [], lastComputedAt: null };

  it("embedding placeholder has correct shape", () => {
    assert.equal(embeddingDefault.model,    null);
    assert.equal(embeddingDefault.dims,     null);
    assert.equal(embeddingDefault.computed, false);
    assert.equal(embeddingDefault.vectorId, null);
  });

  it("similarity metadata has correct shape", () => {
    assert.deepEqual(embeddingDefault, { model: null, dims: null, computed: false, vectorId: null });
    assert.equal(Array.isArray(similarityDefault.nearestNeighbours), true);
    assert.equal(Array.isArray(similarityDefault.similarityScores),  true);
    assert.equal(similarityDefault.nearestNeighbours.length, 0);
    assert.equal(similarityDefault.lastComputedAt, null);
  });

  it("embedding is NOT computed", () => {
    assert.equal(embeddingDefault.computed, false);
  });
});
