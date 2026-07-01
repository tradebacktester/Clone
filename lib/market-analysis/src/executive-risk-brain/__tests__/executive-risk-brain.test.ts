// ─── Executive Risk Brain — Test Suite ────────────────────────────────────────
// Comprehensive tests covering: ERO generation, score calculations,
// recommendation engine, crisis integration, recovery workflows, APIs,
// explainability, certification.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  runExecutiveRiskBrain,
  runErbCertification,
  computeAllScores,
  scoreToRecommendation,
  buildRecommendationDetail,
  buildExplainability,
  defaultAccount,
  defaultPortfolio,
  defaultMarket,
  defaultBroker,
  defaultInfra,
  defaultAdaptive,
  defaultCrisis,
  buildAccountIntelligence,
  buildPortfolioIntelligence,
  buildMarketIntelligence,
  buildBrokerIntelligence,
  buildInfraIntelligence,
  buildAdaptiveIntelligence,
  buildCrisisIntelligence,
  buildHistoricalComparison,
  ERB_ENGINE_VERSION,
} from "../index.js";
import {
  clamp,
  scoreAccountHealth,
  scorePositionSafety,
  scorePortfolioStability,
  scoreMarketSafety,
  scoreBrokerReliability,
  scoreSystemHealth,
  scoreCrisisSafety,
  scoreAdaptiveAlignment,
  computeSurvivalScore,
  computeCapitalHealthScore,
} from "../scorer.js";
import {
  identifyTriggeringMetrics,
  identifyActiveProtections,
  identifyTopContributor,
  computeConfidenceInterval,
  computeReliabilityRating,
} from "../explainer.js";
import type { ErbScoreBreakdown } from "../types.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeBreakdown(overrides: Partial<ErbScoreBreakdown> = {}): ErbScoreBreakdown {
  const dim = (v: number) => ({ raw: v, weighted: v * 0.125, weight: 0.125, label: "", calculation: "" });
  return {
    accountHealth:      dim(20),
    positionRisk:       dim(15),
    portfolioStability: dim(25),
    marketRisk:         dim(30),
    brokerReliability:  dim(10),
    systemHealth:       dim(20),
    crisisScore:        dim(0),
    adaptiveRisk:       dim(15),
    total: 17,
    ...overrides,
  };
}

// ─── Section 1: Clamp utility ─────────────────────────────────────────────────

describe("clamp utility", () => {
  it("clamps below lower bound", () => assert.equal(clamp(-10), 0));
  it("clamps above upper bound", () => assert.equal(clamp(110), 100));
  it("passes through mid value", () => assert.equal(clamp(50), 50));
  it("handles NaN → 0", () => assert.equal(clamp(NaN), 0));
  it("handles Infinity → 100", () => assert.equal(clamp(Infinity), 100));
});

// ─── Section 2: Individual scorers ────────────────────────────────────────────

describe("scoreAccountHealth", () => {
  it("returns accountHealthScore directly", () => {
    const a = { ...defaultAccount(), accountHealthScore: 75 };
    assert.equal(scoreAccountHealth(a), 75);
  });
  it("clamps to 100 max", () => {
    const a = { ...defaultAccount(), accountHealthScore: 110 };
    assert.equal(scoreAccountHealth(a), 100);
  });
});

describe("scorePositionSafety", () => {
  it("returns 70 when no position", () => {
    assert.equal(scorePositionSafety(null), 70);
  });
  it("inverts positionRiskScore", () => {
    const p = { positionSize: 0.1, riskPct: 1, stopDistance: 20, expectedRR: 2, positionExposure: 10000, positionRiskScore: 30 };
    assert.equal(scorePositionSafety(p), 70);
  });
});

describe("scorePortfolioStability", () => {
  it("inverts portfolioRiskScore", () => {
    const pf = { ...defaultPortfolio(), portfolioRiskScore: 40 };
    assert.equal(scorePortfolioStability(pf), 60);
  });
});

