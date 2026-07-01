// ─── Market Crisis Detector ───────────────────────────────────────────────────

import {
  MarketContext,
  MarketCrisisSignal,
  THRESHOLDS,
  scoreToCrisisSeverity,
} from "./types.js";

export function detectMarketCrisis(ctx: MarketContext): MarketCrisisSignal {
  const evidence: string[] = [];

  // Flash crash: extreme volatility spike + liquidity collapse simultaneously
  const flashCrash =
    ctx.volatilityScore >= THRESHOLDS.VOLATILITY_EXTREME &&
    ctx.liquidityScore <= THRESHOLDS.LIQUIDITY_CRITICAL;
  if (flashCrash) evidence.push("Flash crash pattern: extreme volatility + critical liquidity collapse");

  // Extreme volatility
  const extremeVolatility = ctx.volatilityScore >= THRESHOLDS.VOLATILITY_EXTREME;
  if (extremeVolatility) evidence.push(`Extreme volatility score: ${ctx.volatilityScore}/100`);

  // Liquidity collapse
  const liquidityCollapse = ctx.liquidityScore <= THRESHOLDS.LIQUIDITY_CRITICAL;
  if (liquidityCollapse) evidence.push(`Liquidity collapse — score: ${ctx.liquidityScore}/100`);

  // Price gap: high volatility + low liquidity (gap risk)
  const priceGap =
    ctx.volatilityScore >= THRESHOLDS.VOLATILITY_HIGH &&
    ctx.liquidityScore <= THRESHOLDS.LIQUIDITY_LOW &&
    !ctx.hasNewsFeed;
  if (priceGap) evidence.push("Price gap risk: high volatility with low liquidity and no news filter");

  // Spread expansion
  const spreadExpansion = ctx.spreadMultiplier >= THRESHOLDS.SPREAD_HIGH_MULTIPLIER;
  if (spreadExpansion) evidence.push(`Abnormal spread expansion: ${ctx.spreadMultiplier.toFixed(1)}× normal`);

  // Trading halt simulation: spread so extreme execution is impossible
  const tradingHalt = ctx.spreadMultiplier >= THRESHOLDS.SPREAD_EXTREME_MULTIPLIER;
  if (tradingHalt) evidence.push(`Trading halt signal: spread ${ctx.spreadMultiplier.toFixed(1)}× normal (execution impossible)`);

  // Exchange instability: volatile + low liquidity
  const exchangeInstability =
    ctx.volatilityScore >= THRESHOLDS.VOLATILITY_HIGH &&
    ctx.liquidityScore <= THRESHOLDS.LIQUIDITY_LOW;
  if (exchangeInstability) evidence.push("Exchange instability: simultaneous high volatility and low liquidity");

  // Unexpected market behaviour: regime transition + extreme readings
  const unexpectedBehavior =
    ctx.regime === "volatile" &&
    (ctx.volatilityScore >= THRESHOLDS.VOLATILITY_HIGH || ctx.liquidityScore <= THRESHOLDS.LIQUIDITY_LOW);
  if (unexpectedBehavior) evidence.push(`Unexpected market behaviour in ${ctx.regime} regime`);

  // Compute score
  let score = 0;
  if (flashCrash)          score += 45;
  if (extremeVolatility)   score += 25;
  if (liquidityCollapse)   score += 20;
  if (tradingHalt)         score += 30;
  if (spreadExpansion)     score += 15;
  if (priceGap)            score += 10;
  if (exchangeInstability) score += 15;
  if (unexpectedBehavior)  score += 10;

  // Continuous contributions
  score += Math.max(0, ctx.volatilityScore - THRESHOLDS.VOLATILITY_HIGH) * 0.5;
  score += Math.max(0, THRESHOLDS.LIQUIDITY_LOW - ctx.liquidityScore) * 0.4;
  score += Math.max(0, ctx.spreadMultiplier - 1.0) * 5;

  const crisisScore = Math.min(100, Math.round(score));
  const volatilityZScore = (ctx.volatilityScore - 50) / 20;  // normalised

  return {
    flashCrash,
    extremeVolatility,
    liquidityCollapse,
    priceGap,
    spreadExpansion,
    tradingHalt,
    exchangeInstability,
    unexpectedBehavior,
    crisisScore,
    severity:        scoreToCrisisSeverity(crisisScore),
    evidence,
    volatilityZScore,
    spreadMultiplier: ctx.spreadMultiplier,
    liquidityScore:   ctx.liquidityScore,
  };
}
