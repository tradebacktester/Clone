// ─── Market Intelligence Integrator ──────────────────────────────────────────
// Synthesises market health, context, opportunity, stability, trend quality,
// volatility quality, liquidity quality, and correlation quality.
// Advisory only.

import { clamp, MARKET_INTEL_WEIGHTS, SESSION_QUALITY, REGIME_QUALITY, VOLATILITY_QUALITY } from "./types.js";
import type { QualitySetup, MarketIntelligenceResult } from "./types.js";

function computeHealth(setup: QualitySetup): number {
  if (setup.marketHealthScore !== undefined) return clamp(setup.marketHealthScore, 0, 100);
  // Infer from regime + session + spread
  const regimeScore  = REGIME_QUALITY[setup.regime.toLowerCase()] ?? 50;
  const sessionScore = SESSION_QUALITY[setup.session.toLowerCase()] ?? 50;
  const spreadPenalty = Math.max(0, (setup.spreadPips - 1.0) * 5);
  return clamp((regimeScore * 0.5 + sessionScore * 0.4) - spreadPenalty, 0, 100);
}

function computeContext(setup: QualitySetup): number {
  if (setup.marketContextScore !== undefined) return clamp(setup.marketContextScore, 0, 100);
  const regimeScore  = REGIME_QUALITY[setup.regime.toLowerCase()] ?? 50;
  const sessionScore = SESSION_QUALITY[setup.session.toLowerCase()] ?? 50;
  return clamp(regimeScore * 0.6 + sessionScore * 0.4, 0, 100);
}

function computeOpportunity(setup: QualitySetup): number {
  if (setup.opportunityScore !== undefined) return clamp(setup.opportunityScore, 0, 100);
  // Infer from setup score + RR + regime
  const rrScore   = clamp((setup.rrPlanned / 4.0) * 50, 0, 50);
  const setupComp = setup.setupScore * 0.3;
  const regBonus  = setup.regime === "trending" ? 15 : 5;
  return clamp(rrScore + setupComp + regBonus, 0, 100);
}

function computeStability(setup: QualitySetup): number {
  if (setup.marketStabilityScore !== undefined) return clamp(setup.marketStabilityScore, 0, 100);
  const volScore = VOLATILITY_QUALITY[setup.volatility.toLowerCase()] ?? 55;
  return clamp(volScore * 0.7 + (100 - setup.spreadPips * 5) * 0.3, 0, 100);
}

function computeTrendQuality(setup: QualitySetup): number {
  if (setup.trendStrength !== undefined) return clamp(setup.trendStrength, 0, 100);
  const base = REGIME_QUALITY[setup.regime.toLowerCase()] ?? 50;
  const trendBonus = (setup.trend.toLowerCase() === "bullish" || setup.trend.toLowerCase() === "bearish") ? 15 : 0;
  return clamp(base + trendBonus, 0, 100);
}

function computeVolatilityQuality(setup: QualitySetup): number {
  if (setup.volatilityQuality !== undefined) return clamp(setup.volatilityQuality, 0, 100);
  return VOLATILITY_QUALITY[setup.volatility.toLowerCase()] ?? 55;
}

function computeLiquidityQuality(setup: QualitySetup): number {
  if (setup.liquidityQuality !== undefined) return clamp(setup.liquidityQuality, 0, 100);
  // Best proxy we have without market data
  return clamp(SESSION_QUALITY[setup.session.toLowerCase()] ?? 55, 0, 100);
}

function computeCorrelationQuality(setup: QualitySetup): number {
  if (setup.correlationQuality !== undefined) return clamp(setup.correlationQuality, 0, 100);
  // Without live correlation data, use neutral-to-slightly-positive default
  return 60;
}

export function integrateMarketIntelligence(setup: QualitySetup): MarketIntelligenceResult {
  const healthScore            = computeHealth(setup);
  const contextScore           = computeContext(setup);
  const opportunityScore       = computeOpportunity(setup);
  const stabilityScore         = computeStability(setup);
  const trendQualityScore      = computeTrendQuality(setup);
  const volatilityQualityScore = computeVolatilityQuality(setup);
  const liquidityQualityScore  = computeLiquidityQuality(setup);
  const correlationQualityScore = computeCorrelationQuality(setup);

  // Apply news sentiment modifier
  const newsMod = setup.newsContext === "positive" ? 5 : setup.newsContext === "negative" ? -8 : 0;

  const marketIntelligenceScore = clamp(
    healthScore            * MARKET_INTEL_WEIGHTS.health +
    contextScore           * MARKET_INTEL_WEIGHTS.context +
    opportunityScore       * MARKET_INTEL_WEIGHTS.opportunity +
    stabilityScore         * MARKET_INTEL_WEIGHTS.stability +
    trendQualityScore      * MARKET_INTEL_WEIGHTS.trendQuality +
    volatilityQualityScore * MARKET_INTEL_WEIGHTS.volatilityQuality +
    liquidityQualityScore  * MARKET_INTEL_WEIGHTS.liquidityQuality +
    correlationQualityScore * MARKET_INTEL_WEIGHTS.correlationQuality +
    newsMod,
    0, 100,
  );

  const explanations: string[] = [
    `Market Intelligence Score: ${marketIntelligenceScore.toFixed(1)}/100`,
    `Health: ${healthScore.toFixed(0)} | Context: ${contextScore.toFixed(0)} | Opportunity: ${opportunityScore.toFixed(0)} | Stability: ${stabilityScore.toFixed(0)}`,
    `Trend Quality: ${trendQualityScore.toFixed(0)} | Volatility: ${volatilityQualityScore.toFixed(0)} | Liquidity: ${liquidityQualityScore.toFixed(0)} | Correlation: ${correlationQualityScore.toFixed(0)}`,
  ];
  if (setup.newsContext === "positive") explanations.push("Favourable news context adds market tailwind.");
  if (setup.newsContext === "negative") explanations.push("⚠ Negative news context — increased event risk.");
  if (marketIntelligenceScore >= 80) explanations.push("Excellent market conditions — high institutional participation window.");

  return {
    healthScore,
    contextScore,
    opportunityScore,
    stabilityScore,
    trendQualityScore,
    volatilityQualityScore,
    liquidityQualityScore,
    correlationQualityScore,
    marketIntelligenceScore,
    explanations,
  };
}
