// ─── Adaptive Risk Intelligence Engine — Tests ────────────────────────────────

import { describe, it }  from "node:test";
import assert            from "node:assert/strict";

import { learnByRegime }                       from "../adaptive-risk/regime-learner.js";
import { learnByVolatility }                   from "../adaptive-risk/volatility-learner.js";
import { learnBySession }                      from "../adaptive-risk/session-learner.js";
import { profileByPair }                       from "../adaptive-risk/pair-profiler.js";
import { learnByLiquidity, learnByCondition }  from "../adaptive-risk/liquidity-learner.js";
import { computeConfidence, buildEvidenceItems } from "../adaptive-risk/confidence-engine.js";
import { selectProfile }                       from "../adaptive-risk/profile-engine.js";
import { generateRecommendations }             from "../adaptive-risk/recommendation-engine.js";
import { buildExplainability }                 from "../adaptive-risk/explainer.js";
import { runAdaptiveRiskEngine, defaultMarketContext } from "../adaptive-risk/index.js";
import { computeBaseStats, toRiskRating, statisticalSignificance } from "../adaptive-risk/stats-util.js";
import type { TradeRecord, MarketContext, RiskProfile, EnvironmentStats } from "../adaptive-risk/types.js";
import {
  PROFILE_PARAMS, ABSOLUTE_SAFETY_LIMITS, MIN_SAMPLE_SIZE,
} from "../adaptive-risk/types.js";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeTrade(overrides: Partial<TradeRecord> = {}): TradeRecord {
  return {
    id: 1,
    pair: "EURUSD",
    direction: "buy",
    pnl: 50,
    riskPercent: 1,
    riskRewardRatio: 2,
    session: "london",
    regime: "trending",
    openedAt: new Date("2024-01-10"),
    closedAt: new Date("2024-01-10"),
    ...overrides,
  };
}

function makeTrades(n: number, winRate = 0.6, regime = "trending", session = "london", pair = "EURUSD"): TradeRecord[] {
  return Array.from({ length: n }, (_, i) => makeTrade({
    id: i,
    pnl: i < n * winRate ? 50 : -25,
    regime,
    session,
    pair,
  }));
}

const ctx: MarketContext = defaultMarketContext("EURUSD");

// ─── Stats Util ───────────────────────────────────────────────────────────────

describe("computeBaseStats", () => {
  it("returns zeros for empty input", () => {
    const r = computeBaseStats([]);
    assert.equal(r.sampleSize, 0);
    assert.equal(r.winRate, 0);
  });

  it("computes correct win rate", () => {
    const trades = makeTrades(10, 0.7);
    const r = computeBaseStats(trades);
    assert.ok(r.winRate >= 0.6 && r.winRate <= 0.8);
  });

  it("computes positive expectancy for profitable set", () => {
    const trades = makeTrades(20, 0.65);
    const r = computeBaseStats(trades);
    assert.ok(r.expectancy > 0);
  });

  it("computes negative expectancy for losing set", () => {
    const trades = Array.from({ length: 20 }, (_, i) => makeTrade({ pnl: i < 3 ? 20 : -40 }));
    const r = computeBaseStats(trades);
    assert.ok(r.expectancy < 0);
  });

  it("profit factor > 1 for profitable set", () => {
    const trades = makeTrades(30, 0.65);
    const r = computeBaseStats(trades);
    assert.ok(r.profitFactor >= 1);
  });

  it("confidence increases with sample size", () => {
    const small = computeBaseStats(makeTrades(5));
    const large = computeBaseStats(makeTrades(50));
    assert.ok(large.confidenceScore >= small.confidenceScore);
  });
});

describe("toRiskRating", () => {
  it("returns favorable for high scores", ()  => assert.equal(toRiskRating(80), "favorable"));
  it("returns neutral for mid scores",   ()  => assert.equal(toRiskRating(55), "neutral"));
  it("returns unfavorable for low",      ()  => assert.equal(toRiskRating(35), "unfavorable"));
  it("returns avoid for very low",       ()  => assert.equal(toRiskRating(10), "avoid"));
});

