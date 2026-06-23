import type { Candle, AMDSequence, LiquidityGrab } from "../types.js";
import { calcATR } from "./swings.js";

interface RangeInfo {
  high: number;
  low: number;
  bars: number;
  isRange: boolean;
}

function detectRange(candles: Candle[], atr: number, minBars = 6): RangeInfo {
  const recent = candles.slice(-30);
  if (recent.length < minBars) {
    return { high: 0, low: 0, bars: 0, isRange: false };
  }

  for (let window = recent.length; window >= minBars; window--) {
    const slice = recent.slice(-window);
    const high = Math.max(...slice.map(c => c.high));
    const low = Math.min(...slice.map(c => c.low));
    const range = high - low;

    const avgBodies = slice.reduce((s, c) => s + Math.abs(c.close - c.open), 0) / slice.length;

    if (range < atr * 3 && avgBodies < atr * 0.7) {
      return { high, low, bars: window, isRange: true };
    }
  }

  return { high: 0, low: 0, bars: 0, isRange: false };
}

function detectManipulation(
  candles: Candle[],
  range: RangeInfo,
  grabs: LiquidityGrab[],
  atr: number,
): { found: boolean; direction: "bullish" | "bearish" | null; time: Date | null } {
  if (!range.isRange) return { found: false, direction: null, time: null };

  const recent = candles.slice(-15);
  const sweepBuffer = atr * 0.15;

  for (let i = 0; i < recent.length; i++) {
    const c = recent[i]!;

    if (c.high > range.high + sweepBuffer) {
      const reversalCandle = recent.slice(i).find(r => r.close < range.high);
      if (reversalCandle) {
        return { found: true, direction: "bearish", time: c.time };
      }
    }

    if (c.low < range.low - sweepBuffer) {
      const reversalCandle = recent.slice(i).find(r => r.close > range.low);
      if (reversalCandle) {
        return { found: true, direction: "bullish", time: c.time };
      }
    }
  }

  const recentGrab = grabs.slice(-3).find(g => g.confirmed);
  if (recentGrab) {
    const direction = recentGrab.type === "sweep_low" ? "bullish" : "bearish";
    return { found: true, direction, time: recentGrab.time };
  }

  return { found: false, direction: null, time: null };
}

function detectDistribution(
  candles: Candle[],
  manipTime: Date,
  direction: "bullish" | "bearish",
  atr: number,
): { found: boolean; startTime: Date | null } {
  const afterManip = candles.filter(c => c.time > manipTime);
  if (afterManip.length < 3) return { found: false, startTime: null };

  const slice = afterManip.slice(0, 10);
  const firstClose = slice[0]!.close;
  const lastClose = slice[slice.length - 1]!.close;
  const move = Math.abs(lastClose - firstClose);

  const isDirectional =
    direction === "bullish"
      ? lastClose > firstClose && move > atr * 1.5
      : lastClose < firstClose && move > atr * 1.5;

  if (isDirectional) {
    return { found: true, startTime: slice[0]!.time };
  }

  return { found: false, startTime: null };
}

export function detectAMD(candles: Candle[], grabs: LiquidityGrab[]): AMDSequence {
  if (candles.length < 20) {
    return {
      phase: "none",
      direction: null,
      accumulationStart: null,
      manipulationTime: null,
      distributionStart: null,
      manipulationHigh: null,
      manipulationLow: null,
      rangeLow: null,
      rangeHigh: null,
      complete: false,
    };
  }

  const atr = calcATR(candles);
  if (atr === 0) {
    return {
      phase: "none",
      direction: null,
      accumulationStart: null,
      manipulationTime: null,
      distributionStart: null,
      manipulationHigh: null,
      manipulationLow: null,
      rangeLow: null,
      rangeHigh: null,
      complete: false,
    };
  }

  const range = detectRange(candles, atr);

  if (!range.isRange) {
    const recentGrab = grabs.slice(-1)[0];
    if (recentGrab?.confirmed) {
      const direction = recentGrab.type === "sweep_low" ? "bullish" : "bearish";
      const distResult = detectDistribution(candles, recentGrab.time, direction, atr);

      if (distResult.found) {
        return {
          phase: "distribution",
          direction,
          accumulationStart: null,
          manipulationTime: recentGrab.time,
          distributionStart: distResult.startTime,
          manipulationHigh: recentGrab.type === "sweep_high" ? recentGrab.price : null,
          manipulationLow: recentGrab.type === "sweep_low" ? recentGrab.price : null,
          rangeLow: null,
          rangeHigh: null,
          complete: true,
        };
      }

      return {
        phase: "manipulation",
        direction,
        accumulationStart: null,
        manipulationTime: recentGrab.time,
        distributionStart: null,
        manipulationHigh: recentGrab.type === "sweep_high" ? recentGrab.price : null,
        manipulationLow: recentGrab.type === "sweep_low" ? recentGrab.price : null,
        rangeLow: null,
        rangeHigh: null,
        complete: false,
      };
    }

    return {
      phase: "none",
      direction: null,
      accumulationStart: null,
      manipulationTime: null,
      distributionStart: null,
      manipulationHigh: null,
      manipulationLow: null,
      rangeLow: null,
      rangeHigh: null,
      complete: false,
    };
  }

  const accumulationStart = candles[candles.length - range.bars]?.time ?? null;

  const manip = detectManipulation(candles, range, grabs, atr);

  if (!manip.found) {
    return {
      phase: "accumulation",
      direction: null,
      accumulationStart,
      manipulationTime: null,
      distributionStart: null,
      manipulationHigh: range.high,
      manipulationLow: range.low,
      rangeLow: range.low,
      rangeHigh: range.high,
      complete: false,
    };
  }

  const distResult = manip.direction
    ? detectDistribution(candles, manip.time!, manip.direction, atr)
    : { found: false, startTime: null };

  if (distResult.found) {
    return {
      phase: "distribution",
      direction: manip.direction,
      accumulationStart,
      manipulationTime: manip.time,
      distributionStart: distResult.startTime,
      manipulationHigh: range.high,
      manipulationLow: range.low,
      rangeLow: range.low,
      rangeHigh: range.high,
      complete: true,
    };
  }

  return {
    phase: "manipulation",
    direction: manip.direction,
    accumulationStart,
    manipulationTime: manip.time,
    distributionStart: null,
    manipulationHigh: range.high,
    manipulationLow: range.low,
    rangeLow: range.low,
    rangeHigh: range.high,
    complete: false,
  };
}
