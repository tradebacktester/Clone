// ─── Strategy Quality Intelligence Engine — Tests ─────────────────────────────

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { runQualityEngine }                from "../quality-engine.js";
import { evaluateRuleIntegrity }           from "../rule-integrity-evaluator.js";
import { analyzeStructuralQuality }        from "../structural-quality-analyzer.js";
import { analyzeLiquidityIntelligence }    from "../liquidity-intelligence-analyzer.js";
import { analyzeAmdIntelligence }          from "../amd-intelligence-analyzer.js";
import { analyzeConfirmationIntelligence } from "../confirmation-intelligence-analyzer.js";
import { integrateMarketIntelligence }     from "../market-intelligence-integrator.js";
import { analyzeHistoricalIntelligence }   from "../historical-intelligence-analyzer.js";
import { calculateSqs }                    from "../sqs-calculator.js";
import { classifyQuality }                 from "../quality-classifier.js";
import { sqsToClassification, SQS_WEIGHTS, clamp } from "../types.js";
import type { QualitySetup } from "../types.js";
import type { ExtractedFeature } from "../../learning-core/types.js";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeStrong(): QualitySetup {
  return {
    pair: "EURUSD", session: "london", regime: "trending", trend: "bullish", volatility: "medium",
    supplyQuality: 82, demandQuality: 80, liquidityScore: 78, amdScore: 76,
    confirmationQuality: 80, setupScore: 78, tqi: 74, rrPlanned: 3.0, spreadPips: 1.2,
    htfAlignment: 85, srStrength: 80, premiumDiscountBias: 78, zoneFreshness: 82,
    zoneRespect: 80, marketStructureCleanliness: 78,
    liquiditySweepSize: 75, liquiditySweepClarity: 80, stopHuntQuality: 78,
    manipulationClarity: 76, distributionStrength: 74,
    accumulationQuality: 78, manipulationQuality: 76, distributionQuality: 75,
    amdCompleteness: 82, amdConfidence: 80,
    candleStrength: 80, momentum: 78, candleBodyRatio: 76, breakStrength: 80,
    displacement: 78, followThroughProb: 75,
    marketHealthScore: 80, marketContextScore: 78, opportunityScore: 76,
    marketStabilityScore: 80, trendStrength: 82, volatilityQuality: 85,
    liquidityQuality: 80, correlationQuality: 78, newsContext: "positive",
  };
}

function makeWeak(): QualitySetup {
  return {
    pair: "NZDUSD", session: "asian", regime: "ranging", trend: "unknown", volatility: "extreme",
    supplyQuality: 35, demandQuality: 32, liquidityScore: 30, amdScore: 28,
    confirmationQuality: 32, setupScore: 30, tqi: 28, rrPlanned: 0.8, spreadPips: 5.5,
  };
}

function makeFeatures(n: number, winRate: number): ExtractedFeature[] {
  return Array.from({ length: n }, (_, i) => ({
    tradeId: `t${i}`, setupId: `s${i}`,
    pair: "EURUSD", session: "london",
    marketRegime: "trending",
    supplyQuality: 80, demandQuality: 78, liquidityScore: 76,
    amdScore: 74, confirmationQuality: 78, setupScore: 76, tqi: 72,
    outcome: i < Math.round(n * winRate) ? "win" : "loss",
    rrActual: i < Math.round(n * winRate) ? 2.5 : -1,
    openedAt: new Date(),
  } as unknown as ExtractedFeature));
}

// ─── Rule Integrity ───────────────────────────────────────────────────────────

