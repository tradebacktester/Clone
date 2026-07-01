// ─── Adaptive Risk Intelligence Engine — Main ─────────────────────────────────
// Continuously learns how market environments affect risk and adapts parameters.
// Advisory only. NEVER modifies strategy, entry/exit rules, or research pipeline.

import { randomUUID } from "crypto";
import type {
  RunAriInput, AdaptiveRiskReport, ProfileRecommendation,
  MarketAnalysisResult, EnvironmentStats, EvidenceItem, RiskProfile,
} from "./types.js";
import { ARI_ENGINE_VERSION, RISK_PROFILE_LABELS } from "./types.js";
import { learnByRegime }                       from "./regime-learner.js";
import { learnByVolatility }                   from "./volatility-learner.js";
import { learnBySession }                      from "./session-learner.js";
import { profileByPair }                       from "./pair-profiler.js";
import { learnByLiquidity, learnByCondition }  from "./liquidity-learner.js";
import { computeConfidence, buildEvidenceItems, hasEnoughEvidence } from "./confidence-engine.js";
import { selectProfile }                       from "./profile-engine.js";
import { generateRecommendations }             from "./recommendation-engine.js";
import { buildExplainability, buildExpectedBenefitsList, buildPotentialRisksList } from "./explainer.js";

// Re-exports for consumers
export { ARI_ENGINE_VERSION }            from "./types.js";
export { learnByRegime }                 from "./regime-learner.js";
export { learnByVolatility }             from "./volatility-learner.js";
export { learnBySession }                from "./session-learner.js";
export { profileByPair }                 from "./pair-profiler.js";
export { learnByLiquidity, learnByCondition } from "./liquidity-learner.js";
export { computeConfidence }             from "./confidence-engine.js";
export { selectProfile }                 from "./profile-engine.js";
export { generateRecommendations }       from "./recommendation-engine.js";

export type {
  RunAriInput, AdaptiveRiskReport, ProfileRecommendation,
  MarketAnalysisResult, EnvironmentStats, EvidenceItem, RiskProfile,
  MarketContext, RiskParameters, ConfidenceResult, AdaptationEvent,
} from "./types.js";

// ─── Default context builder ──────────────────────────────────────────────────

export function defaultMarketContext(pair = "EURUSD"): import("./types.js").MarketContext {
  return {
    pair,
    session:         "london",
    regime:          "trending",
    volatilityLevel: "normal",
    liquidityLevel:  "high",
    condition:       "normal",
    volatilityScore: 40,
    liquidityScore:  70,
    trendStrength:   60,
    newsRisk:        20,
  };
}

// ─── Main engine ──────────────────────────────────────────────────────────────

