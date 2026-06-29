// ─── Market Health Scorer ──────────────────────────────────────────────────────
// Advisory only. No trade execution. No strategy modification.
// Computes a 0-100 Market Health Score from 8 transparent, weighted components.

import type { FeatureRow, HealthScoreBreakdown, HealthGrade } from "./types.js";

// ─── Component Weights (sum to 1.0) ───────────────────────────────────────────
const WEIGHTS = {
  stability:           0.18,
  liquidity:           0.16,
  volatility:          0.14,
  correlation:         0.12,
  newsRisk:            0.10,
  trendQuality:        0.14,
  historicalReliability: 0.10,
  dataQuality:         0.06,
} as const;

// ─── Internal component scorers ────────────────────────────────────────────────

function scoreStability(features: FeatureRow[]): number {
  if (features.length < 5) return 40;
  const recent = features.slice(-20);

  // Regime consistency
  const regimes = recent.map(f => f.marketRegime);
  const uniqueRegimes = new Set(regimes).size;
  const regimeConsistency = Math.max(0, 100 - (uniqueRegimes - 1) * 20);

  // Trend consistency
  const trends = recent.map(f => f.trend);
  const uniqueTrends = new Set(trends).size;
  const trendConsistency = Math.max(0, 100 - (uniqueTrends - 1) * 15);

  // Spread stability
  const spreads = recent.map(f => f.spreadPips);
  const avgSpread = spreads.reduce((a, b) => a + b, 0) / spreads.length;
  const spreadVariance = spreads.reduce((s, x) => s + Math.pow(x - avgSpread, 2), 0) / spreads.length;
  const spreadStdDev = Math.sqrt(spreadVariance);
  const spreadStability = Math.max(0, 100 - (spreadStdDev / Math.max(avgSpread, 0.1)) * 100);

  return Math.round((regimeConsistency * 0.4 + trendConsistency * 0.35 + spreadStability * 0.25));
}

function scoreLiquidity(features: FeatureRow[]): number {
  if (features.length === 0) return 50;
  const recent = features.slice(-20);

  const avgLiquidity = recent.reduce((s, f) => s + f.liquidityScore, 0) / recent.length;
  const avgSpread = recent.reduce((s, f) => s + f.spreadPips, 0) / recent.length;

  // Low spread = better liquidity health
  const spreadScore = Math.max(0, 100 - avgSpread * 5);
  const liquidityScore = Math.min(100, avgLiquidity);

  return Math.round(liquidityScore * 0.6 + spreadScore * 0.4);
}

function scoreVolatility(features: FeatureRow[]): number {
  if (features.length === 0) return 50;
  const recent = features.slice(-20);

  const volCounts = { low: 0, medium: 0, high: 0 };
  for (const f of recent) {
    if (f.volatility === "low") volCounts.low++;
    else if (f.volatility === "medium") volCounts.medium++;
    else volCounts.high++;
  }
  const total = recent.length;

  // Medium volatility is healthiest for the strategy
  const mediumRatio = volCounts.medium / total;
  const highRatio = volCounts.high / total;

  // Score: medium best (80-90), low moderate (60-70), high poor (20-40)
  const score = mediumRatio * 85 + (volCounts.low / total) * 65 + highRatio * 30;
  return Math.round(Math.min(100, Math.max(0, score)));
}

function scoreCorrelation(features: FeatureRow[]): number {
  if (features.length === 0) return 60;
  const recent = features.slice(-20);

  // Low AMD score → poor market structure → lower health
  const avgAmd = recent.reduce((s, f) => s + f.amdScore, 0) / recent.length;
  const avgConfirmation = recent.reduce((s, f) => s + f.confirmationQuality, 0) / recent.length;

  // Higher confirmation + AMD = better health (correlation risk is lower)
  return Math.round((avgAmd * 0.5 + avgConfirmation * 0.5));
}

function scoreNewsRisk(features: FeatureRow[]): number {
  if (features.length === 0) return 60;
  const recent = features.slice(-10);

  // Sessions: Asia = lower news risk, London/NY = higher news risk
  const highRiskSessions = recent.filter(f =>
    f.session === "london" || f.session === "new_york" || f.session === "overlap"
  ).length;
  const ratio = highRiskSessions / recent.length;

  // Higher news-risk session ratio = lower health (inverse)
  // But we want a score where higher = healthier
  // During London/NY overlap, there's MORE opportunity but also more news risk
  // We'll say: purely Asia session = 85, mix = 65, pure high-risk = 45
  const score = 85 - ratio * 40;
  return Math.round(Math.max(0, Math.min(100, score)));
}