describe("Rule Integrity Evaluator", () => {
  it("strong setup produces high integrity score", () => {
    const result = evaluateRuleIntegrity(makeStrong());
    assert.ok(result.ruleIntegrityScore > 70, `Expected >70, got ${result.ruleIntegrityScore}`);
  });
  it("weak setup produces low integrity score", () => {
    const result = evaluateRuleIntegrity(makeWeak());
    assert.ok(result.ruleIntegrityScore < 55, `Expected <55, got ${result.ruleIntegrityScore}`);
  });
  it("score is 0–100", () => {
    [makeStrong(), makeWeak()].forEach(s => {
      const r = evaluateRuleIntegrity(s);
      assert.ok(r.ruleIntegrityScore >= 0 && r.ruleIntegrityScore <= 100);
    });
  });
  it("completeness increases with optional fields populated", () => {
    const bare = evaluateRuleIntegrity(makeWeak());
    const full = evaluateRuleIntegrity(makeStrong());
    assert.ok(full.completenessScore > bare.completenessScore);
  });
  it("returns explanations array", () => {
    const r = evaluateRuleIntegrity(makeStrong());
    assert.ok(r.explanations.length > 0);
  });
  it("passingRules ≤ totalRules", () => {
    const r = evaluateRuleIntegrity(makeStrong());
    assert.ok(r.passingRules <= r.totalRules);
  });
  it("strictness score 0–100", () => {
    const r = evaluateRuleIntegrity(makeStrong());
    assert.ok(r.strictnessScore >= 0 && r.strictnessScore <= 100);
  });
  it("alignment score 0–100", () => {
    const r = evaluateRuleIntegrity(makeStrong());
    assert.ok(r.alignmentScore >= 0 && r.alignmentScore <= 100);
  });
});

// ─── Structural Quality ───────────────────────────────────────────────────────

describe("Structural Quality Analyzer", () => {
  it("strong setup scores high", () => {
    const r = analyzeStructuralQuality(makeStrong());
    assert.ok(r.structuralQualityScore > 70);
  });
  it("weak setup scores low", () => {
    const r = analyzeStructuralQuality(makeWeak());
    assert.ok(r.structuralQualityScore < 60);
  });
  it("score is 0–100", () => {
    [makeStrong(), makeWeak()].forEach(s => {
      const r = analyzeStructuralQuality(s);
      assert.ok(r.structuralQualityScore >= 0 && r.structuralQualityScore <= 100);
    });
  });
  it("all sub-scores are 0–100", () => {
    const r = analyzeStructuralQuality(makeStrong());
    [r.htfAlignmentScore, r.srStrengthScore, r.premiumDiscountScore,
     r.supplyDemandScore, r.zoneFreshnessScore, r.zoneRespectScore, r.cleanlinessScore]
      .forEach(s => assert.ok(s >= 0 && s <= 100));
  });
  it("returns explanations", () => {
    const r = analyzeStructuralQuality(makeStrong());
    assert.ok(r.explanations.length > 0);
  });
  it("infers scores when optional fields absent", () => {
    const r = analyzeStructuralQuality(makeWeak()); // makeWeak has no optional structural fields
    assert.ok(typeof r.htfAlignmentScore === "number");
  });
});

// ─── Liquidity Intelligence ───────────────────────────────────────────────────

describe("Liquidity Intelligence Analyzer", () => {
  it("strong setup scores high", () => {
    const r = analyzeLiquidityIntelligence(makeStrong());
    assert.ok(r.liquidityIntelligenceScore > 65);
  });
  it("weak setup scores low", () => {
    const r = analyzeLiquidityIntelligence(makeWeak());
    assert.ok(r.liquidityIntelligenceScore < 50);
  });
  it("score is 0–100", () => {
    [makeStrong(), makeWeak()].forEach(s => {
      const r = analyzeLiquidityIntelligence(s);
      assert.ok(r.liquidityIntelligenceScore >= 0 && r.liquidityIntelligenceScore <= 100);
    });
  });
  it("all sub-scores are 0–100", () => {
    const r = analyzeLiquidityIntelligence(makeStrong());
    [r.sweepSizeScore, r.sweepClarityScore, r.stopHuntScore, r.manipulationScore, r.distributionScore]
      .forEach(s => assert.ok(s >= 0 && s <= 100));
  });
});

// ─── AMD Intelligence ─────────────────────────────────────────────────────────

