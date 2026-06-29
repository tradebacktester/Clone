// ─── Market Risk Assessor ──────────────────────────────────────────────────────
// Advisory only. No trade execution. No strategy modification.
// Evaluates 6 risk dimensions and produces an overall risk level with evidence.

import type { FeatureRow, RiskAssessment, RiskDimension, RiskLevel } from "./types.js";

// ─── Risk level thresholds ────────────────────────────────────────────────────

function riskScore(score: number): RiskLevel {
  if (score < 20) return "Low";
  if (score < 40) return "Moderate";
  if (score < 60) return "Elevated";
  if (score < 80) return "High";
  return "Extreme";
}

// ─── Dimension assessors ───────────────────────────────────────────────────────

function assessVolatilityRisk(features: FeatureRow[]): RiskDimension {
  if (features.length === 0) {
    return { level: "Moderate", score: 40, evidence: "Insufficient data", metric: "N/A" };
  }
  const recent = features.slice(-20);
  const highVol = recent.filter(f => f.volatility === "high").length;
  const ratio = highVol / recent.length;
  const score = Math.round(ratio * 100);
  const level = riskScore(score);
  return {
    level,
    score,
    evidence: `${highVol} of ${recent.length} recent observations in high-volatility regime (${(ratio * 100).toFixed(0)}%)`,
    metric: `${(ratio * 100).toFixed(1)}% high-vol`,
  };
}

function assessLiquidityRisk(features: FeatureRow[]): RiskDimension {
  if (features.length === 0) {
    return { level: "Moderate", score: 40, evidence: "Insufficient data", metric: "N/A" };
  }
  const recent = features.slice(-20);
  const avgLiquidity = recent.reduce((s, f) => s + f.liquidityScore, 0) / recent.length;
  const avgSpread = recent.reduce((s, f) => s + f.spreadPips, 0) / recent.length;

  // Low liquidity + high spread = high risk
  const liqRisk = Math.max(0, 100 - avgLiquidity);
  const spreadRisk = Math.min(100, avgSpread * 8);
  const score = Math.round(liqRisk * 0.6 + spreadRisk * 0.4);
  const level = riskScore(score);

  return {
    level,
    score,
    evidence: `Average liquidity score: ${avgLiquidity.toFixed(1)}/100. Average spread: ${avgSpread.toFixed(2)} pips.`,
    metric: `${avgLiquidity.toFixed(1)} liq | ${avgSpread.toFixed(2)} pips spread`,
  };
}

function assessCorrelationRisk(features: FeatureRow[]): RiskDimension {
  if (features.length === 0) {
    return { level: "Low", score: 20, evidence: "Insufficient data", metric: "N/A" };
  }
  const recent = features.slice(-20);
  const avgAmd = recent.reduce((s, f) => s + f.amdScore, 0) / recent.length;
  const avgConfirm = recent.reduce((s, f) => s + f.confirmationQuality, 0) / recent.length;

  // Low AMD/confirmation = market structure breakdown = correlation risk
  const score = Math.round(Math.max(0, (100 - (avgAmd + avgConfirm) / 2)));
  const level = riskScore(score);

  return {
    level,
    score,
    evidence: `Market structure coherence: AMD score ${avgAmd.toFixed(1)}/100, confirmation quality ${avgConfirm.toFixed(1)}/100.`,
    metric: `AMD ${avgAmd.toFixed(1)} | Confirm ${avgConfirm.toFixed(1)}`,
  };
}

function assessNewsRisk(features: FeatureRow[]): RiskDimension {
  if (features.length === 0) {
    return { level: "Low", score: 20, evidence: "Insufficient data", metric: "N/A" };
  }
  const recent = features.slice(-10);
  const highRiskSessions = recent.filter(f =>
    f.session === "london" || f.session === "new_york" || f.session === "overlap"
  ).length;
  const ratio = highRiskSessions / recent.length;
  const score = Math.round(ratio * 60); // Max 60 — session is a proxy for news
  const level = riskScore(score);

  return {
    level,
    score,
    evidence: `${highRiskSessions} of ${recent.length} recent observations in high-activity sessions (London/NY/Overlap).`,
    metric: `${(ratio * 100).toFixed(0)}% high-activity session`,
  };
}

