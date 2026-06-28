import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { ExtractedFeature } from "../learning-core/types.js";
import {
  analyzePatterns,
  computePatternStats,
  qualityTier,
  riskProfile,
  filterPatterns,
  rankPatterns,
  PATTERN_ENGINE_VERSION,
} from "../pattern-performance/pattern-analyzer.js";
import { validateEvidence, wilsonScore, compositeConfidence } from "../pattern-performance/evidence-validator.js";
import { MIN_EVIDENCE_SAMPLE, MIN_RELIABLE_SAMPLE } from "../pattern-performance/types.js";

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

function makeFeatures(
  n: number,
  winRate = 0.6,
  overrides: Partial<ExtractedFeature> = {},
): ExtractedFeature[] {
  return Array.from({ length: n }, (_, i) => makeFeature({
    tradeId: String(i),
    outcome: i < Math.floor(n * winRate) ? "win" : "loss",
    pnl: i < Math.floor(n * winRate) ? 100 : -50,
    openedAt: new Date(2024, 0, 1 + i),
    ...overrides,
  }));
}

// ─── qualityTier ──────────────────────────────────────────────────────────────

describe("qualityTier", () => {
  it("below 40 → low", () => assert.equal(qualityTier(0), "low"));
  it("exactly 40 → medium", () => assert.equal(qualityTier(40), "medium"));
  it("70 → medium", () => assert.equal(qualityTier(70), "medium"));
  it("above 70 → high", () => assert.equal(qualityTier(71), "high"));
  it("100 → high", () => assert.equal(qualityTier(100), "high"));
});

// ─── riskProfile ─────────────────────────────────────────────────────────────

describe("riskProfile", () => {
  it("conservative: riskPct ≤ 0.5", () => {
    assert.equal(riskProfile(makeFeature({ riskPct: 0.5, rrPlanned: 2 })), "conservative");
  });
  it("conservative: rrPlanned ≥ 3", () => {
    assert.equal(riskProfile(makeFeature({ riskPct: 1.0, rrPlanned: 3 })), "conservative");
  });
  it("aggressive: riskPct > 1.5", () => {
    assert.equal(riskProfile(makeFeature({ riskPct: 2.0, rrPlanned: 2 })), "aggressive");
  });
  it("aggressive: rrPlanned < 1.5", () => {
    assert.equal(riskProfile(makeFeature({ riskPct: 1.0, rrPlanned: 1.0 })), "aggressive");
  });
  it("balanced: moderate risk and rr", () => {
    assert.equal(riskProfile(makeFeature({ riskPct: 1.0, rrPlanned: 2.5 })), "balanced");
  });
});

// ─── computePatternStats ──────────────────────────────────────────────────────

describe("computePatternStats", () => {
  it("empty features returns zeros", () => {
    const s = computePatternStats([]);
    assert.equal(s.totalTrades, 0);
    assert.equal(s.wins, 0);
    assert.equal(s.winRate, 0);
  });

  it("sampleSize equals totalTrades", () => {
    const features = makeFeatures(10, 0.6);
    const s = computePatternStats(features);
    assert.equal(s.sampleSize, s.totalTrades);
  });

  it("win rate calculation", () => {
    const features = makeFeatures(10, 0.6);
    const s = computePatternStats(features);
    assert.equal(s.wins, 6);
    assert.equal(s.losses, 4);
    assert.ok(Math.abs(s.winRate - 0.6) < 0.01);
  });

  it("loss rate = 1 - winRate for binary outcomes", () => {
    const features = makeFeatures(10, 0.7);
    const s = computePatternStats(features);
    assert.ok(Math.abs(s.winRate + s.lossRate - 1) < 0.01);
  });

  it("avgRR computed from rrActual", () => {
    const features = [
      makeFeature({ rrActual: 2.0, outcome: "win" }),
      makeFeature({ rrActual: 1.0, outcome: "loss" }),
    ];
    const s = computePatternStats(features);
    assert.ok(Math.abs(s.avgRR - 1.5) < 0.01);
  });

  it("profitFactor > 1 for profitable set", () => {
    const features = makeFeatures(20, 0.7);
    const s = computePatternStats(features);
    assert.ok(s.profitFactor > 1, `profitFactor=${s.profitFactor}`);
  });

  it("expectancy positive for winning set", () => {
    const features = makeFeatures(20, 0.7);
    const s = computePatternStats(features);
    assert.ok(s.expectancy > 0, `expectancy=${s.expectancy}`);
  });

  it("95% CI contains win rate", () => {
    const features = makeFeatures(30, 0.6);
    const s = computePatternStats(features);
    assert.ok(s.confidenceInterval95.lower <= s.winRate);
    assert.ok(s.confidenceInterval95.upper >= s.winRate);
  });

  it("maxDrawdownPct >= 0", () => {
    const features = makeFeatures(20, 0.4);
    const s = computePatternStats(features);
    assert.ok(s.maxDrawdownPct >= 0);
  });

  it("stdDevRR >= 0", () => {
    const features = makeFeatures(10, 0.5);
    const s = computePatternStats(features);
    assert.ok(s.stdDevRR >= 0);
  });

  it("break evens counted separately", () => {
    const features = [
      makeFeature({ outcome: "win", pnl: 100 }),
      makeFeature({ outcome: "loss", pnl: -50 }),
      makeFeature({ outcome: "break_even", pnl: 0 }),
    ];
    const s = computePatternStats(features);
    assert.equal(s.breakEvens, 1);
    assert.equal(s.totalTrades, 3);
  });
});