describe("scoreMarketSafety", () => {
  it("produces a value 0-100", () => {
    const m = defaultMarket();
    const result = scoreMarketSafety(m);
    assert.ok(result >= 0 && result <= 100);
  });
  it("low market health → lower safety", () => {
    const safe  = scoreMarketSafety({ ...defaultMarket(), marketHealth: 90, marketRiskScore: 10 });
    const risky = scoreMarketSafety({ ...defaultMarket(), marketHealth: 20, marketRiskScore: 80 });
    assert.ok(safe > risky);
  });
});

describe("scoreBrokerReliability", () => {
  it("returns brokerReliabilityScore directly", () => {
    const b = { ...defaultBroker(), brokerReliabilityScore: 92 };
    assert.equal(scoreBrokerReliability(b), 92);
  });
});

describe("scoreSystemHealth", () => {
  it("returns systemHealthScore directly", () => {
    const infra = { ...defaultInfra(), systemHealthScore: 85 };
    assert.equal(scoreSystemHealth(infra), 85);
  });
});

describe("scoreCrisisSafety", () => {
  it("none severity → 100% safety", () => {
    assert.equal(scoreCrisisSafety({ ...defaultCrisis(), crisisSeverity: "none" }), 100);
  });
  it("extreme severity → 0% safety (clamped)", () => {
    const c = { ...defaultCrisis(), crisisSeverity: "extreme", survivalModeActive: true };
    assert.ok(scoreCrisisSafety(c) <= 0);
  });
  it("survival mode active → penalty applied", () => {
    const base   = scoreCrisisSafety({ ...defaultCrisis(), crisisSeverity: "moderate", survivalModeActive: false });
    const active = scoreCrisisSafety({ ...defaultCrisis(), crisisSeverity: "moderate", survivalModeActive: true });
    assert.ok(base > active);
  });
});

describe("scoreAdaptiveAlignment", () => {
  it("aligned profiles add bonus", () => {
    const aligned = scoreAdaptiveAlignment({ ...defaultAdaptive(), currentRiskProfile: "balanced", recommendedRiskProfile: "balanced", confidence: 70, adaptationConfidence: 65 });
    const misaligned = scoreAdaptiveAlignment({ ...defaultAdaptive(), currentRiskProfile: "aggressive", recommendedRiskProfile: "conservative", confidence: 70, adaptationConfidence: 65 });
    assert.ok(aligned > misaligned);
  });
});

// ─── Section 3: Survival Score ────────────────────────────────────────────────

describe("computeSurvivalScore", () => {
  it("high health, no crisis → high survival", () => {
    const a = { ...defaultAccount(), accountHealthScore: 90, drawdownPct: 0 };
    const s = computeSurvivalScore(a, defaultCrisis(), null);
    assert.ok(s >= 70);
  });
  it("survival mode active → penalty", () => {
    const a = defaultAccount();
    const crisis = { ...defaultCrisis(), survivalModeActive: true };
    const s = computeSurvivalScore(a, crisis, null);
    assert.ok(s < 80);
  });
  it("large drawdown → lower survival", () => {
    const a1 = { ...defaultAccount(), drawdownPct: 0 };
    const a2 = { ...defaultAccount(), drawdownPct: 20 };
    assert.ok(computeSurvivalScore(a1, defaultCrisis(), null) > computeSurvivalScore(a2, defaultCrisis(), null));
  });
});

// ─── Section 4: Capital Health Score ─────────────────────────────────────────

describe("computeCapitalHealthScore", () => {
  it("healthy account → high score", () => {
    const a = { ...defaultAccount(), accountHealthScore: 90, drawdownPct: 0, marginLevel: 300 };
    assert.ok(computeCapitalHealthScore(a) >= 70);
  });
  it("deep drawdown → lower score", () => {
    const a1 = { ...defaultAccount(), drawdownPct: 0 };
    const a2 = { ...defaultAccount(), drawdownPct: 25 };
    assert.ok(computeCapitalHealthScore(a1) > computeCapitalHealthScore(a2));
  });
});

