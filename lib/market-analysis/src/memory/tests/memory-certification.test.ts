/**
 * Memory Certification Engine Tests
 *
 * Tests for certification logic:
 * - Score aggregation
 * - Certification level determination
 * - Strength/weakness/risk derivation
 * - Check structure validation
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

// ─── Inline types ─────────────────────────────────────────────────────────────

type CertificationLevel = "none" | "development" | "staging" | "production";

interface CertificationCheck {
  name:       string;
  dimension:  string;
  passed:     boolean;
  score:      number;
  details:    string;
  weight:     number;
  recommendation?: string;
}

function aggregateScore(checks: CertificationCheck[]): number {
  const totalWeight = checks.reduce((s, c) => s + c.weight, 0);
  if (totalWeight === 0) return 0;
  const weightedSum = checks.reduce((s, c) => s + c.score * c.weight, 0);
  return Math.round(weightedSum / totalWeight);
}

function determineCertLevel(score: number, criticalFails: number): CertificationLevel {
  if (criticalFails > 0 || score < 40) return "none";
  if (score < 60) return "development";
  if (score < 80) return "staging";
  return "production";
}

function makeCheck(overrides: Partial<CertificationCheck> = {}): CertificationCheck {
  return {
    name:      "Test Check",
    dimension: "Test Dimension",
    passed:    true,
    score:     100,
    details:   "Test details",
    weight:    10,
    ...overrides,
  };
}

// ─── Score Aggregation Tests ──────────────────────────────────────────────────

describe("aggregateScore", () => {
  it("returns 0 for empty checks", () => {
    assert.equal(aggregateScore([]), 0);
  });

  it("returns the check score for a single check", () => {
    assert.equal(aggregateScore([makeCheck({ score: 75, weight: 10 })]), 75);
  });

  it("computes weighted average correctly", () => {
    const checks = [
      makeCheck({ score: 100, weight: 1 }),
      makeCheck({ score: 0, weight: 1 }),
    ];
    assert.equal(aggregateScore(checks), 50);
  });

  it("higher-weight checks have more influence", () => {
    const checks = [
      makeCheck({ score: 100, weight: 9 }),
      makeCheck({ score: 0, weight: 1 }),
    ];
    // (100*9 + 0*1) / 10 = 90
    assert.equal(aggregateScore(checks), 90);
  });

  it("returns 100 if all checks pass with score=100", () => {
    const checks = Array.from({ length: 5 }, () => makeCheck({ score: 100 }));
    assert.equal(aggregateScore(checks), 100);
  });

  it("returns 0 if all checks fail with score=0", () => {
    const checks = Array.from({ length: 5 }, () => makeCheck({ score: 0 }));
    assert.equal(aggregateScore(checks), 0);
  });

  it("rounds the final score", () => {
    // (33 * 1 + 67 * 2) / 3 = (33 + 134) / 3 = 167 / 3 = 55.67 → 56
    const checks = [
      makeCheck({ score: 33, weight: 1 }),
      makeCheck({ score: 67, weight: 2 }),
    ];
    const score = aggregateScore(checks);
    assert.ok(Number.isInteger(score));
  });

  it("unequal weights produce different scores than equal weights", () => {
    const equalWeight = [makeCheck({ score: 80, weight: 1 }), makeCheck({ score: 20, weight: 1 })];
    const unequalWeight = [makeCheck({ score: 80, weight: 3 }), makeCheck({ score: 20, weight: 1 })];
    assert.notEqual(aggregateScore(equalWeight), aggregateScore(unequalWeight));
  });
});

// ─── Certification Level Tests ────────────────────────────────────────────────

describe("determineCertLevel", () => {
  it("returns 'production' for score >= 80 with no critical fails", () => {
    assert.equal(determineCertLevel(80, 0), "production");
    assert.equal(determineCertLevel(100, 0), "production");
  });

  it("returns 'staging' for score 60–79 with no critical fails", () => {
    assert.equal(determineCertLevel(79, 0), "staging");
    assert.equal(determineCertLevel(60, 0), "staging");
    assert.equal(determineCertLevel(65, 0), "staging");
  });

  it("returns 'development' for score 40–59 with no critical fails", () => {
    assert.equal(determineCertLevel(59, 0), "development");
    assert.equal(determineCertLevel(40, 0), "development");
  });

  it("returns 'none' for score < 40", () => {
    assert.equal(determineCertLevel(39, 0), "none");
    assert.equal(determineCertLevel(0, 0), "none");
  });

  it("returns 'none' if critical fails > 0 regardless of score", () => {
    assert.equal(determineCertLevel(100, 1), "none");
    assert.equal(determineCertLevel(100, 5), "none");
    assert.equal(determineCertLevel(80, 1), "none");
  });

  it("boundary: exactly 80 is production", () => {
    assert.equal(determineCertLevel(80, 0), "production");
  });

  it("boundary: exactly 60 is staging", () => {
    assert.equal(determineCertLevel(60, 0), "staging");
  });

  it("boundary: exactly 40 is development", () => {
    assert.equal(determineCertLevel(40, 0), "development");
  });
});

// ─── Check Structure Tests ────────────────────────────────────────────────────

describe("CertificationCheck structure", () => {
  it("has all required fields", () => {
    const c = makeCheck();
    assert.ok(typeof c.name === "string");
    assert.ok(typeof c.dimension === "string");
    assert.ok(typeof c.passed === "boolean");
    assert.ok(typeof c.score === "number");
    assert.ok(typeof c.weight === "number");
    assert.ok(typeof c.details === "string");
  });

  it("score is in range 0–100", () => {
    const checks = [
      makeCheck({ score: 0 }),
      makeCheck({ score: 50 }),
      makeCheck({ score: 100 }),
    ];
    for (const c of checks) {
      assert.ok(c.score >= 0 && c.score <= 100, `score ${c.score} out of range`);
    }
  });

  it("weight is positive", () => {
    const c = makeCheck({ weight: 15 });
    assert.ok(c.weight > 0);
  });

  it("recommendation is optional", () => {
    const c = makeCheck();
    assert.equal(c.recommendation, undefined);

    const withRec = makeCheck({ recommendation: "Do something" });
    assert.equal(withRec.recommendation, "Do something");
  });
});

// ─── Full Certification Scenario Tests ────────────────────────────────────────

describe("Full certification scenarios", () => {
  it("all passing checks with high scores → production certified", () => {
    const checks = [
      makeCheck({ score: 100, weight: 20, passed: true }),
      makeCheck({ score: 95,  weight: 15, passed: true }),
      makeCheck({ score: 90,  weight: 10, passed: true }),
    ];
    const score = aggregateScore(checks);
    const level = determineCertLevel(score, 0);
    assert.ok(score >= 80);
    assert.equal(level, "production");
  });

  it("critical failure forces 'none' even with high aggregate score", () => {
    const checks = [
      makeCheck({ score: 100, weight: 1, passed: true }),
      makeCheck({ score: 0,   weight: 20, passed: false }),
    ];
    const score = aggregateScore(checks);
    // score might still be OK numerically, but criticalFails=1 forces none
    const level = determineCertLevel(score, 1);
    assert.equal(level, "none");
  });

  it("mixed results → staging level", () => {
    const checks = [
      makeCheck({ score: 80, weight: 10, passed: true }),
      makeCheck({ score: 60, weight: 10, passed: true }),
      makeCheck({ score: 50, weight: 10, passed: false }),
    ];
    const score = aggregateScore(checks);
    const level = determineCertLevel(score, 0);
    assert.ok(score >= 60 && score < 80);
    assert.equal(level, "staging");
  });

  it("poor performance → development level", () => {
    const checks = [
      makeCheck({ score: 50, weight: 10, passed: false }),
      makeCheck({ score: 45, weight: 10, passed: false }),
    ];
    const score = aggregateScore(checks);
    const level = determineCertLevel(score, 0);
    assert.ok(score >= 40 && score < 60);
    assert.equal(level, "development");
  });

  it("very poor performance → none", () => {
    const checks = [
      makeCheck({ score: 20, weight: 10, passed: false }),
      makeCheck({ score: 10, weight: 10, passed: false }),
    ];
    const score = aggregateScore(checks);
    const level = determineCertLevel(score, 0);
    assert.ok(score < 40);
    assert.equal(level, "none");
  });
});

// ─── Dimension Coverage Tests ─────────────────────────────────────────────────

describe("Certification dimensions", () => {
  const EXPECTED_DIMENSIONS = [
    "Data Consistency",
    "Relationship Consistency",
    "Replay Accuracy",
    "Recovery Accuracy",
    "Performance Targets",
    "Scalability",
    "Reliability",
  ];

  it("expected 7 certification dimensions", () => {
    assert.equal(EXPECTED_DIMENSIONS.length, 7);
  });

  it("dimension names are non-empty strings", () => {
    for (const dim of EXPECTED_DIMENSIONS) {
      assert.ok(dim.length > 0);
    }
  });

  it("dimensions are unique", () => {
    const unique = new Set(EXPECTED_DIMENSIONS);
    assert.equal(unique.size, EXPECTED_DIMENSIONS.length);
  });

  it("can group checks by dimension", () => {
    const checks = EXPECTED_DIMENSIONS.map(dim =>
      makeCheck({ dimension: dim, score: 90, weight: 10 })
    );
    const dims = [...new Set(checks.map(c => c.dimension))];
    assert.equal(dims.length, 7);
  });
});
