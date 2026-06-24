export * from "./types.js";
export * from "./data/fetcher.js";
export * from "./analysis/swings.js";
export * from "./analysis/fibonacci.js";
export * from "./analysis/zones.js";
export * from "./analysis/liquidity.js";
export * from "./analysis/amd.js";
export * from "./analysis/regime.js";
export * from "./signals/generator.js";
export * from "./backtest/engine.js";
export * from "./backtest/stats.js";
export * from "./learning/scorer.js";
export * from "./learning/weights.js";

import type { Pair, Timeframe, AnalysisResult } from "./types.js";
import { fetchCandles } from "./data/fetcher.js";
import { detectSwings, labelStructure, calcATR } from "./analysis/swings.js";
import { calcFibForCandles } from "./analysis/fibonacci.js";
import { detectZones } from "./analysis/zones.js";
import { detectLiquidityLevels, detectLiquidityGrabs } from "./analysis/liquidity.js";
import { detectAMD } from "./analysis/amd.js";
import { detectRegime } from "./analysis/regime.js";
import { generateSignals } from "./signals/generator.js";
import { DEFAULT_WEIGHT_PROFILE, type WeightProfile } from "./learning/weights.js";

export async function runFullAnalysis(
  pair: Pair,
  timeframe: Timeframe = "4h",
  learnedWeights: WeightProfile = DEFAULT_WEIGHT_PROFILE,
): Promise<AnalysisResult> {
  const candles = await fetchCandles(pair, timeframe);
  const swings = detectSwings(candles, timeframe === "1d" ? 7 : 5);
  const structure = labelStructure(swings);
  const atr = calcATR(candles);
  const fib = calcFibForCandles(candles, swings);
  const zones = detectZones(pair, timeframe, candles, fib, 10);
  const liquidity = detectLiquidityLevels(candles, swings);
  const recentGrabs = detectLiquidityGrabs(candles, liquidity);
  const amd = detectAMD(candles, recentGrabs);
  const regime = detectRegime(pair, candles, swings);
  const signals = generateSignals(pair, candles, zones, fib, amd, regime, recentGrabs, learnedWeights);

  return {
    pair,
    timeframe,
    candles,
    swings,
    structure,
    fib,
    zones,
    liquidity,
    recentGrabs,
    amd,
    regime,
    signals,
    atr,
    analyzedAt: new Date(),
  };
}