// ─── Section 5: computeAllScores ─────────────────────────────────────────────

describe("computeAllScores", () => {
  it("returns 7 executive scores all 0-100", () => {
    const result = computeAllScores({
      account: defaultAccount(), position: null, portfolio: defaultPortfolio(),
      market: defaultMarket(), broker: defaultBroker(), infra: defaultInfra(),
      adaptive: defaultAdaptive(), crisis: defaultCrisis(), cp: null,
    });
    const scores = [
      result.overallRiskScore, result.survivalScore, result.capitalHealthScore,
      result.infrastructureScore, result.brokerReliabilityScore,
      result.portfolioStabilityScore, result.recoveryConfidenceScore,
    ];
    for (const s of scores) {
      assert.ok(s >= 0 && s <= 100, `Score out of range: ${s}`);
    }
  });

  it("crisis scenario raises overall risk", () => {
    const safe = computeAllScores({
      account: defaultAccount(), position: null, portfolio: defaultPortfolio(),
      market: defaultMarket(), broker: defaultBroker(), infra: defaultInfra(),
      adaptive: defaultAdaptive(), crisis: defaultCrisis(), cp: null,
    });
    const risky = computeAllScores({
      account: { ...defaultAccount(), accountHealthScore: 30, drawdownPct: 20 },
      position: null, portfolio: defaultPortfolio(),
      market: { ...defaultMarket(), marketRiskScore: 80 },
      broker: defaultBroker(), infra: defaultInfra(),
      adaptive: defaultAdaptive(),
      crisis: { crisisStatus: "critical", crisisSeverity: "critical", survivalModeActive: true, recoveryStage: "stage1", recoveryProgress: 10 },
      cp: null,
    });
    assert.ok(risky.overallRiskScore > safe.overallRiskScore);
  });

  it("score breakdown total matches overallRiskScore", () => {
    const result = computeAllScores({
      account: defaultAccount(), position: null, portfolio: defaultPortfolio(),
      market: defaultMarket(), broker: defaultBroker(), infra: defaultInfra(),
      adaptive: defaultAdaptive(), crisis: defaultCrisis(), cp: null,
    });
    assert.ok(Math.abs(result.scoreBreakdown.total - result.overallRiskScore) < 1);
  });

  it("weights normalise to sum 1", () => {
    const result = computeAllScores({
      account: defaultAccount(), position: null, portfolio: defaultPortfolio(),
      market: defaultMarket(), broker: defaultBroker(), infra: defaultInfra(),
      adaptive: defaultAdaptive(), crisis: defaultCrisis(), cp: null,
    });
    const sum = Object.values(result.scoreWeights).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sum - 1) < 0.01, `Weights sum ${sum} ≠ 1`);
  });
});

// ─── Section 6: Recommendation Engine ────────────────────────────────────────

describe("scoreToRecommendation", () => {
  it("0 risk → trade_normally", () => assert.equal(scoreToRecommendation(0), "trade_normally"));
  it("10 risk → trade_normally", () => assert.equal(scoreToRecommendation(10), "trade_normally"));
  it("25 risk → reduced_risk", () => assert.equal(scoreToRecommendation(25), "reduced_risk"));
  it("45 risk → restrict_exposure", () => assert.equal(scoreToRecommendation(45), "restrict_exposure"));
  it("58 risk → observation_mode", () => assert.equal(scoreToRecommendation(58), "observation_mode"));
  it("68 risk → defensive_mode", () => assert.equal(scoreToRecommendation(68), "defensive_mode"));
  it("78 risk → survival_mode", () => assert.equal(scoreToRecommendation(78), "survival_mode"));
  it("90 risk → emergency_stop", () => assert.equal(scoreToRecommendation(90), "emergency_stop"));
});

