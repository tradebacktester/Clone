// ─── Executive Strategy Brain — Explainability Engine ─────────────────────────
// Every recommendation is fully explained. No unexplained score is allowed.
// Generates: supporting rules, historical evidence, market evidence, stats,
// confidence interval, reliability rating, sample size, historical references.

import type {
  ExplainabilityBundle,
  ReliabilityRating,
  RuleEngineSummary,
  StrategyReasoningSummary,
  StrategyQualitySummary,
  TraderIdentitySummary,
  HistoricalIntelligence,
  MarketIntelligenceSummary,
  ResearchIntelligenceSummary,
  EsbScoreBreakdown,
} from "./types.js";

// ─── Wilson score interval ────────────────────────────────────────────────────

function wilsonInterval(successes: number, n: number, z = 1.96): { lower: number; upper: number } {
  if (n === 0) return { lower: 0, upper: 0 };
  const phat = successes / n;
  const denom = 1 + (z * z) / n;
  const centre = phat + (z * z) / (2 * n);
  const spread = z * Math.sqrt((phat * (1 - phat)) / n + (z * z) / (4 * n * n));
  return {
    lower: Math.max(0, Math.round(((centre - spread) / denom) * 1000) / 1000),
    upper: Math.min(1, Math.round(((centre + spread) / denom) * 1000) / 1000),
  };
}

// ─── Reliability rating ───────────────────────────────────────────────────────

function deriveReliability(
  sampleSize:  number,
  dataQuality: number,
  confidence:  number,
): ReliabilityRating {
  if (sampleSize >= 30 && dataQuality >= 80 && confidence >= 75) return "high";
  if (sampleSize >= 10 && dataQuality >= 60 && confidence >= 50) return "moderate";
  if (sampleSize >= 3)                                            return "low";
  return "insufficient";
}

// ─── Supporting rules ─────────────────────────────────────────────────────────

function buildSupportingRules(
  rule:      RuleEngineSummary,
  quality:   StrategyQualitySummary,
  reasoning: StrategyReasoningSummary,
): string[] {
  const lines: string[] = [];

  lines.push(`${rule.passingRules}/${rule.totalRules} rules passing (${rule.rulePassRate.toFixed(1)}%)`);

  if (rule.exceptionalRules > 0)
    lines.push(`${rule.exceptionalRules} exceptional rule${rule.exceptionalRules > 1 ? "s" : ""} met`);

  if (rule.failedRules > 0)
    lines.push(`${rule.failedRules} rule${rule.failedRules > 1 ? "s" : ""} failed — integrity impact`);

  lines.push(`Rule integrity: ${rule.ruleIntegrity.toFixed(1)}/100`);
  lines.push(`Rule confidence: ${rule.ruleConfidence.toFixed(1)}/100`);

  if (quality.structuralQuality >= 70)
    lines.push(`Strong structural quality: ${quality.structuralQuality.toFixed(1)}/100`);

  if (quality.amdQuality >= 70)
    lines.push(`AMD phase quality: ${quality.amdQuality.toFixed(1)}/100`);

  if (reasoning.strongestReasons.length > 0) {
    lines.push(`Strongest reasoning: ${reasoning.strongestReasons.slice(0, 2).join("; ")}`);
  }

  return lines;
}

// ─── Supporting historical evidence ──────────────────────────────────────────

function buildHistoricalEvidence(hist: HistoricalIntelligence): string[] {
  const lines: string[] = [];

  if (hist.sampleSize === 0) {
    lines.push("No historical evidence available — new pattern or insufficient trade history");
    return lines;
  }

  lines.push(`${hist.sampleSize} similar historical trades analysed`);
  lines.push(`Historical win rate: ${(hist.historicalWinRate * 100).toFixed(1)}%`);
  lines.push(`Profit factor: ${hist.profitFactor.toFixed(2)}`);
  lines.push(`Average realised RR: ${hist.averageRR.toFixed(2)}`);
  lines.push(`Historical expectancy: ${hist.historicalExpectancy.toFixed(3)} per unit`);

  if (hist.similarTrades.length > 0) {
    const wins  = hist.similarTrades.filter(t => t.outcome === "win").length;
    const total = hist.similarTrades.length;
    lines.push(`Top similar trades: ${wins}/${total} winners (shown sample)`);
    const topTrade = hist.similarTrades[0];
    if (topTrade) {
      lines.push(`Closest match: ${topTrade.pair} ${topTrade.session} — ${topTrade.outcome}, RR ${topTrade.rrActual.toFixed(2)} (similarity ${(topTrade.similarity * 100).toFixed(1)}%)`);
    }
  }

  return lines;
}