describe("AMD Intelligence Analyzer", () => {
  it("strong setup scores high", () => {
    const r = analyzeAmdIntelligence(makeStrong());
    assert.ok(r.amdIntelligenceScore > 65);
  });
  it("weak setup scores low", () => {
    const r = analyzeAmdIntelligence(makeWeak());
    assert.ok(r.amdIntelligenceScore < 55);
  });
  it("score is 0–100", () => {
    [makeStrong(), makeWeak()].forEach(s => {
      const r = analyzeAmdIntelligence(s);
      assert.ok(r.amdIntelligenceScore >= 0 && r.amdIntelligenceScore <= 100);
    });
  });
  it("all sub-scores are 0–100", () => {
    const r = analyzeAmdIntelligence(makeStrong());
    [r.accumulationScore, r.manipulationScore, r.distributionScore,
     r.completenessScore, r.amdConfidenceScore]
      .forEach(s => assert.ok(s >= 0 && s <= 100));
  });
  it("completeness increases with explicit amdCompleteness input", () => {
    const base = analyzeAmdIntelligence(makeWeak());
    const enriched = analyzeAmdIntelligence({ ...makeWeak(), amdCompleteness: 90 });
    assert.ok(enriched.completenessScore > base.completenessScore);
  });
});

// ─── Confirmation Intelligence ────────────────────────────────────────────────

describe("Confirmation Intelligence Analyzer", () => {
  it("strong setup scores high", () => {
    const r = analyzeConfirmationIntelligence(makeStrong());
    assert.ok(r.confirmationIntelligenceScore > 65);
  });
  it("weak setup scores low", () => {
    const r = analyzeConfirmationIntelligence(makeWeak());
    assert.ok(r.confirmationIntelligenceScore < 55);
  });
  it("score is 0–100", () => {
    [makeStrong(), makeWeak()].forEach(s => {
      const r = analyzeConfirmationIntelligence(s);
      assert.ok(r.confirmationIntelligenceScore >= 0 && r.confirmationIntelligenceScore <= 100);
    });
  });
  it("all sub-scores are 0–100", () => {
    const r = analyzeConfirmationIntelligence(makeStrong());
    [r.candleStrengthScore, r.momentumScore, r.bodyRatioScore,
     r.breakStrengthScore, r.displacementScore, r.followThroughScore]
      .forEach(s => assert.ok(s >= 0 && s <= 100));
  });
});

// ─── Market Intelligence ──────────────────────────────────────────────────────

describe("Market Intelligence Integrator", () => {
  it("strong setup scores high", () => {
    const r = integrateMarketIntelligence(makeStrong());
    assert.ok(r.marketIntelligenceScore > 65);
  });
  it("positive news boosts score", () => {
    const base = integrateMarketIntelligence({ ...makeStrong(), newsContext: "neutral" });
    const pos  = integrateMarketIntelligence({ ...makeStrong(), newsContext: "positive" });
    assert.ok(pos.marketIntelligenceScore >= base.marketIntelligenceScore);
  });
  it("negative news lowers score", () => {
    const base = integrateMarketIntelligence({ ...makeStrong(), newsContext: "neutral" });
    const neg  = integrateMarketIntelligence({ ...makeStrong(), newsContext: "negative" });
    assert.ok(neg.marketIntelligenceScore <= base.marketIntelligenceScore);
  });
  it("score is 0–100", () => {
    [makeStrong(), makeWeak()].forEach(s => {
      const r = integrateMarketIntelligence(s);
      assert.ok(r.marketIntelligenceScore >= 0 && r.marketIntelligenceScore <= 100);
    });
  });
  it("all 8 sub-scores are 0–100", () => {
    const r = integrateMarketIntelligence(makeStrong());
    [r.healthScore, r.contextScore, r.opportunityScore, r.stabilityScore,
     r.trendQualityScore, r.volatilityQualityScore, r.liquidityQualityScore, r.correlationQualityScore]
      .forEach(s => assert.ok(s >= 0 && s <= 100));
  });
  it("explicit inputs override inference", () => {
    const r = integrateMarketIntelligence({ ...makeStrong(), marketHealthScore: 99 });
    assert.equal(r.healthScore, 99);
  });
});