describe("buildRecommendationDetail", () => {
  it("includes all required fields", () => {
    const bd = makeBreakdown();
    const rec = buildRecommendationDetail(30, bd, defaultAccount(), defaultCrisis(), defaultAdaptive(), {}, []);
    assert.ok(rec.recommendation);
    assert.ok(rec.label);
    assert.ok(rec.description);
    assert.ok(typeof rec.confidence === "number");
    assert.ok(Array.isArray(rec.evidence));
    assert.ok(typeof rec.supportingMetrics === "object");
    assert.ok(typeof rec.expectedBenefit === "string");
    assert.ok(typeof rec.expectedRisk === "string");
  });
  it("confidence is 0-100", () => {
    const bd = makeBreakdown();
    const rec = buildRecommendationDetail(50, bd, defaultAccount(), defaultCrisis(), defaultAdaptive(), {}, []);
    assert.ok(rec.confidence >= 0 && rec.confidence <= 100);
  });
  it("evidence array is not empty", () => {
    const bd = makeBreakdown();
    const rec = buildRecommendationDetail(50, bd, defaultAccount(), defaultCrisis(), defaultAdaptive(), {}, []);
    assert.ok(rec.evidence.length > 0);
  });
});

// ─── Section 7: Historical Comparison ────────────────────────────────────────

describe("buildHistoricalComparison", () => {
  it("returns null for fewer than 2 rows", () => {
    assert.equal(buildHistoricalComparison([], 30, 70), null);
    assert.equal(buildHistoricalComparison([{ overallRiskScore: 30 }], 30, 70), null);
  });
  it("returns trend=deteriorating when risk rising", () => {
    const rows = [{ overallRiskScore: 20 }, { overallRiskScore: 25 }];
    const result = buildHistoricalComparison(rows, 40, 70);
    assert.equal(result?.trend, "deteriorating");
  });
  it("returns trend=improving when risk falling", () => {
    const rows = [{ overallRiskScore: 50 }, { overallRiskScore: 55 }];
    const result = buildHistoricalComparison(rows, 30, 70);
    assert.equal(result?.trend, "improving");
  });
});

// ─── Section 8: Explainability ────────────────────────────────────────────────

describe("identifyTriggeringMetrics", () => {
  it("returns non-empty array", () => {
    const bd = makeBreakdown();
    const metrics = identifyTriggeringMetrics(bd, defaultAccount(), defaultCrisis(), 30);
    assert.ok(Array.isArray(metrics) && metrics.length > 0);
  });
  it("flags drawdown > 5%", () => {
    const a = { ...defaultAccount(), drawdownPct: 10 };
    const bd = makeBreakdown();
    const metrics = identifyTriggeringMetrics(bd, a, defaultCrisis(), 30);
    assert.ok(metrics.some(m => m.includes("Drawdown")));
  });
  it("flags survival mode active", () => {
    const crisis = { ...defaultCrisis(), survivalModeActive: true };
    const bd = makeBreakdown();
    const metrics = identifyTriggeringMetrics(bd, defaultAccount(), crisis, 30);
    assert.ok(metrics.some(m => m.includes("Survival mode")));
  });
});

describe("identifyActiveProtections", () => {
  it("returns non-empty array", () => {
    const protections = identifyActiveProtections(defaultCrisis(), defaultAdaptive(), defaultAccount(), "trade_normally");
    assert.ok(Array.isArray(protections) && protections.length > 0);
  });
  it("mentions position reduction for survival_mode", () => {
    const protections = identifyActiveProtections(defaultCrisis(), defaultAdaptive(), defaultAccount(), "survival_mode");
    assert.ok(protections.some(p => p.includes("preservation")));
  });
  it("mentions observation mode for observation_mode", () => {
    const protections = identifyActiveProtections(defaultCrisis(), defaultAdaptive(), defaultAccount(), "observation_mode");
    assert.ok(protections.some(p => p.toLowerCase().includes("observation")));
  });
});