function assessSessionRisk(features: FeatureRow[]): RiskDimension {
  if (features.length === 0) {
    return { level: "Low", score: 20, evidence: "Insufficient data", metric: "N/A" };
  }
  const recent = features.slice(-10);
  const sessionCounts: Record<string, number> = {};
  for (const f of recent) {
    sessionCounts[f.session] = (sessionCounts[f.session] || 0) + 1;
  }

  // Overlap or mixed sessions = elevated session risk
  const overlapCount = sessionCounts["overlap"] || 0;
  const asiaCount = sessionCounts["asia"] || 0;
  const londonCount = sessionCounts["london"] || 0;
  const nyCount = sessionCounts["new_york"] || 0;

  const uniqueSessions = Object.keys(sessionCounts).length;
  const sessionDiversityRisk = (uniqueSessions - 1) * 15;
  const overlapRisk = (overlapCount / recent.length) * 40;
  const score = Math.round(Math.min(100, sessionDiversityRisk + overlapRisk));
  const level = riskScore(score);

  const sessionSummary = Object.entries(sessionCounts)
    .map(([s, c]) => `${s}:${c}`)
    .join(", ");

  return {
    level,
    score,
    evidence: `Session distribution over ${recent.length} samples: ${sessionSummary}. ${uniqueSessions} unique sessions observed.`,
    metric: sessionSummary,
  };
}

function assessSpreadRisk(features: FeatureRow[]): RiskDimension {
  if (features.length === 0) {
    return { level: "Low", score: 15, evidence: "Insufficient data", metric: "N/A" };
  }
  const recent = features.slice(-20);
  const spreads = recent.map(f => f.spreadPips);
  const avgSpread = spreads.reduce((a, b) => a + b, 0) / spreads.length;
  const maxSpread = Math.max(...spreads);

  // Scoring: <1 pip = low risk, 1-2 = moderate, 2-3 = elevated, >3 = high, >5 = extreme
  const score = Math.round(Math.min(100, avgSpread * 20));
  const level = riskScore(score);

  return {
    level,
    score,
    evidence: `Average spread: ${avgSpread.toFixed(2)} pips. Peak spread: ${maxSpread.toFixed(2)} pips over ${recent.length} observations.`,
    metric: `${avgSpread.toFixed(2)} avg pips`,
  };
}

// ─── Overall risk aggregation ──────────────────────────────────────────────────

function computeOverallRisk(
  volatility: RiskDimension,
  liquidity: RiskDimension,
  correlation: RiskDimension,
  news: RiskDimension,
  session: RiskDimension,
  spread: RiskDimension,
): { level: RiskLevel; score: number } {
  // Weights: volatility and liquidity carry more weight for FX strategy
  const weighted =
    volatility.score * 0.28 +
    liquidity.score * 0.24 +
    correlation.score * 0.18 +
    news.score * 0.14 +
    session.score * 0.09 +
    spread.score * 0.07;

  const score = Math.round(Math.min(100, Math.max(0, weighted)));

  // If any single dimension is Extreme, overall cannot be below High
  const allDimensions = [volatility, liquidity, correlation, news, session, spread];
  const hasExtreme = allDimensions.some(d => d.level === "Extreme");
  const hasHigh = allDimensions.some(d => d.level === "High");

  let level = riskScore(score);
  if (hasExtreme && (level === "Low" || level === "Moderate" || level === "Elevated")) {
    level = "High";
  }
  if (hasHigh && (level === "Low" || level === "Moderate")) {
    level = "Elevated";
  }

  return { level, score };
}

// ─── Main export ───────────────────────────────────────────────────────────────

export function assessRisk(features: FeatureRow[]): RiskAssessment {
  const volatility = assessVolatilityRisk(features);
  const liquidity = assessLiquidityRisk(features);
  const correlation = assessCorrelationRisk(features);
  const news = assessNewsRisk(features);
  const session = assessSessionRisk(features);
  const spread = assessSpreadRisk(features);

  const { level: overall, score: overallScore } = computeOverallRisk(
    volatility, liquidity, correlation, news, session, spread
  );

  const evidence: string[] = [
    `Volatility: ${volatility.evidence}`,
    `Liquidity: ${liquidity.evidence}`,
    `Market structure: ${correlation.evidence}`,
    `News/session exposure: ${news.evidence}`,
    `Session distribution: ${session.evidence}`,
    `Spread: ${spread.evidence}`,
  ];

  return {
    overall,
    overallScore,
    dimensions: { volatility, liquidity, correlation, news, session, spread },
    evidence,
  };
}