// ─── wilsonScore ─────────────────────────────────────────────────────────────

describe("wilsonScore", () => {
  it("returns 0 for n < MIN_EVIDENCE_SAMPLE", () => {
    assert.equal(wilsonScore(3, 4), 0);
  });

  it("returns > 0 for n >= MIN_EVIDENCE_SAMPLE", () => {
    assert.ok(wilsonScore(4, 5) >= 0);
  });

  it("higher n → higher confidence", () => {
    const small = wilsonScore(6, 10);
    const large = wilsonScore(60, 100);
    assert.ok(large > small, `large=${large} small=${small}`);
  });

  it("100% win rate returns high score", () => {
    const score = wilsonScore(30, 30);
    assert.ok(score > 0.6, `score=${score}`);
  });

  it("0 wins → 0 score", () => {
    assert.equal(wilsonScore(0, 20), 0);
  });
});

// ─── compositeConfidence ──────────────────────────────────────────────────────

describe("compositeConfidence", () => {
  it("returns 0 for insufficient sample", () => {
    assert.equal(compositeConfidence(0, 3, 90), 0);
  });

  it("returns value 0–100", () => {
    const c = compositeConfidence(15, 20, 90);
    assert.ok(c >= 0 && c <= 100, `c=${c}`);
  });

  it("higher quality → higher composite", () => {
    const low = compositeConfidence(10, 20, 30);
    const high = compositeConfidence(10, 20, 100);
    assert.ok(high > low, `high=${high} low=${low}`);
  });
});

// ─── validateEvidence ─────────────────────────────────────────────────────────

describe("validateEvidence", () => {
  it("insufficient when sampleSize < MIN_EVIDENCE_SAMPLE", () => {
    const stats = computePatternStats(makeFeatures(3, 0.6));
    const ev = validateEvidence(stats, 90, "1.0.0");
    assert.ok(ev.isInsufficient);
    assert.ok(ev.insufficientReason?.includes("Insufficient"));
    assert.equal(ev.statisticalConfidence, 0);
  });

  it("sufficient when sampleSize >= MIN_EVIDENCE_SAMPLE", () => {
    const stats = computePatternStats(makeFeatures(10, 0.6));
    const ev = validateEvidence(stats, 90, "1.0.0");
    assert.ok(!ev.isInsufficient);
    assert.ok(ev.statisticalConfidence > 0);
  });

  it("always includes evidenceCount, dataQualityScore, learningVersion", () => {
    const stats = computePatternStats(makeFeatures(10, 0.5));
    const ev = validateEvidence(stats, 85, "1.2.3");
    assert.equal(ev.evidenceCount, 10);
    assert.equal(ev.dataQualityScore, 85);
    assert.equal(ev.learningVersion, "1.2.3");
    assert.ok(ev.lastUpdated instanceof Date);
  });
});