describe("identifyTopContributor", () => {
  it("returns the highest-weighted dimension", () => {
    const bd = makeBreakdown({
      marketRisk: { raw: 80, weighted: 80 * 0.15, weight: 0.15, label: "Market Risk", calculation: "" },
    });
    const top = identifyTopContributor(bd);
    assert.equal(top.subsystem, "Market Risk");
  });
});

describe("computeConfidenceInterval", () => {
  it("lower < score < upper", () => {
    const ci = computeConfidenceInterval(50, defaultAccount(), defaultCrisis());
    assert.ok(ci.lower < 50 && ci.upper > 50);
  });
  it("wider interval during crisis", () => {
    const normal = computeConfidenceInterval(50, defaultAccount(), defaultCrisis());
    const crisis = computeConfidenceInterval(50, defaultAccount(), { ...defaultCrisis(), survivalModeActive: true });
    assert.ok((crisis.upper - crisis.lower) > (normal.upper - normal.lower));
  });
});

describe("computeReliabilityRating", () => {
  it("high confidence → high rating", () => {
    const a = { ...defaultAccount(), accountHealthScore: 80 };
    const ari = { ...defaultAdaptive(), confidence: 70 };
    assert.equal(computeReliabilityRating(a, defaultCrisis(), ari), "high");
  });
  it("low confidence → insufficient", () => {
    const ari = { ...defaultAdaptive(), confidence: 20 };
    assert.equal(computeReliabilityRating(defaultAccount(), defaultCrisis(), ari), "insufficient");
  });
  it("extreme crisis → low", () => {
    const crisis = { ...defaultCrisis(), crisisSeverity: "extreme" };
    assert.equal(computeReliabilityRating(defaultAccount(), crisis, defaultAdaptive()), "low");
  });
});

// ─── Section 9: Intelligence Builders ────────────────────────────────────────

describe("buildAccountIntelligence", () => {
  it("falls back to defaults for null input", () => {
    const a = buildAccountIntelligence(null, null);
    assert.equal(a.balance, 10000);
    assert.equal(a.accountHealthScore, 80);
  });
  it("reads from riResult", () => {
    const ri = { balance: "15000", equity: "14500", accountHealthScore: "72" };
    const a = buildAccountIntelligence(ri as unknown as Record<string, unknown>, null);
    assert.equal(a.balance, 15000);
    assert.equal(a.accountHealthScore, 72);
  });
});

describe("buildCrisisIntelligence", () => {
  it("falls back to safe defaults for null input", () => {
    const c = buildCrisisIntelligence(null);
    assert.equal(c.crisisStatus, "normal");
    assert.equal(c.survivalModeActive, false);
  });
  it("reads survival mode from nested structure", () => {
    const input = {
      summary: { currentMode: "survival", currentSeverity: "high" },
      survivalMode: { currentMode: "survival" },
      classification: { overallSeverity: "high" },
      recovery: { stage: "stage1", progressPct: 30 },
    };
    const c = buildCrisisIntelligence(input as unknown as Record<string, unknown>);
    assert.equal(c.survivalModeActive, true);
    assert.equal(c.recoveryProgress, 30);
  });
});

// ─── Section 10: Full Executive Risk Brain ────────────────────────────────────

