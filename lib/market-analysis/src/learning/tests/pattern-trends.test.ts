import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { ExtractedFeature } from "../learning-core/types.js";
import { analyzeTrend } from "../pattern-performance/trend-analyzer.js";
import { generatePatternReport } from "../pattern-performance/report-generator.js";
import { PatternStore } from "../pattern-performance/pattern-store.js";
import { analyzePatterns } from "../pattern-performance/pattern-analyzer.js";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeFeature(overrides: Partial<ExtractedFeature> = {}): ExtractedFeature {
  return {
    tradeId: String(Math.floor(Math.random() * 99999)),
    pair: "EURUSD",
    session: "london",
    trend: "bullish",
    marketRegime: "trending",
    supplyQuality: 0,
    demandQuality: 75,
    liquidityScore: 65,
    amdScore: 70,
    confirmationQuality: 72,
    tradeDurationMins: 90,
    spreadPips: 1.2,
    volatility: "medium",
    riskPct: 1.0,
    rrPlanned: 2.5,
    rrActual: 2.1,
    outcome: "win",
    pnl: 100,
    pnlPercent: 1.0,
    setupScore: 75,
    confidence: 72,
    tqi: 70,
    openedAt: new Date("2024-01-15T09:00:00Z"),
    closedAt: new Date("2024-01-15T10:30:00Z"),
    ...overrides,
  };
}

function olderFeatures(n: number, outcome: "win" | "loss", startDate: Date): ExtractedFeature[] {
  return Array.from({ length: n }, (_, i) => makeFeature({
    tradeId: `old_${i}`,
    outcome,
    pnl: outcome === "win" ? 100 : -50,
    openedAt: new Date(startDate.getTime() - (n - i) * 86400000),
  }));
}

function recentFeatures(n: number, outcome: "win" | "loss", startDate: Date): ExtractedFeature[] {
  return Array.from({ length: n }, (_, i) => makeFeature({
    tradeId: `recent_${i}`,
    outcome,
    pnl: outcome === "win" ? 100 : -50,
    openedAt: new Date(startDate.getTime() + i * 86400000),
  }));
}

// ─── analyzeTrend ─────────────────────────────────────────────────────────────

describe("analyzeTrend", () => {
  it("returns insufficient_data for empty features", () => {
    const t = analyzeTrend([]);
    assert.equal(t.direction, "insufficient_data");
    assert.ok(t.explanation.length > 0);
  });

  it("returns insufficient_data when < MIN_EVIDENCE_SAMPLE in last 30", () => {
    const features = Array.from({ length: 3 }, (_, i) =>
      makeFeature({ tradeId: String(i), openedAt: new Date(2024, 0, i + 1) }),
    );
    const t = analyzeTrend(features);
    assert.equal(t.direction, "insufficient_data");
    assert.equal(t.last30, null);
  });

  it("detects improving trend", () => {
    const baseDate = new Date("2024-01-01");
    // Old 70 trades: 50% win rate
    const old = olderFeatures(35, "win", baseDate).concat(olderFeatures(35, "loss", baseDate));
    // Recent 30: 80% win rate
    const recent = recentFeatures(24, "win", new Date("2024-03-15")).concat(
      recentFeatures(6, "loss", new Date("2024-04-15")),
    );
    const features = [...old, ...recent];
    const t = analyzeTrend(features);
    assert.equal(t.direction, "improving", `expected improving, got ${t.direction} (${t.explanation})`);
    assert.ok(t.directionConfidence > 0);
  });

  it("detects declining trend", () => {
    const baseDate = new Date("2024-01-01");
    // Old 70 trades: 80% win rate
    const old = olderFeatures(56, "win", baseDate).concat(olderFeatures(14, "loss", baseDate));
    // Recent 30: 30% win rate
    const recent = recentFeatures(9, "win", new Date("2024-03-15")).concat(
      recentFeatures(21, "loss", new Date("2024-04-15")),
    );
    const features = [...old, ...recent];
    const t = analyzeTrend(features);
    assert.equal(t.direction, "declining", `expected declining, got ${t.direction}`);
  });

  it("detects stable trend", () => {
    // 100 trades all ~60% win rate
    const features = Array.from({ length: 100 }, (_, i) => makeFeature({
      tradeId: String(i),
      outcome: i % 10 < 6 ? "win" : "loss",
      pnl: i % 10 < 6 ? 100 : -50,
      openedAt: new Date(2024, 0, i + 1),
    }));
    const t = analyzeTrend(features);
    assert.equal(t.direction, "stable", `expected stable, got ${t.direction}`);
  });

  it("last30 stats present when sufficient", () => {
    const features = Array.from({ length: 50 }, (_, i) => makeFeature({
      tradeId: String(i),
      outcome: "win",
      pnl: 100,
      openedAt: new Date(2024, 0, i + 1),
    }));
    const t = analyzeTrend(features);
    assert.ok(t.last30 !== null, "last30 should not be null");
    assert.ok(t.last30!.sampleSize <= 30);
  });

  it("last100 stats present when sufficient", () => {
    const features = Array.from({ length: 120 }, (_, i) => makeFeature({
      tradeId: String(i),
      outcome: i % 2 === 0 ? "win" : "loss",
      pnl: i % 2 === 0 ? 100 : -50,
      openedAt: new Date(2024, 0, i + 1),
    }));
    const t = analyzeTrend(features);
    assert.ok(t.last100 !== null, "last100 should not be null");
    assert.ok(t.last100!.sampleSize <= 100);
  });

  it("last500 stats respect window", () => {
    const features = Array.from({ length: 600 }, (_, i) => makeFeature({
      tradeId: String(i),
      outcome: "win",
      pnl: 100,
      openedAt: new Date(2024, 0, i + 1),
    }));
    const t = analyzeTrend(features);
    assert.ok(t.last500 !== null);
    assert.ok(t.last500!.sampleSize <= 500);
  });

  it("always includes explanation string", () => {
    const t1 = analyzeTrend([]);
    const t2 = analyzeTrend(Array.from({ length: 50 }, (_, i) => makeFeature({ tradeId: String(i), openedAt: new Date(2024, 0, i + 1) })));
    assert.ok(typeof t1.explanation === "string" && t1.explanation.length > 0);
    assert.ok(typeof t2.explanation === "string" && t2.explanation.length > 0);
  });
});

