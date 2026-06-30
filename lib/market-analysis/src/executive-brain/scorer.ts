// ─── Executive Strategy Brain — Scorer ────────────────────────────────────────
// Computes the Executive Strategy Score (0–100) with fully transparent,
// configurable weights. Every input dimension is clamped and documented.

import type {
  EsbScoreWeights,
  EsbScoreBreakdown,
  DEFAULT_SCORE_WEIGHTS,
  RuleEngineSummary,
  StrategyReasoningSummary,
  StrategyQualitySummary,
  TraderIdentitySummary,
  HistoricalIntelligence,
  MarketIntelligenceSummary,
} from "./types.js";

import { DEFAULT_SCORE_WEIGHTS as _DEFAULT } from "./types.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function clamp(v: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, isFinite(v) ? v : 0));
}

function pct(v: number): number { return clamp(v * 100); }

// ─── Sub-scorers ──────────────────────────────────────────────────────────────

/**
 * Rule quality: blend pass rate + integrity + confidence.
 * All inputs already 0–100.
 */
export function scoreRuleQuality(rule: RuleEngineSummary): number {
  const passRate  = clamp(rule.rulePassRate);
  const integrity = clamp(rule.ruleIntegrity);
  const conf      = clamp(rule.ruleConfidence);
  // Penalise zero rules
  if (rule.totalRules === 0) return 0;
  const base = passRate * 0.45 + integrity * 0.35 + conf * 0.20;
  // Bonus for exceptional rules
  const exceptionalBonus = Math.min(5, rule.exceptionalRules * 1.5);
  return clamp(base + exceptionalBonus);
}

/**
 * Strategy strength: already normalised 0–100 from reasoning engine.
 * Confidence acts as a reliability multiplier.
 */
export function scoreStrategyStrength(reasoning: StrategyReasoningSummary): number {
  const s = clamp(reasoning.strategyStrength);
  const c = clamp(reasoning.confidence) / 100;
  // Dampen by confidence so low-confidence reports are penalised
  return clamp(s * (0.70 + 0.30 * c));
}

/**
 * Historical evidence: win rate, profit factor, expectancy, sample size.
 * Sample size applies a reliability discount for n < 20.
 */
export function scoreHistoricalEvidence(hist: HistoricalIntelligence): number {
  const n = hist.sampleSize;
  if (n === 0) return 0;

  const sampleMultiplier = Math.min(1, n / 20); // full weight at 20+ trades

  const winRateScore   = pct(hist.historicalWinRate);    // 0–100
  const pfScore        = clamp(((hist.profitFactor - 1) / 2) * 100); // PF 1→0, 3→100
  const expectancyScore = clamp(((hist.historicalExpectancy + 1) / 3) * 100); // -1→0, 2→100
  const rrScore        = clamp(((hist.averageRR - 1) / 3) * 100); // RR 1→0, 4→100

  const base = winRateScore * 0.35 + pfScore * 0.25 + expectancyScore * 0.25 + rrScore * 0.15;
  return clamp(base * sampleMultiplier);
}

/**
 * Market intelligence: health, opportunity, stability, liquidity.
 */
export function scoreMarketIntelligence(mkt: MarketIntelligenceSummary): number {
  const health      = clamp(mkt.marketHealth);
  const opportunity = clamp(mkt.opportunityScore);
  const stability   = clamp(mkt.stability);
  const liquidity   = clamp(mkt.liquidity);
  return clamp(
    health * 0.35 + opportunity * 0.30 + stability * 0.20 + liquidity * 0.15,
  );
}

/**
 * Trader identity: similarity + preference alignment + consistency.
 * Drift penalty applied when drift detected.
 */
export function scoreTraderIdentity(ti: TraderIdentitySummary): number {
  const sim   = clamp(ti.identitySimilarity);
  const pref  = clamp(ti.preferenceAlignment);
  const cons  = clamp(ti.historicalConsistency);

  const base = sim * 0.40 + pref * 0.35 + cons * 0.25;
  const driftPenalty = ti.driftStatus === "drifting" ? 8
                     : ti.driftStatus === "warning"  ? 4
                     : 0;
  return clamp(base - driftPenalty);
}

/**
 * Confidence: geometric mean of reasoning confidence + sample reliability.
 */
export function scoreConfidence(
  reasoning: StrategyReasoningSummary,
  hist: HistoricalIntelligence,
): number {
  const reasoningConf = clamp(reasoning.confidence);
  const sampleConf    = clamp(Math.min(100, (hist.sampleSize / 30) * 100));
  return clamp(reasoningConf * 0.65 + sampleConf * 0.35);
}

