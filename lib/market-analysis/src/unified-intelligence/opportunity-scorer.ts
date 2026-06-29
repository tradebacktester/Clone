// ─── Market Opportunity Scorer ─────────────────────────────────────────────────
// Advisory only. No trade execution. No strategy modification.
// Measures whether the current market environment has historically been favorable
// for the deterministic strategy. Does NOT indicate direction (buy/sell).

import type { FeatureRow, OpportunityScoreBreakdown, OpportunityLabel } from "./types.js";

// ─── Factor weights (sum to 1.0) ──────────────────────────────────────────────
const WEIGHTS = {
  regime:     0.20,
  trend:      0.18,
  liquidity:  0.16,
  volatility: 0.15,
  historical: 0.15,
  stability:  0.10,
  confidence: 0.06,
} as const;

// ─── Factor scorers ────────────────────────────────────────────────────────────

function scoreRegimeFactor(features: FeatureRow[]): { score: number; description: string } {
  if (features.length === 0) return { score: 50, description: "No data available" };
  const recent = features.slice(-20);

  const regimeCounts: Record<string, number> = {};
  for (const f of recent) {
    regimeCounts[f.marketRegime] = (regimeCounts[f.marketRegime] || 0) + 1;
  }

  const dominant = Object.entries(regimeCounts).sort((a, b) => b[1] - a[1])[0];
  const dominantRegime = dominant?.[0] ?? "unknown";
  const dominantRatio = (dominant?.[1] ?? 0) / recent.length;

  // Regime scores for strategy favorability (based on historical SMC performance)
  const regimeScores: Record<string, number> = {
    trending: 82,
    low_volatility: 72,
    ranging: 58,
    volatile: 40,
    unknown: 50,
  };

  const baseScore = regimeScores[dominantRegime] ?? 50;
  // Adjust for consistency: dominant regime = higher consistency bonus
  const consistencyBonus = dominantRatio > 0.75 ? 8 : dominantRatio > 0.5 ? 4 : 0;
  const score = Math.min(100, Math.round(baseScore + consistencyBonus));

  return {
    score,
    description: `Dominant regime: ${dominantRegime} (${(dominantRatio * 100).toFixed(0)}% of recent bars). Base favorability: ${baseScore}/100.`,
  };
}

function scoreTrendFactor(features: FeatureRow[]): { score: number; description: string } {
  if (features.length === 0) return { score: 50, description: "No data available" };
  const recent = features.slice(-20);

  const avgSetup = recent.reduce((s, f) => s + f.setupScore, 0) / recent.length;
  const avgTqi = recent.reduce((s, f) => s + f.tqi, 0) / recent.length;

  // Clear trend (non-neutral) = better opportunity
  const trends = recent.map(f => f.trend);
  const bullishCount = trends.filter(t => t === "bullish" || t === "up").length;
  const bearishCount = trends.filter(t => t === "bearish" || t === "down").length;
  const dominantTrendRatio = Math.max(bullishCount, bearishCount) / recent.length;

  const trendClarityScore = dominantTrendRatio * 80 + 20;
  const score = Math.round((avgSetup * 0.4 + avgTqi * 0.35 + trendClarityScore * 0.25));

  return {
    score,
    description: `Setup quality: ${avgSetup.toFixed(1)}/100. TQI: ${avgTqi.toFixed(1)}/100. Trend clarity: ${(dominantTrendRatio * 100).toFixed(0)}%.`,
  };
}

function scoreLiquidityFactor(features: FeatureRow[]): { score: number; description: string } {
  if (features.length === 0) return { score: 50, description: "No data available" };
  const recent = features.slice(-20);

  const avgLiquidity = recent.reduce((s, f) => s + f.liquidityScore, 0) / recent.length;
  const avgSpread = recent.reduce((s, f) => s + f.spreadPips, 0) / recent.length;

  // High liquidity + tight spread = better opportunity
  const liquidityBonus = avgLiquidity;
  const spreadPenalty = Math.min(40, avgSpread * 8);
  const score = Math.round(Math.max(0, Math.min(100, liquidityBonus - spreadPenalty)));

  return {
    score,
    description: `Average liquidity: ${avgLiquidity.toFixed(1)}/100. Average spread: ${avgSpread.toFixed(2)} pips (penalty: -${spreadPenalty.toFixed(0)}).`,
  };
}

function scoreVolatilityFactor(features: FeatureRow[]): { score: number; description: string } {
  if (features.length === 0) return { score: 50, description: "No data available" };
  const recent = features.slice(-20);

  const volCounts = { low: 0, medium: 0, high: 0 };
  for (const f of recent) {
    if (f.volatility === "low") volCounts.low++;
    else if (f.volatility === "medium") volCounts.medium++;
    else volCounts.high++;
  }
  const total = recent.length;

  // Medium volatility is optimal for the strategy
  const mediumRatio = volCounts.medium / total;
  const lowRatio = volCounts.low / total;
  const highRatio = volCounts.high / total;

  // Medium optimal (85), low moderate (60), high poor (25)
  const score = Math.round(mediumRatio * 85 + lowRatio * 60 + highRatio * 25);

  return {
    score,
    description: `Volatility distribution — Low: ${(lowRatio * 100).toFixed(0)}%, Medium: ${(mediumRatio * 100).toFixed(0)}%, High: ${(highRatio * 100).toFixed(0)}%.`,
  };
}