export async function runAdaptiveRiskEngine(input: RunAriInput): Promise<AdaptiveRiskReport> {
  const reportId  = randomUUID();
  const { trades, context, currentProfile = null, userSafetyLimits } = input;

  // ── 1. Learn from each environment dimension ─────────────────────────────
  const regimeStats    = learnByRegime(trades);
  const volatilityStats = learnByVolatility(trades);
  const sessionStats   = learnBySession(trades);
  const pairStats      = profileByPair(trades);
  const liquidityStats = learnByLiquidity(trades);
  const conditionStats = learnByCondition(trades);

  const allStats: EnvironmentStats[] = [
    ...regimeStats,
    ...volatilityStats,
    ...sessionStats,
    ...pairStats,
    ...liquidityStats,
    ...conditionStats,
  ];

  // ── 2. Find stats most relevant to current context ───────────────────────
  const contextualStats: EnvironmentStats[] = [
    regimeStats.find(s => s.environmentKey === context.regime)    ?? null,
    volatilityStats.find(s => s.environmentKey === context.volatilityLevel) ?? null,
    sessionStats.find(s => s.environmentKey === context.session)  ?? null,
    pairStats.find(s => s.environmentKey === context.pair)        ?? null,
    liquidityStats.find(s => s.environmentKey === context.liquidityLevel) ?? null,
  ].filter((s): s is EnvironmentStats => s !== null);

  // ── 3. Build evidence items ──────────────────────────────────────────────
  const evidenceItems: EvidenceItem[] = buildEvidenceItems(contextualStats);

  // ── 4. Compute confidence ────────────────────────────────────────────────
  const confidence = computeConfidence(trades, evidenceItems);

  // ── 5. Select profile ────────────────────────────────────────────────────
  const selection = selectProfile(context, contextualStats, confidence, currentProfile, userSafetyLimits);

  // ── 6. Generate parameter recommendations ────────────────────────────────
  const recommendations = generateRecommendations(
    selection.profile, selection.params, context, contextualStats, confidence, currentProfile,
  );

  // ── 7. Build explainability ──────────────────────────────────────────────
  const explainability = buildExplainability(
    selection.profile, selection.score, context, contextualStats, confidence, selection.params,
  );

  // ── 8. Build market analysis result ─────────────────────────────────────
  const overallRiskScore = contextualStats.length > 0
    ? Math.round(contextualStats.reduce((s, v) => s + v.riskScore, 0) / contextualStats.length)
    : 50;

  const marketAnalysis: MarketAnalysisResult = {
    currentContext:   context,
    regimeStats:      regimeStats.find(s => s.environmentKey === context.regime) ?? null,
    volatilityStats:  volatilityStats.find(s => s.environmentKey === context.volatilityLevel) ?? null,
    sessionStats:     sessionStats.find(s => s.environmentKey === context.session) ?? null,
    liquidityStats:   liquidityStats.find(s => s.environmentKey === context.liquidityLevel) ?? null,
    conditionStats:   conditionStats[0] ?? null,
    pairStats:        pairStats.find(s => s.environmentKey === context.pair) ?? null,
    overallRiskScore,
    favorabilityLabel: overallRiskScore >= 70 ? "Favorable" : overallRiskScore >= 50 ? "Neutral" : overallRiskScore >= 30 ? "Unfavorable" : "Avoid",
    topRiskFactors: selection.factors.filter(f => f.toLowerCase().includes("risk") || f.toLowerCase().includes("avoid") || f.toLowerCase().includes("volatile")),
    topOpportunities: selection.factors.filter(f => f.toLowerCase().includes("favor") || f.toLowerCase().includes("support")),
  };

  // ── 9. Build full profile recommendation ─────────────────────────────────
  const profileChanged  = currentProfile !== null && currentProfile !== selection.profile;
  const profileRec: ProfileRecommendation = {
    recommendedProfile:      selection.profile,
    recommendedProfileLabel: selection.label,
    previousProfile:         currentProfile,
    profileChanged,

    parameters:  selection.params,
    confidence,

    primaryReason:     selection.reason,
    supportingReasons: selection.factors,
    riskFactors:       buildPotentialRisksList(selection.profile, context),
    expectedBenefits:  buildExpectedBenefitsList(selection.profile, selection.params),
    potentialRisks:    buildPotentialRisksList(selection.profile, context),

    marketContext:       context,
    evidence:            evidenceItems,
    explainability,
    historicalEvidence:  contextualStats,
  };

  return {
    reportId,
    engineVersion: ARI_ENGINE_VERSION,
    generatedAt:   new Date().toISOString(),
    isAdvisoryOnly: true,

    recommendation:  profileRec,
    marketAnalysis,
    allEnvironmentStats: allStats,

    summary: {
      profileName:     selection.label,
      confidence:      confidence.score,
      sampleSize:      confidence.sampleSize,
      topReason:       selection.reason,
      safeToTrade:     ["balanced", "aggressive", "conservative"].includes(selection.profile),
      reduceExposure:  ["observation", "recovery", "emergency", "conservative"].includes(selection.profile),
      observationMode: selection.profile === "observation" || selection.profile === "emergency",
    },
  };
}
