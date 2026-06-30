// ─── Trader Identity — Similarity Calculator ──────────────────────────────────
// Computes Rule, Historical, Preference, and Identity similarity scores.

import {
  clamp,
  cosineSimilarity,
  featureVector,
  SIMILARITY_WEIGHTS,
} from "./types.js";
import type {
  IdentitySetup,
  IdentityFeature,
  AdaptiveIdentityResult,
  RuleIdentityResult,
  RuleSimilarityResult,
  HistoricalSimilarityResult,
  PreferenceAlignmentResult,
  IdentitySimilarityScore,
  SimilarHistoricalTrade,
} from "./types.js";

// ─── Rule Similarity ──────────────────────────────────────────────────────────
// Re-expresses rule checks as a 0–100 similarity score.

export function computeRuleSimilarity(
  ruleResult: RuleIdentityResult,
): RuleSimilarityResult {
  const score = clamp(ruleResult.ruleBaselineScore);
  const passing = ruleResult.passingRules;
  const total   = ruleResult.totalRules;

  const summary = score >= 85
    ? `Rule identity fully met — ${passing}/${total} rules aligned. Strategy footprint clearly present.`
    : score >= 70
    ? `Strong rule alignment — ${passing}/${total} rules met. Minor deviations only.`
    : score >= 55
    ? `Partial rule alignment — ${passing}/${total} rules met. Notable gaps in strategy adherence.`
    : `Weak rule alignment — ${passing}/${total} rules met. Setup deviates significantly from rule identity.`;

  return {
    score,
    details: ruleResult.checks,
    summary,
  };
}

// ─── Historical Similarity ────────────────────────────────────────────────────
// Finds the most similar historical trades via cosine similarity, returns
// an aggregated score and the top-K matches.

const TOP_K = 8;

export function computeHistoricalSimilarity(
  setup: IdentitySetup,
  features: IdentityFeature[],
): HistoricalSimilarityResult {
  if (features.length === 0) {
    return {
      score:         50,   // neutral when no history — not penalised
      sampleSize:    0,
      similarTrades: [],
      summary:       "No historical trades available — similarity defaulted to neutral.",
    };
  }

  const setupVec = featureVector(
    setup.supplyQuality, setup.demandQuality, setup.liquidityScore,
    setup.amdScore, setup.confirmationQuality, setup.setupScore, setup.tqi,
  );

  const scored: Array<{ trade: IdentityFeature; sim: number }> = features.map(t => ({
    trade: t,
    sim:   cosineSimilarity(
      setupVec,
      featureVector(
        t.supplyQuality, t.demandQuality, t.liquidityScore,
        t.amdScore, t.confirmationQuality, t.setupScore, t.tqi,
      ),
    ),
  }));

  scored.sort((a, b) => b.sim - a.sim);

  const topK = scored.slice(0, TOP_K);
  const avgSim = topK.reduce((s, e) => s + e.sim, 0) / topK.length;

  const similarTrades: SimilarHistoricalTrade[] = topK.map(e => ({
    tradeId:    e.trade.tradeId,
    pair:       e.trade.pair,
    session:    e.trade.session,
    regime:     e.trade.marketRegime,
    outcome:    e.trade.outcome,
    rrActual:   e.trade.rrActual,
    similarity: clamp(e.sim),
    openedAt:   e.trade.openedAt,
  }));

  // Bonus: if top matches are winners, similarity is more valuable
  const winnerBonus = topK.filter(e => e.trade.outcome === "win").length / topK.length;
  const score = clamp(avgSim * 0.85 + winnerBonus * 15);

  const summary = features.length >= 10
    ? `${features.length} historical trades analysed — top match similarity ${avgSim.toFixed(1)}%, ${Math.round(winnerBonus * 100)}% of top ${topK.length} matches were winners.`
    : `${features.length} historical trades — limited history, similarity estimate less reliable.`;

  return { score, sampleSize: features.length, similarTrades, summary };
}

// ─── Preference Alignment ─────────────────────────────────────────────────────
// Measures how well the current setup aligns with the discovered identity
// preferences. Neutral (50) when no preferences are adopted.