function scoreHistoricalFactor(features: FeatureRow[]): { score: number; description: string } {
  const completed = features.filter(f => f.outcome === "win" || f.outcome === "loss");
  if (completed.length < 10) {
    return { score: 50, description: `Insufficient completed trades for historical scoring (${completed.length} < 10)` };
  }

  const wins = completed.filter(f => f.outcome === "win").length;
  const losses = completed.filter(f => f.outcome === "loss").length;
  const winRate = wins / completed.length;

  const grossProfit = completed.filter(f => f.pnl > 0).reduce((s, f) => s + f.pnl, 0);
  const grossLoss = Math.abs(completed.filter(f => f.pnl < 0).reduce((s, f) => s + f.pnl, 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 3 : 1;

  // Score: WR 60% = 70pts, WR 50% = 50pts; PF 2.0 = 80pts, PF 1.5 = 60pts
  const wrScore = Math.min(100, winRate * 120);
  const pfScore = Math.min(100, (profitFactor / 3) * 100);

  const score = Math.round(wrScore * 0.55 + pfScore * 0.45);

  return {
    score,
    description: `Historical: ${wins}W/${losses}L (WR: ${(winRate * 100).toFixed(1)}%), PF: ${profitFactor.toFixed(2)}. Sample: ${completed.length} trades.`,
  };
}

function scoreStabilityFactor(features: FeatureRow[]): { score: number; description: string } {
  if (features.length < 5) return { score: 50, description: "Insufficient data" };
  const recent = features.slice(-20);

  const regimes = recent.map(f => f.marketRegime);
  const uniqueRegimes = new Set(regimes).size;
  const regimeConsistency = Math.max(0, 100 - (uniqueRegimes - 1) * 25);

  const avgSupplyDemand = recent.reduce((s, f) => s + (f.supplyQuality + f.demandQuality) / 2, 0) / recent.length;

  const score = Math.round(regimeConsistency * 0.5 + avgSupplyDemand * 0.5);

  return {
    score,
    description: `Regime consistency: ${regimeConsistency}/100 (${uniqueRegimes} unique regimes). Supply/demand quality: ${avgSupplyDemand.toFixed(1)}/100.`,
  };
}

function scoreConfidenceFactor(features: FeatureRow[]): { score: number; description: string } {
  if (features.length === 0) return { score: 50, description: "No data" };
  const recent = features.slice(-20);
  const avgConf = recent.reduce((s, f) => s + f.confidence, 0) / recent.length;
  return {
    score: Math.round(avgConf),
    description: `Average model confidence over last ${recent.length} observations: ${avgConf.toFixed(1)}/100.`,
  };
}

// ─── Label assignment ──────────────────────────────────────────────────────────

function assignLabel(score: number): OpportunityLabel {
  if (score >= 80) return "Excellent";
  if (score >= 68) return "High";
  if (score >= 55) return "Good";
  if (score >= 42) return "Moderate";
  if (score >= 28) return "Low";
  return "Very Low";
}

function buildReasoning(
  score: number,
  label: OpportunityLabel,
  factors: OpportunityScoreBreakdown["factors"],
): string {
  const topFactors = Object.entries(factors)
    .sort((a, b) => b[1].score - a[1].score)
    .slice(0, 3)
    .map(([k]) => k);
  const bottomFactors = Object.entries(factors)
    .sort((a, b) => a[1].score - b[1].score)
    .slice(0, 2)
    .map(([k]) => k);

  return `Opportunity label: ${label} (${score}/100). ` +
    `Strongest factors: ${topFactors.join(", ")}. ` +
    `Weaker factors: ${bottomFactors.join(", ")}. ` +
    `NOTE: This score is NOT directional — it does not indicate buy or sell.`;
}

// ─── Main export ───────────────────────────────────────────────────────────────

export function computeOpportunityScore(features: FeatureRow[]): OpportunityScoreBreakdown {
  const regimeResult = scoreRegimeFactor(features);
  const trendResult = scoreTrendFactor(features);
  const liquidityResult = scoreLiquidityFactor(features);
  const volatilityResult = scoreVolatilityFactor(features);
  const historicalResult = scoreHistoricalFactor(features);
  const stabilityResult = scoreStabilityFactor(features);
  const confidenceResult = scoreConfidenceFactor(features);

  const factors: OpportunityScoreBreakdown["factors"] = {
    regime:     { score: regimeResult.score,     weight: WEIGHTS.regime,     description: regimeResult.description },
    trend:      { score: trendResult.score,      weight: WEIGHTS.trend,      description: trendResult.description },
    liquidity:  { score: liquidityResult.score,  weight: WEIGHTS.liquidity,  description: liquidityResult.description },
    volatility: { score: volatilityResult.score, weight: WEIGHTS.volatility, description: volatilityResult.description },
    historical: { score: historicalResult.score, weight: WEIGHTS.historical, description: historicalResult.description },
    stability:  { score: stabilityResult.score,  weight: WEIGHTS.stability,  description: stabilityResult.description },
    confidence: { score: confidenceResult.score, weight: WEIGHTS.confidence, description: confidenceResult.description },
  };

  const overall = Math.round(
    Object.values(factors).reduce((sum, f) => sum + f.score * f.weight, 0)
  );

  const label = assignLabel(overall);
  const reasoning = buildReasoning(overall, label, factors);

  return {
    overall,
    label,
    reasoning,
    factors,
    note: "This score measures historical favorability for the deterministic strategy. It does NOT indicate buy or sell direction.",
  };
}