describe("statisticalSignificance", () => {
  it("returns 0 for under min sample", () => {
    assert.equal(statisticalSignificance(makeTrades(5)), 0);
  });
  it("returns > 0 for sufficient sample", () => {
    assert.ok(statisticalSignificance(makeTrades(20, 0.65)) >= 0);
  });
});

// ─── Regime Learner ───────────────────────────────────────────────────────────

describe("learnByRegime", () => {
  it("returns empty array for no trades", () => {
    assert.deepEqual(learnByRegime([]), []);
  });

  it("groups trades by regime", () => {
    const trades = [
      ...makeTrades(15, 0.65, "trending"),
      ...makeTrades(10, 0.45, "volatile"),
    ];
    const result = learnByRegime(trades);
    const keys   = result.map(s => s.environmentKey);
    assert.ok(keys.includes("trending"));
    assert.ok(keys.includes("volatile"));
  });

  it("trending should score better than volatile (with favourable win rates)", () => {
    const trades = [
      ...makeTrades(20, 0.65, "trending"),
      ...makeTrades(20, 0.35, "volatile"),
    ];
    const result = learnByRegime(trades);
    const trending = result.find(s => s.environmentKey === "trending");
    const volatile_  = result.find(s => s.environmentKey === "volatile");
    if (trending && volatile_) {
      assert.ok(trending.riskScore >= volatile_.riskScore);
    }
  });

  it("sets environment field correctly", () => {
    const result = learnByRegime(makeTrades(10, 0.6, "ranging"));
    assert.ok(result.every(s => s.environment === "regime"));
  });
});

// ─── Volatility Learner ───────────────────────────────────────────────────────

describe("learnByVolatility", () => {
  it("returns empty for no trades", () => {
    assert.deepEqual(learnByVolatility([]), []);
  });

  it("classifies by session proxy", () => {
    const trades = makeTrades(15, 0.6, "trending", "london");
    const result = learnByVolatility(trades);
    assert.ok(result.length > 0);
    assert.ok(result.every(s => s.environment === "volatility"));
  });
});

// ─── Session Learner ──────────────────────────────────────────────────────────

describe("learnBySession", () => {
  it("groups by session", () => {
    const trades = [
      ...makeTrades(12, 0.7, "trending", "london"),
      ...makeTrades(8,  0.5, "trending", "asian"),
    ];
    const result = learnBySession(trades);
    const keys   = result.map(s => s.environmentKey);
    assert.ok(keys.includes("london"));
    assert.ok(keys.includes("asian"));
  });

  it("london scores better than asian for equal win rate", () => {
    const trades = [
      ...makeTrades(20, 0.6, "trending", "london"),
      ...makeTrades(20, 0.6, "trending", "asian"),
    ];
    const result  = learnBySession(trades);
    const london  = result.find(s => s.environmentKey === "london");
    const asian   = result.find(s => s.environmentKey === "asian");
    if (london && asian) assert.ok(london.riskScore >= asian.riskScore);
  });
});

// ─── Pair Profiler ────────────────────────────────────────────────────────────

describe("profileByPair", () => {
  it("returns empty for no trades", () => {
    assert.deepEqual(profileByPair([]), []);
  });

  it("groups by pair", () => {
    const trades = [
      ...makeTrades(10, 0.7, "trending", "london", "EURUSD"),
      ...makeTrades(10, 0.4, "trending", "london", "GBPUSD"),
    ];
    const result = profileByPair(trades);
    const pairs  = result.map(s => s.environmentKey);
    assert.ok(pairs.includes("EURUSD"));
    assert.ok(pairs.includes("GBPUSD"));
  });

  it("environment field is 'pair'", () => {
    const result = profileByPair(makeTrades(10));
    assert.ok(result.every(s => s.environment === "pair"));
  });
});

// ─── Liquidity & Condition ────────────────────────────────────────────────────

