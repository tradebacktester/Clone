import type { Candle, SwingPoint } from "../types.js";

export type TrendDirection =
  | "strong_bullish"
  | "bullish"
  | "neutral"
  | "bearish"
  | "strong_bearish";

export interface TrendPerception {
  direction: TrendDirection;
  strength: number;
  persistence: number;
  age: number;
  adx: number;
  plusDI: number;
  minusDI: number;
  structureScore: number;
  consecutiveStructures: number;
  confidence: number;
}

function calcDMI(candles: Candle[], period = 14): { adx: number; plusDI: number; minusDI: number } {
  if (candles.length < period + 2) return { adx: 0, plusDI: 0, minusDI: 0 };

  let plusDMSum = 0;
  let minusDMSum = 0;
  let trSum = 0;
  const start = candles.length - period;

  for (let i = start; i < candles.length; i++) {
    const c = candles[i]!;
    const prev = candles[i - 1]!;
    const upMove = c.high - prev.high;
    const downMove = prev.low - c.low;
    if (upMove > downMove && upMove > 0) plusDMSum += upMove;
    if (downMove > upMove && downMove > 0) minusDMSum += downMove;
    trSum += Math.max(c.high - c.low, Math.abs(c.high - prev.close), Math.abs(c.low - prev.close));
  }

  const plusDI = trSum > 0 ? (plusDMSum / trSum) * 100 : 0;
  const minusDI = trSum > 0 ? (minusDMSum / trSum) * 100 : 0;
  const diSum = plusDI + minusDI;
  const adx = diSum > 0 ? (Math.abs(plusDI - minusDI) / diSum) * 100 : 0;

  return {
    adx: Math.round(adx * 10) / 10,
    plusDI: Math.round(plusDI * 10) / 10,
    minusDI: Math.round(minusDI * 10) / 10,
  };
}

function calcStructureScore(swings: SwingPoint[]): {
  score: number;
  consecutive: number;
  bullCount: number;
  bearCount: number;
} {
  const recent = swings.slice(-12);
  const highs = recent.filter(s => s.type === "high").map(s => s.price);
  const lows = recent.filter(s => s.type === "low").map(s => s.price);

  let bullCount = 0;
  let bearCount = 0;

  for (let i = 1; i < highs.length; i++) {
    if (highs[i]! > highs[i - 1]!) bullCount++;
    else bearCount++;
  }
  for (let i = 1; i < lows.length; i++) {
    if (lows[i]! > lows[i - 1]!) bullCount++;
    else bearCount++;
  }

  const consecutive = Math.max(bullCount, bearCount);
  const score = Math.min(100, consecutive * 20);
  return { score, consecutive, bullCount, bearCount };
}

function calcTrendAge(candles: Candle[], direction: TrendDirection): number {
  if (direction === "neutral" || candles.length < 3) return 0;

  const isBullish = direction === "strong_bullish" || direction === "bullish";
  let age = 0;

  for (let i = candles.length - 1; i >= 1; i--) {
    const c = candles[i]!;
    const prev = candles[i - 1]!;
    const movingCorrectly = isBullish ? c.close >= prev.close : c.close <= prev.close;
    if (movingCorrectly) {
      age++;
    } else {
      if (age > 0) break;
    }
  }

  return age;
}

function classifyDirection(
  adx: number,
  plusDI: number,
  minusDI: number,
  structureScore: number,
  bullCount: number,
  bearCount: number,
): TrendDirection {
  const diDiff = Math.abs(plusDI - minusDI);
  const bullish = plusDI > minusDI;
  const bullStructure = bullCount > bearCount;

  if (adx >= 35 && diDiff >= 15 && bullish && bullStructure) return "strong_bullish";
  if (adx >= 35 && diDiff >= 15 && !bullish && !bullStructure) return "strong_bearish";
  if (adx >= 18 && bullish && structureScore >= 20) return "bullish";
  if (adx >= 18 && !bullish && structureScore >= 20) return "bearish";
  return "neutral";
}

export function perceiveTrend(candles: Candle[], swings: SwingPoint[], period = 14): TrendPerception {
  const empty: TrendPerception = {
    direction: "neutral", strength: 0, persistence: 0, age: 0,
    adx: 0, plusDI: 0, minusDI: 0, structureScore: 0,
    consecutiveStructures: 0, confidence: 0,
  };

  if (candles.length < period + 2) return empty;

  const { adx, plusDI, minusDI } = calcDMI(candles, period);
  const { score: structureScore, consecutive, bullCount, bearCount } = calcStructureScore(swings);
  const direction = classifyDirection(adx, plusDI, minusDI, structureScore, bullCount, bearCount);

  const strength = Math.min(100, Math.round(adx * 0.6 + structureScore * 0.4));
  const persistence = Math.min(100, consecutive * 25);
  const age = calcTrendAge(candles, direction);

  const confidence = Math.min(100, Math.round(
    (adx >= 18 ? 30 : 0) +
    (structureScore * 0.4) +
    (persistence * 0.2) +
    (direction !== "neutral" ? 10 : 0),
  ));

  return {
    direction,
    strength,
    persistence,
    age,
    adx,
    plusDI,
    minusDI,
    structureScore,
    consecutiveStructures: consecutive,
    confidence,
  };
}