export function computePreferenceAlignment(
  setup: IdentitySetup,
  adaptive: AdaptiveIdentityResult,
): PreferenceAlignmentResult {
  if (adaptive.stage === "rule_identity" || adaptive.discoveries.length === 0) {
    return {
      score:     50,
      aligned:   [],
      misaligned:[],
      neutral:   ["No adaptive preferences yet — in Stage 1 rule identity."],
      details:   [],
      summary:   "Identity is in Stage 1 (Rule Identity). Preference alignment not yet available.",
    };
  }

  const aligned:    string[] = [];
  const misaligned: string[] = [];
  const neutral:    string[] = [];
  const details: PreferenceAlignmentResult["details"] = [];

  // ── Pair preference ──
  if (adaptive.preferredPairs.length > 0) {
    const isPref = adaptive.preferredPairs.includes(setup.pair);
    const score  = isPref ? 90 : 35;
    if (isPref) aligned.push(`Pair: ${setup.pair}`);
    else misaligned.push(`Pair: ${setup.pair} (preferred: ${adaptive.preferredPairs.join(", ")})`);
    details.push({ dimension: "Currency Pair", score, reason: isPref ? "Preferred pair." : "Non-preferred pair." });
  } else {
    neutral.push("Pair (no preference discovered)");
    details.push({ dimension: "Currency Pair", score: 50, reason: "No pair preference data." });
  }

  // ── Session preference ──
  if (adaptive.preferredSessions.length > 0) {
    const isPref = adaptive.preferredSessions.includes(setup.session);
    const score  = isPref ? 90 : 40;
    if (isPref) aligned.push(`Session: ${setup.session}`);
    else misaligned.push(`Session: ${setup.session}`);
    details.push({ dimension: "Trading Session", score, reason: isPref ? "Preferred session." : "Non-preferred session." });
  } else {
    neutral.push("Session (no preference discovered)");
    details.push({ dimension: "Trading Session", score: 50, reason: "No session preference data." });
  }

  // ── Regime preference ──
  if (adaptive.preferredRegimes.length > 0) {
    const isPref = adaptive.preferredRegimes.includes(setup.regime);
    const score  = isPref ? 85 : 45;
    if (isPref) aligned.push(`Regime: ${setup.regime}`);
    else misaligned.push(`Regime: ${setup.regime}`);
    details.push({ dimension: "Market Regime", score, reason: isPref ? "Preferred regime." : "Non-preferred regime." });
  } else {
    neutral.push("Regime (no preference discovered)");
    details.push({ dimension: "Market Regime", score: 50, reason: "No regime preference data." });
  }

  // ── Volatility preference ──
  if (adaptive.preferredVolatility) {
    const isPref = adaptive.preferredVolatility === setup.volatility;
    const score  = isPref ? 85 : 45;
    if (isPref) aligned.push(`Volatility: ${setup.volatility}`);
    else misaligned.push(`Volatility: ${setup.volatility} (preferred: ${adaptive.preferredVolatility})`);
    details.push({ dimension: "Volatility", score, reason: isPref ? "Preferred volatility." : "Non-preferred volatility." });
  } else {
    neutral.push("Volatility (no preference discovered)");
    details.push({ dimension: "Volatility", score: 50, reason: "No volatility preference data." });
  }

  // ── Trend preference ──
  if (adaptive.preferredTrend) {
    const isPref = adaptive.preferredTrend === setup.trend;
    const score  = isPref ? 85 : 45;
    if (isPref) aligned.push(`Trend: ${setup.trend}`);
    else misaligned.push(`Trend: ${setup.trend} (preferred: ${adaptive.preferredTrend})`);
    details.push({ dimension: "Trend Condition", score, reason: isPref ? "Preferred trend condition." : "Non-preferred trend condition." });
  } else {
    neutral.push("Trend (no preference discovered)");
    details.push({ dimension: "Trend Condition", score: 50, reason: "No trend preference data." });
  }

  // ── Setup quality vs identity average ──
  if (adaptive.avgSetupScore > 0) {
    const delta = setup.setupScore - adaptive.avgSetupScore;
    const score = clamp(50 + delta * 0.6);
    details.push({
      dimension: "Setup Score vs Identity Average",
      score,
      reason: delta >= 5 ? "Above identity average." : delta >= -5 ? "Near identity average." : "Below identity average.",
    });
    if (delta >= 5) aligned.push("Setup score above identity average");
    else if (delta < -10) misaligned.push("Setup score well below identity average");
    else neutral.push("Setup score near identity average");
  }

  const avgScore = details.reduce((s, d) => s + d.score, 0) / details.length;
  const score    = clamp(avgScore);

  const summary = aligned.length >= 4
    ? `Strong preference alignment — ${aligned.length} dimensions match identity preferences.`
    : aligned.length >= 2
    ? `Partial preference alignment — ${aligned.length} aligned, ${misaligned.length} misaligned.`
    : `Weak preference alignment — ${misaligned.length} dimensions diverge from identity preferences.`;

  return { score, aligned, misaligned, neutral, details, summary };
}

// ─── Identity Similarity Composite ────────────────────────────────────────────

export function computeIdentitySimilarity(
  rule:        RuleSimilarityResult,
  historical:  HistoricalSimilarityResult,
  preference:  PreferenceAlignmentResult,
  adaptive:    AdaptiveIdentityResult,
): IdentitySimilarityScore {
  const w = SIMILARITY_WEIGHTS;

  // In Stage 1 shift preference weight to rule
  const ruleWeight = adaptive.stage === "rule_identity"
    ? w.rule + w.preference
    : w.rule;
  const prefWeight = adaptive.stage === "rule_identity" ? 0 : w.preference;

  const identitySimilarityScore = clamp(
    rule.score       * ruleWeight     +
    historical.score * w.historical   +
    preference.score * prefWeight,
  );

  // Statistical confidence grows with history
  const historicalFactor = Math.min(historical.sampleSize / 100, 1.0);
  const adaptiveFactor   = adaptive.stage === "adaptive_identity"
    ? Math.min(adaptive.confidenceScore / 100, 1.0)
    : 0.3;
  const statisticalConfidence = clamp((historicalFactor * 0.6 + adaptiveFactor * 0.4) * 100);

  return {
    ruleSimilarityScore:       clamp(rule.score),
    historicalSimilarityScore: clamp(historical.score),
    preferenceAlignmentScore:  clamp(preference.score),
    identitySimilarityScore,
    statisticalConfidence,
    historicalSampleSize:      historical.sampleSize,
  };
}