describe("runExecutiveRiskBrain", () => {
  it("returns a valid ExecutiveRiskObject with all 7 scores", async () => {
    const erb = await runExecutiveRiskBrain({});
    assert.equal(erb.engineVersion, ERB_ENGINE_VERSION);
    assert.equal(erb.isAdvisoryOnly, true);
    assert.ok(erb.overallRiskScore >= 0 && erb.overallRiskScore <= 100);
    assert.ok(erb.survivalScore >= 0 && erb.survivalScore <= 100);
    assert.ok(erb.capitalHealthScore >= 0 && erb.capitalHealthScore <= 100);
    assert.ok(erb.infrastructureScore >= 0 && erb.infrastructureScore <= 100);
    assert.ok(erb.brokerReliabilityScore >= 0 && erb.brokerReliabilityScore <= 100);
    assert.ok(erb.portfolioStabilityScore >= 0 && erb.portfolioStabilityScore <= 100);
    assert.ok(erb.recoveryConfidenceScore >= 0 && erb.recoveryConfidenceScore <= 100);
  });

  it("recommendation is one of 7 valid levels", async () => {
    const validRecs = ["trade_normally", "reduced_risk", "restrict_exposure", "observation_mode", "defensive_mode", "survival_mode", "emergency_stop"];
    const erb = await runExecutiveRiskBrain({});
    assert.ok(validRecs.includes(erb.recommendationDetail.recommendation));
  });

  it("explainability includes all required fields", async () => {
    const erb = await runExecutiveRiskBrain({});
    assert.ok(typeof erb.explainability.whyThisRecommendation === "string");
    assert.ok(typeof erb.explainability.topContributingSubsystem === "string");
    assert.ok(Array.isArray(erb.explainability.triggeringMetrics));
    assert.ok(Array.isArray(erb.explainability.activeProtections));
    assert.ok(typeof erb.explainability.confidenceInterval === "object");
    assert.ok(erb.explainability.reliabilityRating);
    assert.ok(Array.isArray(erb.explainability.subsystemContributions));
  });

  it("crisis scenario triggers elevated risk recommendation", async () => {
    const crisisInput = {
      summary: { currentMode: "emergency", currentSeverity: "extreme" },
      survivalMode: { currentMode: "emergency" },
      classification: { overallSeverity: "extreme" },
      recovery: { stage: "stage1", progressPct: 5 },
    };
    const riInput = { accountHealthScore: "20", drawdownPct: "30", marketRiskScore: "90" };
    const erb = await runExecutiveRiskBrain({ crisisResult: crisisInput, riResult: riInput });
    // restrict_exposure or higher; exact level depends on multi-dimensional weighting
    const elevatedRecs = ["restrict_exposure", "observation_mode", "defensive_mode", "survival_mode", "emergency_stop"];
    assert.ok(elevatedRecs.includes(erb.recommendationDetail.recommendation),
      `Expected elevated risk rec, got: ${erb.recommendationDetail.recommendation} (risk: ${erb.overallRiskScore})`);
  });

  it("healthy scenario produces low risk", async () => {
    const ri = {
      accountHealthScore: "95", drawdownPct: "0.5", marketRiskScore: "15",
      brokerReliabilityScore: "95", systemHealthScore: "98", portfolioRiskScore: "10",
    };
    const erb = await runExecutiveRiskBrain({ riResult: ri });
    assert.ok(erb.overallRiskScore < 50,
      `Expected low risk, got ${erb.overallRiskScore}`);
  });

  it("reportId is a unique non-empty string", async () => {
    const [a, b] = await Promise.all([runExecutiveRiskBrain({}), runExecutiveRiskBrain({})]);
    assert.ok(a.reportId.length > 0);
    assert.notEqual(a.reportId, b.reportId);
  });

  it("scoreBreakdown has 8 dimensions", async () => {
    const erb = await runExecutiveRiskBrain({});
    const dims = ["accountHealth", "positionRisk", "portfolioStability", "marketRisk", "brokerReliability", "systemHealth", "crisisScore", "adaptiveRisk"];
    for (const d of dims) {
      assert.ok(d in erb.scoreBreakdown, `Missing dimension: ${d}`);
    }
  });
});

// ─── Section 11: Certification ────────────────────────────────────────────────

