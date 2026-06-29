// ─── Market Support Analyzer ──────────────────────────────────────────────────
// Evaluates trend, regime, volatility, liquidity, correlation, news, and
// stability to produce a Market Support Score (0–100).
// Advisory only.

import { clamp } from "../learning-validation/data-validator.js";
import type { StrategySetup, MarketSupportResult } from "./types.js";
import {
  SESSION_SCORES,
  REGIME_SCORES,
  VOLATILITY_SCORES,
  MARKET_SUPPORT_WEIGHTS,
} from "./types.js";

// ─── Individual dimension scorers ─────────────────────────────────────────────

function scoreTrend(setup: StrategySetup): { score: number; detail: string } {
  const trend = setup.trend?.toLowerCase() ?? "sideways";
  let base: number;

  if (trend === "bullish" || trend === "bearish") {
    base = setup.trendStrength != null
      ? clamp(60 + (setup.trendStrength - 50) * 0.8, 40, 100)
      : 70;
  } else if (trend === "sideways" || trend === "ranging") {
    base = 45;
  } else {
    base = 55;
  }
  return { score: base, detail: `Trend: ${trend} (strength: ${setup.trendStrength?.toFixed(0) ?? "N/A"})` };
}

function scoreRegime(setup: StrategySetup): { score: number; detail: string } {
  const regime = setup.regime?.toLowerCase() ?? "unknown";
  const score  = REGIME_SCORES[regime] ?? 50;
  return { score, detail: `Regime: ${regime} — score ${score}` };
}

function scoreVolatility(setup: StrategySetup): { score: number; detail: string } {
  const vol   = setup.volatility?.toLowerCase() ?? "medium";
  const score = VOLATILITY_SCORES[vol] ?? 60;
  return { score, detail: `Volatility: ${vol} — score ${score}` };
}

function scoreLiquidity(setup: StrategySetup): { score: number; detail: string } {
  // We already have liquidityScore on setup (0–100)
  const score = clamp(setup.liquidityScore ?? 50, 0, 100);
  let quality: string;
  if (score >= 75) quality = "excellent";
  else if (score >= 60) quality = "good";
  else if (score >= 45) quality = "moderate";
  else quality = "poor";
  return { score, detail: `Market liquidity: ${quality} (${score.toFixed(1)}/100)` };
}

function scoreCorrelation(setup: StrategySetup): { score: number; detail: string } {
  if (setup.correlationScore == null) {
    return { score: 60, detail: "Correlation: no data — defaulting to neutral (60)" };
  }
  const score = clamp(setup.correlationScore, 0, 100);
  let quality: string;
  if (score >= 75) quality = "highly favourable";
  else if (score >= 55) quality = "favourable";
  else if (score >= 40) quality = "neutral";
  else quality = "unfavourable";
  return { score, detail: `Correlation environment: ${quality} (${score.toFixed(1)}/100)` };
}

function scoreNews(setup: StrategySetup): { score: number; detail: string } {
  const ctx = setup.newsContext ?? "neutral";
  const map: Record<string, number> = { positive: 80, neutral: 65, negative: 30 };
  const score = map[ctx] ?? 65;
  return { score, detail: `News context: ${ctx} — score ${score}` };
}

function scoreStability(setup: StrategySetup): { score: number; detail: string } {
  if (setup.stabilityScore == null) {
    return { score: 65, detail: "Market stability: no data — defaulting to neutral (65)" };
  }
  const score = clamp(setup.stabilityScore, 0, 100);
  let level: string;
  if (score >= 75) level = "high";
  else if (score >= 55) level = "moderate";
  else level = "low";
  return { score, detail: `Market stability: ${level} (${score.toFixed(1)}/100)` };
}

// ─── Composite market support score ──────────────────────────────────────────

export function analyzeMarketSupport(setup: StrategySetup): MarketSupportResult {
  const trend       = scoreTrend(setup);
  const regime      = scoreRegime(setup);
  const volatility  = scoreVolatility(setup);
  const liquidity   = scoreLiquidity(setup);
  const correlation = scoreCorrelation(setup);
  const news        = scoreNews(setup);
  const stability   = scoreStability(setup);

  const marketSupportScore = clamp(
    trend.score       * MARKET_SUPPORT_WEIGHTS.trend       +
    regime.score      * MARKET_SUPPORT_WEIGHTS.regime      +
    volatility.score  * MARKET_SUPPORT_WEIGHTS.volatility  +
    liquidity.score   * MARKET_SUPPORT_WEIGHTS.liquidity   +
    correlation.score * MARKET_SUPPORT_WEIGHTS.correlation +
    news.score        * MARKET_SUPPORT_WEIGHTS.news        +
    stability.score   * MARKET_SUPPORT_WEIGHTS.stability,
    0, 100,
  );

  return {
    trendScore:        trend.score,
    regimeScore:       regime.score,
    volatilityScore:   volatility.score,
    liquidityScore:    liquidity.score,
    correlationScore:  correlation.score,
    newsScore:         news.score,
    stabilityScore:    stability.score,
    marketSupportScore,
    explanations: [
      trend.detail,
      regime.detail,
      volatility.detail,
      liquidity.detail,
      correlation.detail,
      news.detail,
      stability.detail,
      `Market Support Score: ${marketSupportScore.toFixed(1)}/100`,
    ],
  };
}