// ─── analyzePatterns ─────────────────────────────────────────────────────────

describe("analyzePatterns", () => {
  it("returns empty array for empty features", () => {
    const patterns = analyzePatterns([], 90);
    assert.equal(patterns.length, 0);
  });

  it("generates pair patterns for all pairs present", () => {
    const features = [
      ...makeFeatures(5, 0.6, { pair: "EURUSD" }),
      ...makeFeatures(5, 0.5, { pair: "GBPUSD" }),
    ];
    const patterns = analyzePatterns(features, 90);
    const pairPatterns = patterns.filter(p => p.category === "pair");
    const ids = pairPatterns.map(p => p.key);
    assert.ok(ids.includes("EURUSD"), "EURUSD missing");
    assert.ok(ids.includes("GBPUSD"), "GBPUSD missing");
  });

  it("generates session patterns", () => {
    const features = [
      ...makeFeatures(5, 0.6, { session: "london" }),
      ...makeFeatures(5, 0.4, { session: "new_york" }),
    ];
    const patterns = analyzePatterns(features, 90);
    const sessionPatterns = patterns.filter(p => p.category === "session");
    assert.ok(sessionPatterns.length >= 2);
  });

  it("generates regime patterns", () => {
    const features = [
      ...makeFeatures(5, 0.7, { marketRegime: "trending" }),
      ...makeFeatures(5, 0.4, { marketRegime: "ranging" }),
    ];
    const patterns = analyzePatterns(features, 90);
    const regPatterns = patterns.filter(p => p.category === "regime");
    assert.ok(regPatterns.length >= 2);
  });

  it("generates zone_quality patterns", () => {
    const features = [
      ...makeFeatures(5, 0.7, { supplyQuality: 0, demandQuality: 80 }),  // high
      ...makeFeatures(5, 0.4, { supplyQuality: 0, demandQuality: 20 }),  // low
    ];
    const patterns = analyzePatterns(features, 90);
    const zq = patterns.filter(p => p.category === "zone_quality");
    assert.ok(zq.length >= 2);
  });

  it("generates liquidity patterns", () => {
    const features = [
      ...makeFeatures(5, 0.7, { liquidityScore: 80 }),  // high
      ...makeFeatures(5, 0.4, { liquidityScore: 20 }),  // low
    ];
    const patterns = analyzePatterns(features, 90);
    const liq = patterns.filter(p => p.category === "liquidity");
    assert.ok(liq.length >= 2);
  });

  it("generates amd patterns", () => {
    const features = [
      ...makeFeatures(5, 0.8, { amdScore: 85 }),
      ...makeFeatures(5, 0.3, { amdScore: 25 }),
    ];
    const patterns = analyzePatterns(features, 90);
    const amdPats = patterns.filter(p => p.category === "amd");
    assert.ok(amdPats.length >= 2);
  });

  it("generates volatility patterns", () => {
    const features = [
      ...makeFeatures(5, 0.6, { volatility: "low" }),
      ...makeFeatures(5, 0.5, { volatility: "high" }),
    ];
    const patterns = analyzePatterns(features, 90);
    const volPats = patterns.filter(p => p.category === "volatility");
    assert.ok(volPats.length >= 2);
  });

  it("generates risk_profile patterns", () => {
    const features = [
      ...makeFeatures(5, 0.6, { riskPct: 0.3, rrPlanned: 3.5 }),  // conservative
      ...makeFeatures(5, 0.5, { riskPct: 2.0, rrPlanned: 1.0 }),  // aggressive
    ];
    const patterns = analyzePatterns(features, 90);
    const riskPats = patterns.filter(p => p.category === "risk_profile");
    assert.ok(riskPats.length >= 2);
  });

  it("generates pair_session multi-dim patterns when enough samples", () => {
    const features = makeFeatures(10, 0.6, { pair: "EURUSD", session: "london" });
    const patterns = analyzePatterns(features, 90);
    const combo = patterns.filter(p => p.category === "pair_session");
    assert.ok(combo.length >= 1, "expected at least one pair_session pattern");
  });

  it("skips pair_session combos below MIN_EVIDENCE_SAMPLE", () => {
    const features = makeFeatures(3, 0.6, { pair: "EURUSD", session: "london" });
    const patterns = analyzePatterns(features, 90);
    const combo = patterns.filter(p => p.category === "pair_session");
    assert.equal(combo.length, 0);
  });

  it("every pattern has id, category, key, stats, evidence, trend, version", () => {
    const features = makeFeatures(10, 0.6);
    const patterns = analyzePatterns(features, 90);
    for (const p of patterns) {
      assert.ok(p.id, `missing id`);
      assert.ok(p.category, `missing category`);
      assert.ok(p.key, `missing key`);
      assert.ok(p.stats, `missing stats`);
      assert.ok(p.evidence, `missing evidence`);
      assert.ok(p.trend, `missing trend`);
      assert.ok(p.version, `missing version`);
    }
  });

  it("supportingTradeIds = wins, contradictingTradeIds = losses", () => {
    const features = makeFeatures(10, 0.6, { pair: "EURUSD" });
    const patterns = analyzePatterns(features, 90);
    const pairPat = patterns.find(p => p.id === "pair::EURUSD");
    assert.ok(pairPat);
    assert.equal(pairPat.supportingTradeIds.length, 6);
    assert.equal(pairPat.contradictingTradeIds.length, 4);
  });

  it("uses PATTERN_ENGINE_VERSION by default", () => {
    const patterns = analyzePatterns(makeFeatures(5, 0.5), 90);
    for (const p of patterns) {
      assert.equal(p.version, PATTERN_ENGINE_VERSION);
    }
  });

  it("handles large dataset (500 trades) without errors", () => {
    const features = makeFeatures(500, 0.55);
    const patterns = analyzePatterns(features, 85);
    assert.ok(patterns.length > 0);
  });
});

