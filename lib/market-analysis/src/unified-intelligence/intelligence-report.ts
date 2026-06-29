// ─── Unified Market Intelligence Report Generator ─────────────────────────────
// Advisory only. No trade execution. No strategy modification.
// Combines all intelligence layers into one standardized report.

import { computeHealthScore } from "./health-scorer.js";
import { computeOpportunityScore } from "./opportunity-scorer.js";
import { assessRisk } from "./risk-assessor.js";
import { compareHistorical } from "./historical-comparator.js";
import { generateOutlook } from "./outlook-generator.js";
import type {
  FeatureRow,
  MarketSummary,
  UnifiedMarketState,
  MarketIntelligenceReport,
} from "./types.js";

export const UNIFIED_INTELLIGENCE_VERSION = "1.0.0";

// ─── Market Summary Builder ────────────────────────────────────────────────────

function buildMarketSummary(features: FeatureRow[], pair: string): MarketSummary {
  if (features.length === 0) {
    return {
      regime: "unknown",
      trendDirection: "unknown",
      trendStrength: 0,
      trendAge: 0,
      volatilityLevel: "medium",
      liquidityQuality: "moderate",
      correlationState: "low",
      newsContext: "clear",
      session: "unknown",
      spread: "normal",
      marketStability: 50,
    };
  }

  const recent = features.slice(-20);

  // Dominant regime
  const regimeCounts: Record<string, number> = {};
  for (const f of recent) regimeCounts[f.marketRegime] = (regimeCounts[f.marketRegime] || 0) + 1;
  const regime = Object.entries(regimeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "unknown";

  // Dominant trend
  const trendCounts: Record<string, number> = {};
  for (const f of recent) trendCounts[f.trend] = (trendCounts[f.trend] || 0) + 1;
  const trendDirection = Object.entries(trendCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "unknown";

  // Trend strength from TQI
  const avgTqi = recent.reduce((s, f) => s + f.tqi, 0) / recent.length;

  // Trend age
  let trendAge = 0;
  for (let i = features.length - 1; i >= 0; i--) {
    if (features[i].trend === trendDirection) trendAge++;
    else break;
  }

  // Volatility
  const volCounts: Record<string, number> = {};
  for (const f of recent) volCounts[f.volatility] = (volCounts[f.volatility] || 0) + 1;
  const volatilityLevel = Object.entries(volCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "medium";

  // Liquidity
  const avgLiquidity = recent.reduce((s, f) => s + f.liquidityScore, 0) / recent.length;
  const liquidityQuality = avgLiquidity > 70 ? "high" : avgLiquidity > 45 ? "moderate" : "low";

  // Correlation state (proxy via AMD completion)
  const avgAmd = recent.reduce((s, f) => s + f.amdScore, 0) / recent.length;
  const correlationState = avgAmd > 65 ? "high" : avgAmd > 40 ? "moderate" : "low";

  // Session
  const sessionCounts: Record<string, number> = {};
  for (const f of recent) sessionCounts[f.session] = (sessionCounts[f.session] || 0) + 1;
  const session = Object.entries(sessionCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "unknown";

  // News context (proxy via session)
  const newsContext = session === "overlap" ? "high_impact" :
    (session === "london" || session === "new_york") ? "moderate_impact" : "clear";

  // Spread
  const avgSpread = recent.reduce((s, f) => s + f.spreadPips, 0) / recent.length;
  const spread = avgSpread < 1.5 ? "tight" : avgSpread < 3 ? "normal" : avgSpread < 5 ? "wide" : "very_wide";

  // Stability (regime + trend consistency)
  const uniqueRegimes = new Set(recent.map(f => f.marketRegime)).size;
  const uniqueTrends = new Set(recent.map(f => f.trend)).size;
  const marketStability = Math.round(Math.max(0, 100 - (uniqueRegimes - 1) * 20 - (uniqueTrends - 1) * 15));

  return {
    regime,
    trendDirection,
    trendStrength: Math.round(avgTqi),
    trendAge,
    volatilityLevel,
    liquidityQuality,
    correlationState,
    newsContext,
    session,
    spread,
    marketStability,
  };
}

// ─── Overall confidence computation ────────────────────────────────────────────

function computeOverallConfidence(
  features: FeatureRow[],
  health: ReturnType<typeof computeHealthScore>,
  historical: ReturnType<typeof compareHistorical>,
): number {
  const dataCoverage = Math.min(100, (features.length / 200) * 100);
  const healthConf = health.overall;
  const historicalConf = historical.confidence;
  return Math.round(dataCoverage * 0.3 + healthConf * 0.4 + historicalConf * 0.3);
}

// ─── Data quality label ────────────────────────────────────────────────────────

function assessDataQuality(
  features: FeatureRow[],
): MarketIntelligenceReport["dataQuality"] {
  if (features.length >= 300) return "Excellent";
  if (features.length >= 150) return "Good";
  if (features.length >= 50) return "Fair";
  if (features.length >= 10) return "Poor";
  return "Insufficient";
}

// ─── Key findings builder ─────────────────────────────────────────────────────

function buildKeyFindings(
  summary: MarketSummary,
  health: ReturnType<typeof computeHealthScore>,
  risk: ReturnType<typeof assessRisk>,
  opportunity: ReturnType<typeof computeOpportunityScore>,
  historical: ReturnType<typeof compareHistorical>,
): string[] {
  const findings: string[] = [];

  findings.push(
    `Market regime: ${summary.regime} (stability: ${summary.marketStability}/100).`
  );
  findings.push(
    `Market health: ${health.grade} (${health.overall}/100) — ${health.interpretation}`
  );
  findings.push(
    `Risk level: ${risk.overall} (score: ${risk.overallScore}/100). ` +
    `Highest dimension: ${Object.entries(risk.dimensions)
      .sort((a, b) => b[1].score - a[1].score)[0]?.[0] ?? "N/A"}.`
  );
  findings.push(
    `Opportunity score: ${opportunity.overall}/100 (${opportunity.label}). ${opportunity.note}`
  );

  if (historical.sampleSize >= 30) {
    findings.push(
      `Historical match: ${historical.similarMarketsCount} similar periods found. ` +
      `Historical win rate: ${(historical.winRate * 100).toFixed(1)}%, PF: ${historical.profitFactor.toFixed(2)}.`
    );
  } else {
    findings.push("Historical context: insufficient completed trade data for reliable comparison.");
  }

  return findings;
}

// ─── Report summary ───────────────────────────────────────────────────────────

function buildReportSummary(
  summary: MarketSummary,
  health: ReturnType<typeof computeHealthScore>,
  risk: ReturnType<typeof assessRisk>,
  opportunity: ReturnType<typeof computeOpportunityScore>,
): string {
  return (
    `The market is currently in a ${summary.regime} regime with ${summary.trendDirection} trend bias. ` +
    `Overall market health is ${health.grade} (${health.overall}/100). ` +
    `Risk is assessed as ${risk.overall}. ` +
    `Strategy opportunity score: ${opportunity.overall}/100 (${opportunity.label}). ` +
    `Advisory only — no trade execution decisions are derived from this report.`
  );
}

// ─── Phase 5 readiness check ──────────────────────────────────────────────────

function assessPhase5Readiness(
  features: FeatureRow[],
  overallConfidence: number,
  health: ReturnType<typeof computeHealthScore>,
): boolean {
  // Readiness criteria:
  // 1. Minimum data coverage
  // 2. Sufficient health score
  // 3. Sufficient confidence
  return (
    features.length >= 50 &&
    overallConfidence >= 40 &&
    health.overall >= 40
  );
}

// ─── Main export ───────────────────────────────────────────────────────────────

export function generateIntelligenceReport(
  features: FeatureRow[],
  pair: string = "EURUSD",
): MarketIntelligenceReport {
  const id = `mir-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const generatedAt = new Date().toISOString();

  const summary = buildMarketSummary(features, pair);
  const health = computeHealthScore(features);
  const opportunity = computeOpportunityScore(features);
  const risk = assessRisk(features);
  const historical = compareHistorical(features);
  const outlook = generateOutlook(features);

  const overallConfidence = computeOverallConfidence(features, health, historical);
  const dataQuality = assessDataQuality(features);
  const keyFindings = buildKeyFindings(summary, health, risk, opportunity, historical);
  const reportSummary = buildReportSummary(summary, health, risk, opportunity);
  const readinessForPhase5 = assessPhase5Readiness(features, overallConfidence, health);

  const unifiedState: UnifiedMarketState = {
    timestamp: generatedAt,
    version: UNIFIED_INTELLIGENCE_VERSION,
    pair,
    marketSummary: summary,
    historicalContext: historical,
    healthScore: health,
    opportunityScore: opportunity,
    riskAssessment: risk,
    outlook,
    overallConfidence,
    dataPoints: features.length,
    evidenceReferences: [
      `Health scorer: ${Object.keys(health.components).length} components evaluated.`,
      `Risk assessor: 6 dimensions with measurable evidence.`,
      `Opportunity scorer: 7 factors weighted, non-directional.`,
      `Historical comparator: ${historical.similarMarketsCount} similar periods identified.`,
      `Outlook generator: ${outlook.allScenarios.length} scenarios with transition probabilities.`,
    ],
    computedAt: generatedAt,
  };

  return {
    id,
    generatedAt,
    pair,
    engineVersion: UNIFIED_INTELLIGENCE_VERSION,
    unifiedState,
    regime: summary.regime,
    healthScore: health.overall,
    opportunityScore: opportunity.overall,
    riskLevel: risk.overall,
    confidence: overallConfidence,
    reportSummary,
    keyFindings,
    dataQuality,
    readinessForPhase5,
  };
}