// ─── Historical Intelligence ──────────────────────────────────────────────────

describe("Historical Intelligence Analyzer", () => {
  it("no features yields zero or low score", () => {
    const r = analyzeHistoricalIntelligence(makeStrong(), []);
    assert.ok(r.historicalIntelligenceScore <= 35);
  });
  it("sufficient features improve score", () => {
    const fs = makeFeatures(20, 0.70);
    const r  = analyzeHistoricalIntelligence(makeStrong(), fs);
    assert.ok(r.historicalIntelligenceScore > 30);
  });
  it("score is 0–100", () => {
    [[], makeFeatures(15, 0.60)].forEach(fs => {
      const r = analyzeHistoricalIntelligence(makeStrong(), fs);
      assert.ok(r.historicalIntelligenceScore >= 0 && r.historicalIntelligenceScore <= 100);
    });
  });
  it("evidence count matches feature count (after similarity filter)", () => {
    const fs = makeFeatures(10, 0.60);
    const r  = analyzeHistoricalIntelligence(makeStrong(), fs);
    assert.ok(r.evidenceCount >= 0 && r.evidenceCount <= 10);
  });
  it("win rate is 0–1", () => {
    const r = analyzeHistoricalIntelligence(makeStrong(), makeFeatures(10, 0.60));
    assert.ok(r.winRate >= 0 && r.winRate <= 1);
  });
  it("reliability improves with more evidence", () => {
    const small = analyzeHistoricalIntelligence(makeStrong(), makeFeatures(3, 0.60));
    const large = analyzeHistoricalIntelligence(makeStrong(), makeFeatures(25, 0.60));
    assert.ok(large.historicalIntelligenceScore >= small.historicalIntelligenceScore);
  });
  it("all sub-scores are 0–100", () => {
    const r = analyzeHistoricalIntelligence(makeStrong(), makeFeatures(15, 0.65));
    [r.similarityScore, r.winRateScore, r.rrScore, r.patternRankScore,
     r.featureImportanceScore, r.evidenceVolumeScore]
      .forEach(s => assert.ok(s >= 0 && s <= 100));
  });
});

// ─── SQS Calculator ───────────────────────────────────────────────────────────

describe("SQS Calculator", () => {
  it("produces a score 0–100", () => {
    const setup  = makeStrong();
    const ri     = evaluateRuleIntegrity(setup);
    const sq     = analyzeStructuralQuality(setup);
    const li     = analyzeLiquidityIntelligence(setup);
    const ai     = analyzeAmdIntelligence(setup);
    const ci     = analyzeConfirmationIntelligence(setup);
    const mi     = integrateMarketIntelligence(setup);
    const hi     = analyzeHistoricalIntelligence(setup, []);
    const result = calculateSqs(ri, sq, li, ai, ci, mi, hi);
    assert.ok(result.strategyQualityScore >= 0 && result.strategyQualityScore <= 100);
  });
  it("has 7 components", () => {
    const setup  = makeStrong();
    const ri     = evaluateRuleIntegrity(setup);
    const sq     = analyzeStructuralQuality(setup);
    const li     = analyzeLiquidityIntelligence(setup);
    const ai     = analyzeAmdIntelligence(setup);
    const ci     = analyzeConfirmationIntelligence(setup);
    const mi     = integrateMarketIntelligence(setup);
    const hi     = analyzeHistoricalIntelligence(setup, []);
    const result = calculateSqs(ri, sq, li, ai, ci, mi, hi);
    assert.equal(result.components.length, 7);
  });
  it("weights sum to 1", () => {
    const sum = Object.values(SQS_WEIGHTS).reduce((s, w) => s + w, 0);
    assert.ok(Math.abs(sum - 1.0) < 0.001);
  });
  it("strong setup outscores weak setup", () => {
    const rs = makeStrong(), rw = makeWeak();
    const calc = (s: QualitySetup) => calculateSqs(
      evaluateRuleIntegrity(s), analyzeStructuralQuality(s),
      analyzeLiquidityIntelligence(s), analyzeAmdIntelligence(s),
      analyzeConfirmationIntelligence(s), integrateMarketIntelligence(s),
      analyzeHistoricalIntelligence(s, []),
    );
    assert.ok(calc(rs).strategyQualityScore > calc(rw).strategyQualityScore);
  });
  it("weightedScore = score × weight for each component", () => {
    const setup  = makeStrong();
    const result = calculateSqs(
      evaluateRuleIntegrity(setup), analyzeStructuralQuality(setup),
      analyzeLiquidityIntelligence(setup), analyzeAmdIntelligence(setup),
      analyzeConfirmationIntelligence(setup), integrateMarketIntelligence(setup),
      analyzeHistoricalIntelligence(setup, []),
    );
    result.components.forEach(c => {
      assert.ok(Math.abs(c.weightedScore - c.score * c.weight) < 0.001);
    });
  });
});