// ─── Supporting market evidence ───────────────────────────────────────────────

function buildMarketEvidence(
  mkt:      MarketIntelligenceSummary,
  research: ResearchIntelligenceSummary,
): string[] {
  const lines: string[] = [];

  lines.push(`Market health: ${mkt.marketHealth.toFixed(1)}/100`);
  lines.push(`Opportunity score: ${mkt.opportunityScore.toFixed(1)}/100`);
  lines.push(`Market regime: ${mkt.marketRegime} (trend: ${mkt.trend})`);
  lines.push(`Volatility: ${mkt.volatility.toFixed(1)}/100, Liquidity: ${mkt.liquidity.toFixed(1)}/100`);
  lines.push(`Correlation risk: ${mkt.correlation.toFixed(1)}/100, Stability: ${mkt.stability.toFixed(1)}/100`);

  if (research.activeHypotheses > 0)
    lines.push(`Research active: ${research.activeHypotheses} open hypothesis${research.activeHypotheses > 1 ? "es" : ""}`);

  if (research.pendingDeploymentRequests > 0)
    lines.push(`${research.pendingDeploymentRequests} pending deployment request${research.pendingDeploymentRequests > 1 ? "s" : ""} — advisory, not deployed`);

  return lines;
}

// ─── Supporting statistical evidence ─────────────────────────────────────────

function buildStatisticalEvidence(
  hist:      HistoricalIntelligence,
  breakdown: EsbScoreBreakdown,
): string[] {
  const lines: string[] = [];

  const ci = wilsonInterval(
    Math.round(hist.historicalWinRate * hist.sampleSize),
    hist.sampleSize,
  );

  lines.push(`Wilson 95% CI for win rate: [${(ci.lower * 100).toFixed(1)}%, ${(ci.upper * 100).toFixed(1)}%]`);
  lines.push(`Executive Score components sum: ${breakdown.total.toFixed(1)}/100`);
  lines.push(`Sample size: ${hist.sampleSize} trade${hist.sampleSize !== 1 ? "s" : ""}`);
  lines.push(`Minimum evidence threshold: 3 (met: ${hist.sampleSize >= 3 ? "yes" : "no"})`);
  lines.push(`High-evidence threshold: 20 (met: ${hist.sampleSize >= 20 ? "yes" : "no"})`);

  if (hist.profitFactor > 0)
    lines.push(`Profit factor ${hist.profitFactor.toFixed(2)} — ${hist.profitFactor >= 2 ? "above" : "below"} 2.0 target`);

  return lines;
}

// ─── Master explainer ─────────────────────────────────────────────────────────

export function buildExplainability(
  breakdown: EsbScoreBreakdown,
  rule:      RuleEngineSummary,
  reasoning: StrategyReasoningSummary,
  quality:   StrategyQualitySummary,
  ti:        TraderIdentitySummary,
  hist:      HistoricalIntelligence,
  mkt:       MarketIntelligenceSummary,
  research:  ResearchIntelligenceSummary,
): ExplainabilityBundle {
  const ci = wilsonInterval(
    Math.round(hist.historicalWinRate * hist.sampleSize),
    hist.sampleSize,
  );

  const reliability = deriveReliability(
    hist.sampleSize,
    breakdown.dataQuality.raw,
    reasoning.confidence,
  );

  return {
    supportingRules:                buildSupportingRules(rule, quality, reasoning),
    supportingHistoricalEvidence:   buildHistoricalEvidence(hist),
    supportingMarketEvidence:       buildMarketEvidence(mkt, research),
    supportingStatisticalEvidence:  buildStatisticalEvidence(hist, breakdown),
    confidenceInterval: { lower: ci.lower * 100, upper: ci.upper * 100 },
    reliabilityRating:  reliability,
    sampleSize:         hist.sampleSize,
    historicalReferences: hist.similarTrades.slice(0, 10),
  };
}