// ─── PatternStore ─────────────────────────────────────────────────────────────

describe("PatternStore", () => {
  function makeStore() {
    const store = new PatternStore();
    const features = [
      ...Array.from({ length: 10 }, (_, i) => makeFeature({ tradeId: `eu_${i}`, pair: "EURUSD", outcome: i < 8 ? "win" : "loss", pnl: i < 8 ? 100 : -50, openedAt: new Date(2024, 0, i + 1) })),
      ...Array.from({ length: 10 }, (_, i) => makeFeature({ tradeId: `gb_${i}`, pair: "GBPUSD", outcome: i < 4 ? "win" : "loss", pnl: i < 4 ? 100 : -50, openedAt: new Date(2024, 0, i + 1) })),
    ];
    const patterns = analyzePatterns(features, 85);
    store.upsert(patterns);
    return store;
  }

  it("count() reflects upserted patterns", () => {
    const store = makeStore();
    assert.ok(store.count() > 0);
  });

  it("getById returns correct pattern", () => {
    const store = makeStore();
    const p = store.getById("pair::EURUSD");
    assert.ok(p !== null, "EURUSD pattern not found");
    assert.equal(p!.key, "EURUSD");
  });

  it("getById returns null for unknown id", () => {
    const store = makeStore();
    assert.equal(store.getById("pair::FAKEPAIR"), null);
  });

  it("list() returns all patterns by default", () => {
    const store = makeStore();
    assert.equal(store.list().length, store.count());
  });

  it("list with category filter", () => {
    const store = makeStore();
    const pairPats = store.byCategory("pair");
    assert.ok(pairPats.every(p => p.category === "pair"));
  });

  it("sufficientCount() <= count()", () => {
    const store = makeStore();
    assert.ok(store.sufficientCount() <= store.count());
  });

  it("topByWinRate returns sorted descending", () => {
    const store = makeStore();
    const top = store.topByWinRate(5);
    for (let i = 0; i < top.length - 1; i++) {
      assert.ok(top[i].stats.winRate >= top[i + 1].stats.winRate);
    }
  });

  it("bottomByWinRate returns sorted ascending", () => {
    const store = makeStore();
    const bottom = store.bottomByWinRate(5);
    for (let i = 0; i < bottom.length - 1; i++) {
      assert.ok(bottom[i].stats.winRate <= bottom[i + 1].stats.winRate);
    }
  });

  it("topByConfidence sorted descending", () => {
    const store = makeStore();
    const top = store.topByConfidence(5);
    for (let i = 0; i < top.length - 1; i++) {
      assert.ok(top[i].evidence.statisticalConfidence >= top[i + 1].evidence.statisticalConfidence);
    }
  });

  it("upsert replaces existing pattern", () => {
    const store = makeStore();
    const before = store.count();
    // Upsert same patterns again — count should not grow
    const features = Array.from({ length: 10 }, (_, i) => makeFeature({ tradeId: String(i), pair: "EURUSD", outcome: "win", pnl: 100, openedAt: new Date(2024, 0, i + 1) }));
    store.upsert(analyzePatterns(features, 90));
    assert.equal(store.count(), before); // same pattern IDs replaced
  });

  it("clear() empties the store", () => {
    const store = makeStore();
    store.clear();
    assert.equal(store.count(), 0);
  });
});