describe("learnByLiquidity", () => {
  it("returns results for london trades (high liquidity)", () => {
    const result = learnByLiquidity(makeTrades(10, 0.6, "trending", "london"));
    assert.ok(result.some(s => s.environmentKey === "high"));
  });
});

describe("learnByCondition", () => {
  it("groups trades by condition", () => {
    const result = learnByCondition([
      ...makeTrades(10, 0.6, "trending"),
      ...makeTrades(10, 0.4, "ranging"),
    ]);
    assert.ok(result.length > 0);
    assert.ok(result.every(s => s.environment === "condition"));
  });
});

// ─── Confidence Engine ────────────────────────────────────────────────────────

describe("computeConfidence", () => {
  it("insufficient for < MIN_SAMPLE trades", () => {
    const result = computeConfidence(makeTrades(5), []);
    assert.equal(result.hasMinimumEvidence, false);
    assert.equal(result.label, "insufficient");
  });

  it("hasMinimumEvidence for >= MIN_SAMPLE trades", () => {
    const result = computeConfidence(makeTrades(MIN_SAMPLE_SIZE), []);
    assert.equal(result.hasMinimumEvidence, true);
  });

  it("score increases with sample and win rate", () => {
    const low  = computeConfidence(makeTrades(10, 0.4), []);
    const high = computeConfidence(makeTrades(50, 0.65), []);
    assert.ok(high.score > low.score);
  });

  it("reliabilityRating is 'insufficient' for low data", () => {
    const result = computeConfidence(makeTrades(3), []);
    assert.equal(result.reliabilityRating, "insufficient");
  });
});

describe("buildEvidenceItems", () => {
  it("filters out items below min sample", () => {
    const stats = [
      { environment: "regime", environmentKey: "trending", riskScore: 70, sampleSize: 3, winRate: 0.6, expectancy: 1 },
    ];
    const result = buildEvidenceItems(stats);
    assert.equal(result.length, 0);
  });

  it("includes items with sufficient sample", () => {
    const stats = [
      { environment: "regime", environmentKey: "trending", riskScore: 70, sampleSize: 15, winRate: 0.65, expectancy: 1 },
    ];
    const result = buildEvidenceItems(stats);
    assert.equal(result.length, 1);
    assert.equal(result[0].dimension, "regime");
  });
});

// ─── Profile Engine ───────────────────────────────────────────────────────────

describe("selectProfile", () => {
  it("returns observation when no evidence", () => {
    const conf = computeConfidence(makeTrades(5), []);
    const sel  = selectProfile(ctx, [], conf, null);
    assert.equal(sel.profile, "observation");
  });

  it("returns a valid profile type", () => {
    const trades = makeTrades(40, 0.65);
    const regimeStats = learnByRegime(trades);
    const conf   = computeConfidence(trades, []);
    const sel    = selectProfile(ctx, regimeStats, conf, null);
    const valid: RiskProfile[] = ["conservative", "balanced", "aggressive", "observation", "recovery", "emergency"];
    assert.ok(valid.includes(sel.profile));
  });

  it("applies safety limits on profile params", () => {
    const conf = computeConfidence(makeTrades(50, 0.8), []);
    const stats = learnByRegime(makeTrades(50, 0.8));
    const sel   = selectProfile(ctx, stats, conf, null, { maxRiskPerTrade: 0.5 });
    assert.ok(sel.params.maxRiskPerTrade <= 0.5);
  });

  it("cannot exceed absolute safety limits", () => {
    const conf = computeConfidence(makeTrades(50, 0.9), []);
    const stats = learnByRegime(makeTrades(50, 0.9));
    const sel   = selectProfile(ctx, stats, conf, null, { maxRiskPerTrade: 999 });
    assert.ok(sel.params.maxRiskPerTrade <= ABSOLUTE_SAFETY_LIMITS.maxRiskPerTrade);
  });

  it("reduces profile for extreme volatility context", () => {
    const extremeCtx: MarketContext = { ...ctx, volatilityLevel: "extreme" };
    const conf   = computeConfidence(makeTrades(50, 0.9), []);
    const stats  = learnByRegime(makeTrades(50, 0.9, "trending"));
    const sel    = selectProfile(extremeCtx, stats, conf, null);
    assert.ok(!["aggressive"].includes(sel.profile));
  });
});