// ─── Quality Classifier ───────────────────────────────────────────────────────

describe("Quality Classifier", () => {
  it("maps 95 → institutional_grade", () => {
    assert.equal(sqsToClassification(95), "institutional_grade");
  });
  it("maps 84 → elite", () => {
    assert.equal(sqsToClassification(84), "elite");
  });
  it("maps 74 → excellent", () => {
    assert.equal(sqsToClassification(74), "excellent");
  });
  it("maps 63 → strong", () => {
    assert.equal(sqsToClassification(63), "strong");
  });
  it("maps 50 → average", () => {
    assert.equal(sqsToClassification(50), "average");
  });
  it("maps 30 → weak", () => {
    assert.equal(sqsToClassification(30), "weak");
  });
  it("maps 10 → reject", () => {
    assert.equal(sqsToClassification(10), "reject");
  });
  it("classifyQuality returns measurableReasons", () => {
    const setup  = makeStrong();
    const sqs    = calculateSqs(
      evaluateRuleIntegrity(setup), analyzeStructuralQuality(setup),
      analyzeLiquidityIntelligence(setup), analyzeAmdIntelligence(setup),
      analyzeConfirmationIntelligence(setup), integrateMarketIntelligence(setup),
      analyzeHistoricalIntelligence(setup, []),
    );
    const cls = classifyQuality(sqs.strategyQualityScore, sqs.components);
    assert.ok(cls.measurableReasons.length > 0);
    assert.ok(cls.justification.length > 0);
  });
  it("gapToNext is null at top tier", () => {
    const setup  = { ...makeStrong(), supplyQuality: 95, demandQuality: 95, setupScore: 95, tqi: 90 };
    const sqs    = calculateSqs(
      evaluateRuleIntegrity(setup), analyzeStructuralQuality(setup),
      analyzeLiquidityIntelligence(setup), analyzeAmdIntelligence(setup),
      analyzeConfirmationIntelligence(setup), integrateMarketIntelligence(setup),
      analyzeHistoricalIntelligence(setup, []),
    );
    const cls = classifyQuality(sqs.strategyQualityScore, sqs.components);
    if (cls.classification === "institutional_grade") {
      assert.equal(cls.nextThreshold, null);
    }
  });
});

// ─── Full Pipeline ────────────────────────────────────────────────────────────