// ─── generatePatternReport ────────────────────────────────────────────────────

describe("generatePatternReport", () => {
  function buildPatterns() {
    const features = Array.from({ length: 50 }, (_, i) => makeFeature({
      tradeId: String(i),
      pair: i % 3 === 0 ? "GBPUSD" : i % 3 === 1 ? "USDJPY" : "EURUSD",
      session: i % 2 === 0 ? "london" : "new_york",
      marketRegime: i % 2 === 0 ? "trending" : "ranging",
      outcome: i < 35 ? "win" : "loss",
      pnl: i < 35 ? 100 : -50,
      openedAt: new Date(2024, 0, i + 1),
    }));
    return analyzePatterns(features, 85);
  }

  it("returns a report with correct structure", () => {
    const patterns = buildPatterns();
    const report = generatePatternReport(patterns, "1.0.0");
    assert.ok(report.generatedAt instanceof Date);
    assert.equal(report.version, "1.0.0");
    assert.ok(typeof report.totalPatterns === "number");
    assert.ok(typeof report.sufficientPatterns === "number");
    assert.ok(Array.isArray(report.bestByWinRate));
    assert.ok(Array.isArray(report.worstByWinRate));
    assert.ok(Array.isArray(report.bestSessions));
    assert.ok(Array.isArray(report.worstSessions));
    assert.ok(Array.isArray(report.bestRegimes));
    assert.ok(Array.isArray(report.worstRegimes));
    assert.ok(Array.isArray(report.highestConfidence));
    assert.ok(Array.isArray(report.lowestConfidence));
    assert.ok(Array.isArray(report.significantPatterns));
    assert.ok(Array.isArray(report.recommendations));
    assert.ok(typeof report.markdownContent === "string");
  });

  it("sufficientPatterns <= totalPatterns", () => {
    const report = generatePatternReport(buildPatterns(), "1.0.0");
    assert.ok(report.sufficientPatterns <= report.totalPatterns);
  });

  it("markdown includes required sections", () => {
    const report = generatePatternReport(buildPatterns(), "1.0.0");
    assert.ok(report.markdownContent.includes("PATTERN PERFORMANCE REPORT"));
    assert.ok(report.markdownContent.includes("Best Performing Patterns"));
    assert.ok(report.markdownContent.includes("Session Performance"));
    assert.ok(report.markdownContent.includes("Regime Performance"));
    assert.ok(report.markdownContent.includes("Confidence Analysis"));
    assert.ok(report.markdownContent.includes("Statistical Significance"));
    assert.ok(report.markdownContent.includes("Recommendations"));
    assert.ok(report.markdownContent.includes("Advisory"));
  });

  it("empty patterns returns empty report without error", () => {
    const report = generatePatternReport([], "1.0.0");
    assert.equal(report.totalPatterns, 0);
    assert.equal(report.sufficientPatterns, 0);
    assert.ok(typeof report.markdownContent === "string");
  });

  it("recommendations capped at 10", () => {
    const report = generatePatternReport(buildPatterns(), "1.0.0");
    assert.ok(report.recommendations.length <= 10);
  });

  it("bestByWinRate sorted descending", () => {
    const report = generatePatternReport(buildPatterns(), "1.0.0");
    const top = report.bestByWinRate;
    for (let i = 0; i < top.length - 1; i++) {
      assert.ok(top[i].stats.winRate >= top[i + 1].stats.winRate);
    }
  });

  it("worstByWinRate sorted ascending", () => {
    const report = generatePatternReport(buildPatterns(), "1.0.0");
    const worst = report.worstByWinRate;
    for (let i = 0; i < worst.length - 1; i++) {
      assert.ok(worst[i].stats.winRate <= worst[i + 1].stats.winRate);
    }
  });
});