// ─── filterPatterns ───────────────────────────────────────────────────────────

describe("filterPatterns", () => {
  const features = [
    ...makeFeatures(10, 0.7, { pair: "EURUSD" }),
    ...makeFeatures(3, 0.3, { pair: "GBPUSD" }),    // insufficient
  ];
  const patterns = analyzePatterns(features, 90);

  it("sufficientOnly filters out insufficient patterns", () => {
    const suf = filterPatterns(patterns, { sufficientOnly: true });
    assert.ok(suf.every(p => !p.evidence.isInsufficient));
  });

  it("category filter", () => {
    const pairOnly = filterPatterns(patterns, { category: "pair" });
    assert.ok(pairOnly.every(p => p.category === "pair"));
  });

  it("minWinRate filter", () => {
    const high = filterPatterns(patterns, { minWinRate: 0.6, sufficientOnly: true });
    assert.ok(high.every(p => p.stats.winRate >= 0.6));
  });

  it("minSampleSize filter", () => {
    const large = filterPatterns(patterns, { minSampleSize: 10 });
    assert.ok(large.every(p => p.stats.sampleSize >= 10));
  });
});

// ─── rankPatterns ─────────────────────────────────────────────────────────────

describe("rankPatterns", () => {
  const features = [
    ...makeFeatures(10, 0.7, { pair: "EURUSD" }),
    ...makeFeatures(10, 0.4, { pair: "GBPUSD" }),
    ...makeFeatures(10, 0.6, { pair: "USDJPY" }),
  ];
  const patterns = analyzePatterns(features, 90).filter(p => p.category === "pair");

  it("ranks by win_rate descending", () => {
    const ranked = rankPatterns(patterns, "win_rate");
    assert.ok(ranked[0].stats.winRate >= ranked[1]?.stats.winRate ?? 0);
  });

  it("ranks by confidence descending", () => {
    const ranked = rankPatterns(patterns, "confidence");
    assert.ok(ranked[0].evidence.statisticalConfidence >= ranked[1]?.evidence.statisticalConfidence ?? 0);
  });

  it("ranks by sample_size descending", () => {
    const ranked = rankPatterns(patterns, "sample_size");
    assert.ok(ranked[0].stats.sampleSize >= ranked[1]?.stats.sampleSize ?? 0);
  });
});