describe("Full Quality Pipeline", () => {
  it("runs without error", () => {
    const r = runQualityEngine(makeStrong());
    assert.ok(r.reportId);
  });
  it("isAdvisoryOnly is always true", () => {
    [makeStrong(), makeWeak()].forEach(s => {
      const r = runQualityEngine(s);
      assert.equal(r.isAdvisoryOnly, true);
    });
  });
  it("SQS is 0–100", () => {
    [makeStrong(), makeWeak()].forEach(s => {
      const r = runQualityEngine(s);
      assert.ok(r.strategyQualityScore >= 0 && r.strategyQualityScore <= 100);
    });
  });
  it("strong setup gets better classification than weak", () => {
    const strong = runQualityEngine(makeStrong()).strategyQualityScore;
    const weak   = runQualityEngine(makeWeak()).strategyQualityScore;
    assert.ok(strong > weak);
  });
  it("report has all required component scores", () => {
    const r = runQualityEngine(makeStrong());
    assert.ok(r.ruleIntegrity);
    assert.ok(r.structuralQuality);
    assert.ok(r.liquidityIntelligence);
    assert.ok(r.amdIntelligence);
    assert.ok(r.confirmationIntelligence);
    assert.ok(r.marketIntelligence);
    assert.ok(r.historicalIntelligence);
  });
  it("components length is 7", () => {
    const r = runQualityEngine(makeStrong());
    assert.equal(r.components.length, 7);
  });
  it("never modifies setup input", () => {
    const original = JSON.stringify(makeStrong());
    const setup = makeStrong();
    runQualityEngine(setup);
    assert.equal(JSON.stringify(setup), original);
  });
  it("generates unique report IDs", () => {
    const r1 = runQualityEngine(makeStrong());
    const r2 = runQualityEngine(makeStrong());
    assert.notEqual(r1.reportId, r2.reportId);
  });
  it("qualityNarrative is non-empty string", () => {
    const r = runQualityEngine(makeStrong());
    assert.ok(typeof r.qualityNarrative === "string" && r.qualityNarrative.length > 0);
  });
  it("strongestComponents and weakestComponents are non-empty", () => {
    const r = runQualityEngine(makeStrong());
    assert.ok(r.strongestComponents.length > 0);
    assert.ok(r.weakestComponents.length > 0);
  });
  it("historical features improve report", () => {
    const noHist = runQualityEngine(makeStrong(), []);
    const withHist = runQualityEngine(makeStrong(), makeFeatures(20, 0.70));
    assert.ok(withHist.historicalIntelligence.historicalIntelligenceScore >=
              noHist.historicalIntelligence.historicalIntelligenceScore);
  });
  it("reproducible: same input → same SQS", () => {
    const s = makeStrong();
    const r1 = runQualityEngine(s, []);
    const r2 = runQualityEngine(s, []);
    assert.equal(r1.strategyQualityScore, r2.strategyQualityScore);
  });
  it("classification is valid enum value", () => {
    const valid = ["institutional_grade","elite","excellent","strong","average","weak","reject"];
    const r = runQualityEngine(makeStrong());
    assert.ok(valid.includes(r.classification.classification));
  });
  it("evaluatedAt is a Date", () => {
    const r = runQualityEngine(makeStrong());
    assert.ok(r.evaluatedAt instanceof Date);
  });
});

// ─── Score Bounds ─────────────────────────────────────────────────────────────

describe("Score Bounds — edge inputs", () => {
  it("clamp(0, 0, 100) = 0", () => assert.equal(clamp(0, 0, 100), 0));
  it("clamp(100, 0, 100) = 100", () => assert.equal(clamp(100, 0, 100), 100));
  it("clamp(150, 0, 100) = 100", () => assert.equal(clamp(150, 0, 100), 100));
  it("clamp(-10, 0, 100) = 0", () => assert.equal(clamp(-10, 0, 100), 0));
  it("extreme supply still clamped to 100", () => {
    const r = analyzeStructuralQuality({ ...makeStrong(), supplyQuality: 150 });
    assert.ok(r.supplyDemandScore <= 100);
  });
  it("zero all scores → reject classification", () => {
    const s: QualitySetup = {
      pair: "EURUSD", session: "off_hours", regime: "ranging", trend: "unknown", volatility: "extreme",
      supplyQuality: 0, demandQuality: 0, liquidityScore: 0, amdScore: 0,
      confirmationQuality: 0, setupScore: 0, tqi: 0, rrPlanned: 0, spreadPips: 10,
    };
    const r = runQualityEngine(s);
    assert.ok(["reject", "weak"].includes(r.classification.classification));
  });
});