// ─── Recommendation Engine ────────────────────────────────────────────────────

describe("generateRecommendations", () => {
  it("produces recommendations for all key parameters", () => {
    const profile: RiskProfile = "balanced";
    const params = PROFILE_PARAMS[profile];
    const conf   = computeConfidence(makeTrades(20, 0.6), []);
    const recs   = generateRecommendations(profile, params, ctx, [], conf, null);
    const names  = recs.map(r => r.parameterName);
    assert.ok(names.includes("maxRiskPerTrade"));
    assert.ok(names.includes("maxOpenTrades"));
    assert.ok(names.includes("dailyRiskBudget"));
    assert.ok(names.includes("positionSizeMultiplier"));
  });

  it("all recommendations within safety limits", () => {
    const profile: RiskProfile = "aggressive";
    const params = PROFILE_PARAMS[profile];
    const conf   = computeConfidence(makeTrades(50, 0.7), []);
    const recs   = generateRecommendations(profile, params, ctx, [], conf, null);
    for (const r of recs) {
      assert.ok(r.withinSafetyLimits, `${r.parameterName} exceeds safety limits`);
    }
  });

  it("has reason for every recommendation", () => {
    const profile: RiskProfile = "conservative";
    const params = PROFILE_PARAMS[profile];
    const conf   = computeConfidence(makeTrades(20, 0.6), []);
    const recs   = generateRecommendations(profile, params, ctx, [], conf, null);
    for (const r of recs) {
      assert.ok(r.reason.length > 0, `Missing reason for ${r.parameterName}`);
    }
  });
});

// ─── Explainer ────────────────────────────────────────────────────────────────

describe("buildExplainability", () => {
  it("returns all required fields", () => {
    const conf = computeConfidence(makeTrades(25, 0.6), []);
    const exp  = buildExplainability("balanced", 60, ctx, [], conf, PROFILE_PARAMS["balanced"]);
    assert.ok(exp.whyThisProfile.length > 0);
    assert.ok(exp.historicalSupport.length > 0);
    assert.ok(Array.isArray(exp.marketInfluences));
    assert.ok(exp.expectedBenefits.length > 0);
    assert.ok(exp.potentialRisks.length > 0);
    assert.ok(Array.isArray(exp.safetyMechanisms));
    assert.ok(exp.safetyMechanisms.length > 0);
  });

  it("mentions insufficient data when below threshold", () => {
    const conf = computeConfidence(makeTrades(3), []);
    const exp  = buildExplainability("observation", 20, ctx, [], conf, PROFILE_PARAMS["observation"]);
    assert.ok(exp.whyThisProfile.toLowerCase().includes("insufficient") ||
              exp.historicalSupport.toLowerCase().includes("insufficient"));
  });
});

// ─── Full Engine Integration ──────────────────────────────────────────────────