function scoreTrendQuality(features: FeatureRow[]): number {
  if (features.length === 0) return 50;
  const recent = features.slice(-20);

  const avgSetupScore = recent.reduce((s, f) => s + f.setupScore, 0) / recent.length;
  const avgTqi = recent.reduce((s, f) => s + f.tqi, 0) / recent.length;
  const avgSupplyDemand = recent.reduce((s, f) => s + (f.supplyQuality + f.demandQuality) / 2, 0) / recent.length;

  return Math.round(avgSetupScore * 0.35 + avgTqi * 0.35 + avgSupplyDemand * 0.30);
}

function scoreHistoricalReliability(features: FeatureRow[]): number {
  const completed = features.filter(f => f.outcome === "win" || f.outcome === "loss");
  if (completed.length < 10) return 50;

  const wins = completed.filter(f => f.outcome === "win").length;
  const winRate = wins / completed.length;
  const avgPnl = completed.reduce((s, f) => s + f.pnl, 0) / completed.length;
  const avgConfidence = completed.reduce((s, f) => s + f.confidence, 0) / completed.length;

  // Score: high winrate + positive pnl + high confidence = healthier
  const winScore = winRate * 100;
  const pnlScore = Math.max(0, Math.min(100, 50 + avgPnl * 5));
  const confidenceScore = avgConfidence;

  return Math.round(winScore * 0.4 + pnlScore * 0.3 + confidenceScore * 0.3);
}

function scoreDataQuality(features: FeatureRow[]): number {
  if (features.length === 0) return 0;

  // More features = higher data quality
  const countScore = Math.min(100, (features.length / 200) * 100);

  // Check for completeness (no nulls in key fields)
  const sampleSize = Math.min(features.length, 50);
  const sample = features.slice(-sampleSize);
  const complete = sample.filter(f =>
    f.pair && f.session && f.marketRegime && f.trend &&
    !isNaN(f.liquidityScore) && !isNaN(f.setupScore)
  ).length;
  const completenessScore = (complete / sampleSize) * 100;

  return Math.round(countScore * 0.5 + completenessScore * 0.5);
}

// ─── Grade assignment ──────────────────────────────────────────────────────────

function assignGrade(score: number): HealthGrade {
  if (score >= 80) return "A";
  if (score >= 65) return "B";
  if (score >= 50) return "C";
  if (score >= 35) return "D";
  return "F";
}

function interpretHealth(score: number, grade: HealthGrade): string {
  const interpretations: Record<HealthGrade, string> = {
    A: "Excellent market health. Conditions are stable, liquid, and historically reliable.",
    B: "Good market health. Minor concerns exist but conditions are generally favorable.",
    C: "Moderate market health. Mixed signals; proceed with elevated awareness.",
    D: "Poor market health. Multiple risk factors present; strategy performance may be degraded.",
    F: "Critical market health issues. Extreme caution warranted.",
  };
  return interpretations[grade];
}

// ─── Main export ───────────────────────────────────────────────────────────────

export function computeHealthScore(features: FeatureRow[]): HealthScoreBreakdown {
  const components = {
    stability:           { score: scoreStability(features),           weight: WEIGHTS.stability,           label: "Regime & Trend Stability" },
    liquidity:           { score: scoreLiquidity(features),           weight: WEIGHTS.liquidity,           label: "Market Liquidity" },
    volatility:          { score: scoreVolatility(features),          weight: WEIGHTS.volatility,          label: "Volatility Quality" },
    correlation:         { score: scoreCorrelation(features),         weight: WEIGHTS.correlation,         label: "Market Structure Coherence" },
    newsRisk:            { score: scoreNewsRisk(features),            weight: WEIGHTS.newsRisk,            label: "News Risk Exposure" },
    trendQuality:        { score: scoreTrendQuality(features),        weight: WEIGHTS.trendQuality,        label: "Trend & Setup Quality" },
    historicalReliability: { score: scoreHistoricalReliability(features), weight: WEIGHTS.historicalReliability, label: "Historical Reliability" },
    dataQuality:         { score: scoreDataQuality(features),         weight: WEIGHTS.dataQuality,         label: "Data Quality & Coverage" },
  };

  const overall = Math.round(
    Object.values(components).reduce((sum, c) => sum + c.score * c.weight, 0)
  );

  const grade = assignGrade(overall);
  const interpretation = interpretHealth(overall, grade);

  return { overall, grade, interpretation, components };
}
