import type { Candle, SwingPoint, MarketRegimeResult } from "../types.js";
import { detectRegimeDetailed } from "../market_regime/regime_detector.js";

export { detectRegimeDetailed } from "../market_regime/regime_detector.js";
export type { DetailedRegimeResult, RegimeType } from "../market_regime/regime_detector.js";

export function detectRegime(
  pair: string,
  candles: Candle[],
  swings: SwingPoint[],
): MarketRegimeResult {
  if (candles.length < 20) {
    return {
      pair,
      regime: "unknown",
      trend: "neutral",
      volatility: "medium",
      atr: 0,
      adxEquivalent: 0,
      regimeConfidence: 0,
      volatilityPercentile: 50,
      rangeCompression: 0,
    };
  }

  const detailed = detectRegimeDetailed(candles, swings);

  return {
    pair,
    regime: detailed.regime === "low_volatility" ? "low_volatility" : detailed.regime,
    trend: detailed.trend,
    volatility: detailed.volatility,
    atr: detailed.atr,
    adxEquivalent: detailed.adxEquivalent,
    regimeConfidence: detailed.regimeConfidence,
    volatilityPercentile: detailed.volatilityPercentile,
    rangeCompression: detailed.rangeCompression,
  };
}

export function isGoodTradingRegime(regime: MarketRegimeResult): boolean {
  if (regime.regime === "volatile" && regime.adxEquivalent < 20) return false;
  if (regime.volatility === "low" && regime.adxEquivalent < 15) return false;
  return true;
}