/**
 * Data quality: availability of all subsystem outputs.
 * Each missing subsystem deducts points.
 */
export function scoreDataQuality(
  rule: RuleEngineSummary,
  reasoning: StrategyReasoningSummary,
  quality: StrategyQualitySummary,
  ti: TraderIdentitySummary,
  hist: HistoricalIntelligence,
  mkt: MarketIntelligenceSummary,
): number {
  let score = 100;
  if (rule.totalRules === 0)                score -= 20;
  if (!reasoning.reportId)                  score -= 15;
  if (!quality.reportId)                    score -= 15;
  if (!ti.reportId)                         score -= 15;
  if (hist.sampleSize === 0)               score -= 20;
  if (mkt.marketHealth === 0)               score -= 15;
  return clamp(score);
}

// ─── Master scorer ────────────────────────────────────────────────────────────

export interface ScorerInputs {
  rule:      RuleEngineSummary;
  reasoning: StrategyReasoningSummary;
  quality:   StrategyQualitySummary;
  ti:        TraderIdentitySummary;
  hist:      HistoricalIntelligence;
  mkt:       MarketIntelligenceSummary;
  weights?:  Partial<EsbScoreWeights>;
}

export function computeExecutiveScore(inputs: ScorerInputs): {
  executiveScore: number;
  weights: EsbScoreWeights;
  breakdown: EsbScoreBreakdown;
} {
  const w: EsbScoreWeights = {
    ..._DEFAULT,
    ...inputs.weights,
  };

  // Ensure weights sum to 1 (normalise in case of partial override)
  const wSum = Object.values(w).reduce((a, b) => a + b, 0);
  const wNorm: EsbScoreWeights = wSum === 0 ? { ..._DEFAULT } : {
    ruleQuality:        w.ruleQuality        / wSum,
    strategyStrength:   w.strategyStrength   / wSum,
    historicalEvidence: w.historicalEvidence / wSum,
    marketIntelligence: w.marketIntelligence / wSum,
    traderIdentity:     w.traderIdentity     / wSum,
    confidence:         w.confidence         / wSum,
    dataQuality:        w.dataQuality        / wSum,
  };

  const rawRuleQuality        = scoreRuleQuality(inputs.rule);
  const rawStrategyStrength   = scoreStrategyStrength(inputs.reasoning);
  const rawHistoricalEvidence = scoreHistoricalEvidence(inputs.hist);
  const rawMarketIntelligence = scoreMarketIntelligence(inputs.mkt);
  const rawTraderIdentity     = scoreTraderIdentity(inputs.ti);
  const rawConfidence         = scoreConfidence(inputs.reasoning, inputs.hist);
  const rawDataQuality        = scoreDataQuality(
    inputs.rule, inputs.reasoning, inputs.quality, inputs.ti, inputs.hist, inputs.mkt,
  );

  const breakdown: EsbScoreBreakdown = {
    ruleQuality:        { raw: rawRuleQuality,        weighted: rawRuleQuality        * wNorm.ruleQuality,        weight: wNorm.ruleQuality },
    strategyStrength:   { raw: rawStrategyStrength,   weighted: rawStrategyStrength   * wNorm.strategyStrength,   weight: wNorm.strategyStrength },
    historicalEvidence: { raw: rawHistoricalEvidence, weighted: rawHistoricalEvidence * wNorm.historicalEvidence, weight: wNorm.historicalEvidence },
    marketIntelligence: { raw: rawMarketIntelligence, weighted: rawMarketIntelligence * wNorm.marketIntelligence, weight: wNorm.marketIntelligence },
    traderIdentity:     { raw: rawTraderIdentity,     weighted: rawTraderIdentity     * wNorm.traderIdentity,     weight: wNorm.traderIdentity },
    confidence:         { raw: rawConfidence,         weighted: rawConfidence         * wNorm.confidence,         weight: wNorm.confidence },
    dataQuality:        { raw: rawDataQuality,        weighted: rawDataQuality        * wNorm.dataQuality,        weight: wNorm.dataQuality },
    total: 0,
  };

  const total = clamp(
    breakdown.ruleQuality.weighted +
    breakdown.strategyStrength.weighted +
    breakdown.historicalEvidence.weighted +
    breakdown.marketIntelligence.weighted +
    breakdown.traderIdentity.weighted +
    breakdown.confidence.weighted +
    breakdown.dataQuality.weighted,
  );
  breakdown.total = total;

  return { executiveScore: Math.round(total * 10) / 10, weights: wNorm, breakdown };
}
