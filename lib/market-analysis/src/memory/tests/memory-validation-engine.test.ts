/**
 * Memory Validation Engine Tests
 *
 * Tests for the comprehensive validation engine logic:
 * - Health score computation
 * - Overall health classification
 * - Finding severity classification
 * - Recommendation generation
 * - Report structure validation
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

// ─── Inline implementations (mirrors memory-validation-engine logic) ──────────

type Severity = "critical" | "warning" | "info";

interface Finding {
  id: string;
  severity: Severity;
  category: string;
  check: string;
  message: string;
  count: number;
  repaired: boolean;
}

function computeHealthScore(findings: Finding[]): number {
  const criticals = findings.filter(f => f.severity === "critical").length;
  const warnings  = findings.filter(f => f.severity === "warning").length;
  const infos     = findings.filter(f => f.severity === "info").length;
  const deduction = (criticals * 25) + (warnings * 8) + (infos * 2);
  return Math.max(0, Math.min(100, 100 - deduction));
}

function computeOverallHealth(score: number): "healthy" | "degraded" | "critical" {
  if (score >= 80) return "healthy";
  if (score >= 50) return "degraded";
  return "critical";
}

function buildRecommendations(findings: Finding[]): string[] {
  const recs: string[] = [];
  if (findings.some(f => f.severity === "critical" && f.category === "Duplicate Detection")) {
    recs.push("URGENT: Remove duplicate experience records immediately");
  }
  if (findings.some(f => f.severity === "critical" && f.category === "Trade Outcomes")) {
    recs.push("URGENT: Resolve win/loss PnL mismatches");
  }
  if (findings.some(f => f.severity === "critical" && f.category === "Timestamp Validity")) {
    recs.push("URGENT: Fix reversed timestamps");
  }
  if (findings.some(f => f.category === "Referential Integrity")) {
    recs.push("Run /memory/health/repair to fix broken relationship links automatically");
  }
  if (recs.length === 0) {
    recs.push("Memory system is passing all integrity checks — continue normal operation");
  }
  return recs;
}

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: "TEST-001",
    severity: "info",
    category: "Test Category",
    check: "Test Check",
    message: "Test message",
    count: 1,
    repaired: false,
    ...overrides,
  };
}

// ─── Health Score Tests ────────────────────────────────────────────────────────

describe("computeHealthScore", () => {
  it("returns 100 for no findings", () => {
    assert.equal(computeHealthScore([]), 100);
  });

  it("deducts 25 per critical finding", () => {
    const findings = [makeFinding({ severity: "critical" }), makeFinding({ severity: "critical" })];
    assert.equal(computeHealthScore(findings), 50);
  });

  it("deducts 8 per warning finding", () => {
    const findings = [makeFinding({ severity: "warning" })];
    assert.equal(computeHealthScore(findings), 92);
  });

  it("deducts 2 per info finding", () => {
    const findings = [makeFinding({ severity: "info" })];
    assert.equal(computeHealthScore(findings), 98);
  });

  it("never goes below 0", () => {
    const findings = Array.from({ length: 10 }, () => makeFinding({ severity: "critical" }));
    assert.equal(computeHealthScore(findings), 0);
  });

  it("never goes above 100", () => {
    assert.equal(computeHealthScore([]), 100);
  });

  it("combines all severities correctly", () => {
    const findings = [
      makeFinding({ severity: "critical" }),  // -25
      makeFinding({ severity: "warning" }),   // -8
      makeFinding({ severity: "info" }),      // -2
    ];
    assert.equal(computeHealthScore(findings), 65);
  });
});

// ─── Overall Health Tests ──────────────────────────────────────────────────────

describe("computeOverallHealth", () => {
  it("returns 'healthy' for score >= 80", () => {
    assert.equal(computeOverallHealth(100), "healthy");
    assert.equal(computeOverallHealth(80), "healthy");
  });

  it("returns 'degraded' for score 50–79", () => {
    assert.equal(computeOverallHealth(79), "degraded");
    assert.equal(computeOverallHealth(65), "degraded");
    assert.equal(computeOverallHealth(50), "degraded");
  });

  it("returns 'critical' for score < 50", () => {
    assert.equal(computeOverallHealth(49), "critical");
    assert.equal(computeOverallHealth(0), "critical");
  });

  it("boundary: exactly 80 is healthy", () => {
    assert.equal(computeOverallHealth(80), "healthy");
  });

  it("boundary: exactly 50 is degraded", () => {
    assert.equal(computeOverallHealth(50), "degraded");
  });
});

// ─── Recommendations Tests ────────────────────────────────────────────────────

describe("buildRecommendations", () => {
  it("returns generic recommendation for empty findings", () => {
    const recs = buildRecommendations([]);
    assert.ok(recs.length > 0);
    assert.ok(recs[0]!.includes("passing all integrity checks"));
  });

  it("flags duplicate critical as URGENT", () => {
    const findings = [makeFinding({ severity: "critical", category: "Duplicate Detection" })];
    const recs = buildRecommendations(findings);
    assert.ok(recs.some(r => r.includes("URGENT") && r.includes("duplicate")));
  });

  it("flags outcome mismatch as URGENT", () => {
    const findings = [makeFinding({ severity: "critical", category: "Trade Outcomes" })];
    const recs = buildRecommendations(findings);
    assert.ok(recs.some(r => r.includes("URGENT") && r.includes("PnL")));
  });

  it("flags timestamp reversal as URGENT", () => {
    const findings = [makeFinding({ severity: "critical", category: "Timestamp Validity" })];
    const recs = buildRecommendations(findings);
    assert.ok(recs.some(r => r.includes("URGENT") && r.includes("timestamps")));
  });

  it("recommends repair for referential integrity findings", () => {
    const findings = [makeFinding({ category: "Referential Integrity" })];
    const recs = buildRecommendations(findings);
    assert.ok(recs.some(r => r.includes("health/repair")));
  });

  it("can produce multiple recommendations", () => {
    const findings = [
      makeFinding({ severity: "critical", category: "Duplicate Detection" }),
      makeFinding({ severity: "critical", category: "Trade Outcomes" }),
      makeFinding({ category: "Referential Integrity" }),
    ];
    const recs = buildRecommendations(findings);
    assert.ok(recs.length >= 3);
  });
});

// ─── Finding Structure Tests ──────────────────────────────────────────────────

describe("Finding structure", () => {
  it("has required fields", () => {
    const f = makeFinding();
    assert.ok(typeof f.id === "string");
    assert.ok(["critical", "warning", "info"].includes(f.severity));
    assert.ok(typeof f.category === "string");
    assert.ok(typeof f.check === "string");
    assert.ok(typeof f.message === "string");
    assert.ok(typeof f.count === "number");
    assert.ok(typeof f.repaired === "boolean");
  });

  it("defaults repaired to false", () => {
    const f = makeFinding();
    assert.equal(f.repaired, false);
  });

  it("count must be >= 0", () => {
    const f = makeFinding({ count: 0 });
    assert.ok(f.count >= 0);
  });
});

// ─── Compound Score Scenarios ──────────────────────────────────────────────────

describe("Compound validation scenarios", () => {
  it("clean system: no findings → score=100, healthy", () => {
    const score  = computeHealthScore([]);
    const health = computeOverallHealth(score);
    assert.equal(score, 100);
    assert.equal(health, "healthy");
  });

  it("single critical finding → score=75, degraded (below 80 threshold)", () => {
    const findings = [makeFinding({ severity: "critical" })];
    const score    = computeHealthScore(findings);
    assert.equal(score, 75);
    assert.equal(computeOverallHealth(score), "degraded");
  });

  it("two critical findings → score=50, degraded", () => {
    const findings = [makeFinding({ severity: "critical" }), makeFinding({ severity: "critical" })];
    const score    = computeHealthScore(findings);
    assert.equal(score, 50);
    assert.equal(computeOverallHealth(score), "degraded");
  });

  it("three criticals → score=25, critical", () => {
    const findings = Array.from({ length: 3 }, () => makeFinding({ severity: "critical" }));
    const score    = computeHealthScore(findings);
    assert.equal(score, 25);
    assert.equal(computeOverallHealth(score), "critical");
  });

  it("five warnings → score=60, degraded", () => {
    const findings = Array.from({ length: 5 }, () => makeFinding({ severity: "warning" }));
    const score    = computeHealthScore(findings);
    assert.equal(score, 60);
    assert.equal(computeOverallHealth(score), "degraded");
  });

  it("ten infos → score=80, exactly healthy", () => {
    const findings = Array.from({ length: 10 }, () => makeFinding({ severity: "info" }));
    const score    = computeHealthScore(findings);
    assert.equal(score, 80);
    assert.equal(computeOverallHealth(score), "healthy");
  });

  it("eleven infos → score=78, degraded", () => {
    const findings = Array.from({ length: 11 }, () => makeFinding({ severity: "info" }));
    const score    = computeHealthScore(findings);
    assert.equal(score, 78);
    assert.equal(computeOverallHealth(score), "degraded");
  });
});

// ─── Edge Cases ───────────────────────────────────────────────────────────────

describe("Edge cases", () => {
  it("mixed findings: critical + warnings + infos", () => {
    const findings = [
      makeFinding({ severity: "critical" }),   // -25
      makeFinding({ severity: "warning" }),    // -8
      makeFinding({ severity: "warning" }),    // -8
      makeFinding({ severity: "info" }),       // -2
      makeFinding({ severity: "info" }),       // -2
      makeFinding({ severity: "info" }),       // -2
    ];
    const score = computeHealthScore(findings);
    assert.equal(score, 100 - 25 - 8 - 8 - 2 - 2 - 2); // 53
    assert.equal(computeOverallHealth(score), "degraded");
  });

  it("finding count = 0 is valid (structural finding)", () => {
    const f = makeFinding({ count: 0 });
    assert.ok(f.count >= 0);
  });

  it("large count doesn't affect score (score is based on finding count not record count)", () => {
    const f1 = makeFinding({ severity: "critical", count: 1000 });
    const f2 = makeFinding({ severity: "critical", count: 1 });
    assert.equal(computeHealthScore([f1]), computeHealthScore([f2]));
  });
});
