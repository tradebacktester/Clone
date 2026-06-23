import type { Candle, LiquidityLevel, LiquidityGrab, SwingPoint } from "../types.js";
import { calcATR } from "./swings.js";

export function detectLiquidityLevels(
  candles: Candle[],
  swings: SwingPoint[],
): LiquidityLevel[] {
  const levels: LiquidityLevel[] = [];
  const atr = calcATR(candles);
  const tolerance = atr * 0.3;

  const highs = swings.filter(s => s.type === "high");
  const lows = swings.filter(s => s.type === "low");

  const equalHighGroups = groupNearLevels(highs.map(h => h.price), tolerance);
  for (const group of equalHighGroups) {
    if (group.count >= 2) {
      levels.push({
        price: group.price,
        type: "equal_highs",
        swept: false,
        strength: Math.min(100, 50 + group.count * 15),
      });
    }
  }

  const equalLowGroups = groupNearLevels(lows.map(l => l.price), tolerance);
  for (const group of equalLowGroups) {
    if (group.count >= 2) {
      levels.push({
        price: group.price,
        type: "equal_lows",
        swept: false,
        strength: Math.min(100, 50 + group.count * 15),
      });
    }
  }

  if (candles.length >= 20) {
    const prevDayCandles = candles.slice(-48, -24);
    if (prevDayCandles.length > 0) {
      const pdHigh = Math.max(...prevDayCandles.map(c => c.high));
      const pdLow = Math.min(...prevDayCandles.map(c => c.low));

      levels.push({
        price: pdHigh,
        type: "prev_high",
        swept: false,
        strength: 70,
      });
      levels.push({
        price: pdLow,
        type: "prev_low",
        swept: false,
        strength: 70,
      });
    }

    const prevWeekCandles = candles.slice(-7 * 6, -6);
    if (prevWeekCandles.length > 0) {
      const pwHigh = Math.max(...prevWeekCandles.map(c => c.high));
      const pwLow = Math.min(...prevWeekCandles.map(c => c.low));

      levels.push({
        price: pwHigh,
        type: "prev_week_high",
        swept: false,
        strength: 80,
      });
      levels.push({
        price: pwLow,
        type: "prev_week_low",
        swept: false,
        strength: 80,
      });
    }
  }

  markSweptLevels(levels, candles, atr);
  return levels;
}

function groupNearLevels(
  prices: number[],
  tolerance: number,
): { price: number; count: number }[] {
  const groups: { price: number; count: number; sum: number }[] = [];

  for (const p of prices) {
    const existing = groups.find(g => Math.abs(g.price - p) <= tolerance);
    if (existing) {
      existing.count++;
      existing.sum += p;
      existing.price = existing.sum / existing.count;
    } else {
      groups.push({ price: p, count: 1, sum: p });
    }
  }

  return groups;
}

function markSweptLevels(
  levels: LiquidityLevel[],
  candles: Candle[],
  atr: number,
): void {
  const recentCandles = candles.slice(-20);

  for (const level of levels) {
    const sweepBuffer = atr * 0.1;

    for (const c of recentCandles) {
      if (
        (level.type === "equal_highs" || level.type === "prev_high" || level.type === "prev_week_high") &&
        c.high > level.price + sweepBuffer
      ) {
        level.swept = true;
        level.sweepTime = c.time;
        break;
      }
      if (
        (level.type === "equal_lows" || level.type === "prev_low" || level.type === "prev_week_low") &&
        c.low < level.price - sweepBuffer
      ) {
        level.swept = true;
        level.sweepTime = c.time;
        break;
      }
    }
  }
}

export function detectLiquidityGrabs(
  candles: Candle[],
  levels: LiquidityLevel[],
): LiquidityGrab[] {
  const grabs: LiquidityGrab[] = [];
  const atr = calcATR(candles);
  const minSweep = atr * 0.1;
  const minReversal = atr * 0.3;

  for (let i = 5; i < candles.length - 1; i++) {
    const c = candles[i]!;
    const next = candles[i + 1]!;

    for (const level of levels) {
      if (level.swept) continue;

      const highSweep =
        (level.type === "equal_highs" || level.type === "prev_high" || level.type === "prev_week_high") &&
        c.high > level.price + minSweep;

      if (highSweep) {
        const reversalSize = c.high - c.close;
        const nextDown = next.close < c.close;

        if (reversalSize > minReversal || nextDown) {
          const strength = Math.min(100, (reversalSize / atr) * 50);
          grabs.push({
            time: c.time,
            price: c.high,
            type: "sweep_high",
            levelSwept: level.price,
            reversalStrength: strength,
            confirmed: reversalSize > minReversal && nextDown,
          });
          level.swept = true;
          level.sweepTime = c.time;
        }
      }

      const lowSweep =
        (level.type === "equal_lows" || level.type === "prev_low" || level.type === "prev_week_low") &&
        c.low < level.price - minSweep;

      if (lowSweep) {
        const reversalSize = c.close - c.low;
        const nextUp = next.close > c.close;

        if (reversalSize > minReversal || nextUp) {
          const strength = Math.min(100, (reversalSize / atr) * 50);
          grabs.push({
            time: c.time,
            price: c.low,
            type: "sweep_low",
            levelSwept: level.price,
            reversalStrength: strength,
            confirmed: reversalSize > minReversal && nextUp,
          });
          level.swept = true;
          level.sweepTime = c.time;
        }
      }
    }
  }

  return grabs.slice(-10);
}

export function recentLiquidityGrab(
  grabs: LiquidityGrab[],
  lookbackBars = 10,
  candles: Candle[],
): LiquidityGrab | null {
  if (grabs.length === 0 || candles.length === 0) return null;
  const cutoff = candles[Math.max(0, candles.length - lookbackBars)]!.time;
  const recent = grabs.filter(g => g.time >= cutoff && g.confirmed);
  return recent[recent.length - 1] ?? null;
}