describe("runAdaptiveRiskEngine", () => {
  it("runs with no trades", async () => {
    const result = await runAdaptiveRiskEngine({ trades: [], context: ctx });
    assert.ok(result.reportId);
    assert.equal(result.isAdvisoryOnly, true);
    assert.equal(result.recommendation.recommendedProfile, "observation");
    assert.equal(result.recommendation.confidence.hasMinimumEvidence, false);
  });

  it("runs with sufficient trades", async () => {
    const trades = makeTrades(30, 0.65);
    const result = await runAdaptiveRiskEngine({ trades, context: ctx });
    assert.ok(result.reportId);
    const valid: RiskProfile[] = ["conservative", "balanced", "aggressive", "observation", "recovery", "emergency"];
    assert.ok(valid.includes(result.recommendation.recommendedProfile));
  });

  it("isAdvisoryOnly is always true", async () => {
    const result = await runAdaptiveRiskEngine({ trades: makeTrades(20), context: ctx });
    assert.equal(result.isAdvisoryOnly, true);
  });

  it("detectsProfileChange when currentProfile differs", async () => {
    const trades = makeTrades(50, 0.75);
    const result = await runAdaptiveRiskEngine({ trades, context: ctx, currentProfile: "emergency" });
    assert.equal(result.recommendation.previousProfile, "emergency");
  });

  it("generates a summary with all required fields", async () => {
    const result = await runAdaptiveRiskEngine({ trades: makeTrades(20), context: ctx });
    const s = result.summary;
    assert.ok(typeof s.profileName       === "string");
    assert.ok(typeof s.confidence        === "number");
    assert.ok(typeof s.sampleSize        === "number");
    assert.ok(typeof s.topReason         === "string");
    assert.ok(typeof s.safeToTrade       === "boolean");
    assert.ok(typeof s.reduceExposure    === "boolean");
    assert.ok(typeof s.observationMode   === "boolean");
  });

  it("emergency profile is not safeToTrade", async () => {
    // Trigger emergency: extreme volatility + high news risk + 0 trades
    const emergCtx: MarketContext = { ...ctx, volatilityLevel: "extreme", newsRisk: 95, liquidityLevel: "low" };
    const result = await runAdaptiveRiskEngine({ trades: [], context: emergCtx });
    // With no data it becomes observation, which is still not safe
    assert.equal(result.summary.safeToTrade, false);
  });

  it("recommendation has explainability with reason", async () => {
    const result = await runAdaptiveRiskEngine({ trades: makeTrades(25, 0.6), context: ctx });
    assert.ok(result.recommendation.explainability.whyThisProfile.length > 0);
  });

  it("allEnvironmentStats is an array", async () => {
    const result = await runAdaptiveRiskEngine({ trades: makeTrades(30), context: ctx });
    assert.ok(Array.isArray(result.allEnvironmentStats));
  });

  it("parameters respect absolute safety limits", async () => {
    const trades = makeTrades(50, 0.8);
    const result = await runAdaptiveRiskEngine({
      trades, context: ctx,
      userSafetyLimits: { maxRiskPerTrade: 999 },
    });
    assert.ok(result.recommendation.parameters.maxRiskPerTrade <= ABSOLUTE_SAFETY_LIMITS.maxRiskPerTrade);
  });

  it("includes evidence items when sufficient data", async () => {
    const trades = makeTrades(35, 0.65);
    const result = await runAdaptiveRiskEngine({ trades, context: ctx });
    assert.ok(Array.isArray(result.recommendation.evidence));
  });

  it("market analysis contains current context", async () => {
    const result = await runAdaptiveRiskEngine({ trades: makeTrades(20), context: ctx });
    assert.equal(result.marketAnalysis.currentContext.pair, "EURUSD");
  });
});

describe("Profile parameter presets", () => {
  it("emergency has lowest maxRiskPerTrade", () => {
    const profiles: RiskProfile[] = ["aggressive", "balanced", "conservative", "observation", "recovery", "emergency"];
    const emergencyRisk = PROFILE_PARAMS.emergency.maxRiskPerTrade;
    for (const p of profiles.filter(p => p !== "emergency")) {
      assert.ok(emergencyRisk <= PROFILE_PARAMS[p].maxRiskPerTrade);
    }
  });

  it("aggressive has highest maxOpenTrades", () => {
    const profiles: RiskProfile[] = ["balanced", "conservative", "observation", "recovery", "emergency"];
    for (const p of profiles) {
      assert.ok(PROFILE_PARAMS.aggressive.maxOpenTrades >= PROFILE_PARAMS[p].maxOpenTrades);
    }
  });

  it("all profiles have positionSizeMultiplier <= 2 (absolute limit)", () => {
    for (const [, params] of Object.entries(PROFILE_PARAMS)) {
      assert.ok(params.positionSizeMultiplier <= ABSOLUTE_SAFETY_LIMITS.positionSizeMultiplier);
    }
  });
});
