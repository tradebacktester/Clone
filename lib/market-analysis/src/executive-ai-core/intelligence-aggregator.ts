// ─── Intelligence Aggregator ──────────────────────────────────────────────────
// Normalizes raw results from all 7 subsystems into typed intelligence objects.

import type {
  StrategyIntelligence,
  MarketIntelligence,
  RiskIntelligence,
  MemoryIntelligence,
  LearningIntelligence,
  IdentityIntelligence,
  ResearchIntelligence,
} from "./types.js";

function n(v: unknown, fallback = 0): number {
  const num = Number(v);
  return isFinite(num) ? num : fallback;
}

function s(v: unknown, fallback = "unknown"): string {
  return typeof v === "string" && v.length > 0 ? v : fallback;
}

// ─── Strategy Intelligence (from ESB reports) ─────────────────────────────────

export function buildStrategyIntelligence(
  esbResult: Record<string, unknown> | null
): StrategyIntelligence {
  const r = esbResult ?? {};
  return {
    executiveScore:      n(r.executiveScore, 50),
    rulePassRate:        n(r.rulePassRate, 50),
    strategyStrength:    n(r.strategyStrength, 50),
    ruleQualityScore:    n(r.ruleQualityScore, 50),
    overallQualityScore: n(r.overallQualityScore, 50),
    identitySimilarity:  n(r.identitySimilarity, 50),
    marketHealth:        n(r.marketHealth, 50),
    researchConfidence:  n(r.researchConfidence, 50),
    recommendation:      s(r.recommendation, "wait"),
    pair:                s(r.pair, "EURUSD"),
    session:             s(r.session, "london"),
    regime:              s(r.regime, "unknown"),
  };
}

// ─── Market Intelligence (from RI/unified market) ────────────────────────────

export function buildMarketIntelligence(
  marketResult: Record<string, unknown> | null
): MarketIntelligence {
  const r = marketResult ?? {};
  const metrics = (r.metrics ?? {}) as Record<string, unknown>;
  return {
    regime:          s(r.regime ?? r.marketRegime, "unknown"),
    volatility:      n(r.volatilityScore ?? metrics.volatilityRisk, 40),
    liquidity:       n(r.liquidityScore ?? metrics.liquidityRisk, 60),
    correlation:     n(r.correlationRisk ?? metrics.correlationRisk, 30),
    opportunityScore: n(r.opportunityScore, 50),
    marketStability: n(r.stabilityScore ?? r.marketStability, 60),
    trendStrength:   n(r.trendStrength, 50),
    healthScore:     n(r.healthScore ?? r.marketHealthScore, 60),
    pair:            s(r.pair, "EURUSD"),
  };
}

// ─── Risk Intelligence (from ERB status) ──────────────────────────────────────

export function buildRiskIntelligence(
  erbResult: Record<string, unknown> | null
): RiskIntelligence {
  const r = erbResult ?? {};
  return {
    overallRiskScore:        n(r.overallRiskScore, 30),
    survivalScore:           n(r.survivalScore, 75),
    capitalHealthScore:      n(r.capitalHealthScore, 75),
    portfolioStabilityScore: n(r.portfolioStabilityScore, 75),
    brokerReliabilityScore:  n(r.brokerReliabilityScore, 80),
    infrastructureScore:     n(r.infrastructureScore, 85),
    crisisStatus:            s(r.crisisStatus, "none"),
    crisisSeverity:          s(r.crisisSeverity, "none"),
    recommendation:          s(r.recommendation, "trade_normally"),
    survivalModeActive:      Boolean(r.survivalModeActive),
  };
}

// ─── Memory Intelligence ──────────────────────────────────────────────────────

export function buildMemoryIntelligence(
  memoryResult: Record<string, unknown> | null
): MemoryIntelligence {
  const r = memoryResult ?? {};
  return {
    similarTradeCount:   n(r.similarTradeCount ?? r.clusterSize, 0),
    historicalWinRate:   n(r.historicalWinRate ?? r.winRate, 50),
    averageRR:           n(r.averageRR ?? r.avgRR, 1.5),
    patternFrequency:    n(r.patternFrequency ?? r.frequency, 50),
    historicalConfidence: n(r.historicalConfidence ?? r.confidence, 50),
    lessonCount:         n(r.lessonCount ?? r.lessons, 0),
    positiveOutcomeRate: n(r.positiveOutcomeRate ?? r.successRate, 50),
  };
}

// ─── Learning Intelligence ────────────────────────────────────────────────────

export function buildLearningIntelligence(
  learningResult: Record<string, unknown> | null
): LearningIntelligence {
  const r = learningResult ?? {};
  return {
    overallConfidence:       n(r.overallConfidence, 55),
    patternPerformanceScore: n(r.patternPerformanceScore ?? r.winRate, 55),
    predictionReliability:   n(r.predictionReliability, 55),
    performanceDrift:        n(r.performanceDrift ?? r.driftScore, 0),
    validationStatus:        s(r.validationStatus ?? r.status, "unknown"),
    cycleCount:              n(r.cycleCount ?? r.inProcessCycles, 0),
    sampleSize:              n(r.sampleSize ?? r.totalTrades, 0),
  };
}

// ─── Identity Intelligence ────────────────────────────────────────────────────

export function buildIdentityIntelligence(
  identityResult: Record<string, unknown> | null
): IdentityIntelligence {
  const r = identityResult ?? {};
  return {
    identitySimilarityScore:  n(r.identitySimilarityScore ?? r.similarityScore, 60),
    preferenceAlignmentScore: n(r.preferenceAlignmentScore ?? r.alignmentScore, 60),
    historicalConsistency:    n(r.historicalConsistency, 60),
    identityConfidence:       n(r.identityConfidence ?? r.confidenceScore, 55),
    consistencyLevel:         s(r.consistencyLevel, "Moderate"),
    stage:                    s(r.stage, "rule_identity"),
    sampleSize:               n(r.sampleSize, 0),
  };
}

// ─── Research Intelligence (advisory only) ───────────────────────────────────

export function buildResearchIntelligence(
  researchResult: Record<string, unknown> | null
): ResearchIntelligence {
  const r = researchResult ?? {};
  return {
    activeProjects:         n(r.activeProjects ?? r.count, 0),
    researchConfidence:     n(r.researchConfidence, 50),
    candidateImprovements:  n(r.candidateImprovements, 0),
    experimentalResults:    s(r.experimentalResults, "insufficient"),
    isAdvisoryOnly:         true,
  };
}