describe("runErbCertification", () => {
  const baseCtx = {
    totalErbReports: 50, recentErbReports: 10, riReports: 100,
    cpReports: 30, ariReports: 20, crisisReports: 15, erbDecisions: 50,
    avgExplainability: 82, avgOverallRisk: 35, avgSurvivalScore: 72,
    apiRoutesVerified: 6, totalApiRoutes: 6,
    dashboardVerified: 10, totalDashboardPages: 10,
    avgLatencyMs: 90, totalTests: 80, passingTests: 78,
    certificationHistory: 2, crisisIsolationVerified: true,
  };

  it("returns a certification report", async () => {
    const cert = await runErbCertification(baseCtx);
    assert.ok(cert.certId.length > 0);
    assert.ok(cert.overallScore >= 0 && cert.overallScore <= 100);
    assert.ok(["certified", "conditional", "failed"].includes(cert.certificationStatus));
    assert.ok(cert.grade.length > 0);
  });

  it("has all 13 subsystem audits", async () => {
    const cert = await runErbCertification(baseCtx);
    const expected = [
      "accountProtection", "exposureControl", "portfolioStability", "marketRiskMonitoring",
      "adaptiveRiskLogic", "crisisDetection", "recoveryLogic", "explainability",
      "auditLogging", "versioning", "apiStability", "dashboardFunctionality", "scalability",
    ];
    for (const key of expected) {
      assert.ok(key in cert.subsystems, `Missing subsystem: ${key}`);
    }
  });

  it("each subsystem has score, status, findings, recommendations", async () => {
    const cert = await runErbCertification(baseCtx);
    for (const [name, sub] of Object.entries(cert.subsystems)) {
      assert.ok(sub.score >= 0 && sub.score <= 100, `${name} score out of range`);
      assert.ok(["pass", "conditional", "fail"].includes(sub.status), `${name} invalid status`);
      assert.ok(Array.isArray(sub.findings), `${name} missing findings`);
      assert.ok(Array.isArray(sub.recommendations), `${name} missing recommendations`);
    }
  });

  it("empty context produces conditional or failed result", async () => {
    const emptyCert = await runErbCertification({
      totalErbReports: 0, recentErbReports: 0, riReports: 0,
      cpReports: 0, ariReports: 0, crisisReports: 0, erbDecisions: 0,
      avgExplainability: 0, avgOverallRisk: 80, avgSurvivalScore: 20,
      apiRoutesVerified: 0, totalApiRoutes: 6,
      dashboardVerified: 0, totalDashboardPages: 10,
      avgLatencyMs: 800, totalTests: 0, passingTests: 0,
      certificationHistory: 0, crisisIsolationVerified: false,
    });
    assert.ok(["conditional", "failed"].includes(emptyCert.certificationStatus));
  });

  it("phase7Readiness score is the same as overallScore", async () => {
    const cert = await runErbCertification(baseCtx);
    assert.equal(cert.phase7Readiness, cert.overallScore);
  });

  it("includes technical debt and future improvements", async () => {
    const cert = await runErbCertification(baseCtx);
    assert.ok(Array.isArray(cert.technicalDebt) && cert.technicalDebt.length > 0);
    assert.ok(Array.isArray(cert.futureImprovements) && cert.futureImprovements.length > 0);
  });
});

// ─── Section 12: Long-duration stability (simulated) ─────────────────────────

describe("stability under varied inputs", () => {
  it("handles 20 rapid sequential ERB evaluations without throwing", async () => {
    const runs = Array.from({ length: 20 }, (_, i) => runExecutiveRiskBrain({
      riResult: { accountHealthScore: String(50 + i * 2), drawdownPct: String(i * 0.5) },
    }));
    const results = await Promise.all(runs);
    assert.equal(results.length, 20);
    for (const r of results) {
      assert.ok(r.overallRiskScore >= 0 && r.overallRiskScore <= 100);
    }
  });

  it("high-volatility market simulation stays within score bounds", async () => {
    const erb = await runExecutiveRiskBrain({
      riResult: { marketRiskScore: "95", volatility: "98", liquidity: "10", marketHealth: "5" },
    });
    assert.ok(erb.overallRiskScore >= 0 && erb.overallRiskScore <= 100);
    assert.ok(erb.survivalScore >= 0 && erb.survivalScore <= 100);
  });
});
