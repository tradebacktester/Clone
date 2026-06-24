import type { Candle, AMDSequence, LiquidityGrab } from "../types.js";
import { calcATR } from "./swings.js";

// ─── Accumulation scoring (max 30) ───────────────────────────────────────────
// Range bars in [10, 50] = +15
// Range width < 1 ATR    = +15

interface RangeInfo {
  high: number;
  low: number;
  bars: number;
  isRange: boolean;
  score: number; // 0–30
}

function detectRange(candles: Candle[], atr: number): RangeInfo {
  const NONE: RangeInfo = { high: 0, low: 0, bars: 0, isRange: false, score: 0 };
  if (candles.length < 10) return NONE;

  // Search windows from 50 bars down to 10 bars (spec: 10–50 candles).
  const maxWindow = Math.min(50, candles.length);

  for (let window = maxWindow; window >= 10; window--) {
    const slice = candles.slice(-window);
    const high = slice.reduce((m, c) => (c.high > m ? c.high : m), -Infinity);
    const low  = slice.reduce((m, c) => (c.low  < m ? c.low  : m),  Infinity);
    const width = high - low;

    // Average body must be small — confirms sideways price action.
    const avgBody = slice.reduce((s, c) => s + Math.abs(c.close - c.open), 0) / slice.length;
    if (avgBody >= atr * 0.8) continue;

    const barsScore  = window >= 10 && window <= 50 ? 15 : 0;
    const widthScore = width < atr ? 15 : 0;
    const score = barsScore + widthScore;

    if (score > 0) {
      return { high, low, bars: window, isRange: true, score };
    }
  }

  return NONE;
}

// ─── Manipulation scoring (max 35) ───────────────────────────────────────────
// Price breaks range boundary = +15
// Price returns back inside range  = +20

interface ManipResult {
  found: boolean;
  direction: "bullish" | "bearish" | null;
  time: Date | null;
  score: number; // 0–35
}

function detectManipulation(
  candles: Candle[],
  range: RangeInfo,
  grabs: LiquidityGrab[],
  atr: number,
): ManipResult {
  const NONE: ManipResult = { found: false, direction: null, time: null, score: 0 };
  if (!range.isRange) return NONE;

  const recent = candles.slice(-20);

  for (let i = 0; i < recent.length - 1; i++) {
    const c = recent[i]!;

    // Bearish manipulation: break above range high, then close back inside.
    if (c.high > range.high) {
      const returned = recent.slice(i + 1).some(r => r.close < range.high);
      const breakScore  = 15;
      const returnScore = returned ? 20 : 0;
      if (breakScore + returnScore > 0) {
        return {
          found: true,
          direction: "bearish",
          time: c.time,
          score: breakScore + returnScore,
        };
      }
    }

    // Bullish manipulation: break below range low, then close back inside.
    if (c.low < range.low) {
      const returned = recent.slice(i + 1).some(r => r.close > range.low);
      const breakScore  = 15;
      const returnScore = returned ? 20 : 0;
      if (breakScore + returnScore > 0) {
        return {
          found: true,
          direction: "bullish",
          time: c.time,
          score: breakScore + returnScore,
        };
      }
    }
  }

  // Fallback: confirmed liquidity grab qualifies as manipulation.
  const recentGrab = grabs.slice(-3).find(g => g.confirmed);
  if (recentGrab) {
    const direction = recentGrab.type === "sweep_low" ? "bullish" : "bearish";
    // Grab = break confirmed; treat as break (15) + return (20) = 35.
    return { found: true, direction, time: recentGrab.time, score: 35 };
  }

  return NONE;
}

// ─── Distribution scoring (max 35) ───────────────────────────────────────────
// Break structure (directional move begins) = +15
// Move > 1.5 ATR                            = +20

interface DistResult {
  found: boolean;
  startTime: Date | null;
  score: number; // 0–35
}

function detectDistribution(
  candles: Candle[],
  manipTime: Date,
  direction: "bullish" | "bearish",
  atr: number,
): DistResult {
  const NONE: DistResult = { found: false, startTime: null, score: 0 };
  const afterManip = candles.filter(c => c.time > manipTime);
  if (afterManip.length < 2) return NONE;

  const slice = afterManip.slice(0, 10);
  const firstClose = slice[0]!.close;
  const lastClose  = slice[slice.length - 1]!.close;
  const move       = Math.abs(lastClose - firstClose);

  const isDirectional =
    direction === "bullish"
      ? lastClose > firstClose
      : lastClose < firstClose;

  if (!isDirectional) return NONE;

  const bosScore   = 15; // directional move = break of structure
  const moveScore  = move > atr * 1.5 ? 20 : 0;

  if (bosScore + moveScore === 0) return NONE;

  return { found: true, startTime: slice[0]!.time, score: bosScore + moveScore };
}

// ─── Null AMD builder ─────────────────────────────────────────────────────────
function nullAMD(): AMDSequence {
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
    amdScore: 0,
  };
}

// ─── Main export ──────────────────────────────────────────────────────────────
// AMD Score = accScore + manipScore + distScore (max 100).
// Valid AMD sequence requires amdScore ≥ 80.
export function detectAMD(candles: Candle[], grabs: LiquidityGrab[]): AMDSequence {
  if (candles.length < 20) return nullAMD();

  const atr = calcATR(candles);
  if (atr === 0) return nullAMD();

  const range = detectRange(candles, atr);

  // ── No range found: check for a standalone manipulation/distribution pair ──
  if (!range.isRange) {
    const recentGrab = grabs.slice(-1)[0];
    if (!recentGrab?.confirmed) return nullAMD();

    const direction = recentGrab.type === "sweep_low" ? "bullish" : "bearish";
    const manipScore = 35; // confirmed grab = full manipulation score
    const dist = detectDistribution(candles, recentGrab.time, direction, atr);
    const amdScore = manipScore + dist.score;

    if (dist.found) {
      return {
        phase: "distribution",
        direction,
        accumulationStart: null,
        manipulationTime: recentGrab.time,
        distributionStart: dist.startTime,
        manipulationHigh: recentGrab.type === "sweep_high" ? recentGrab.price : null,
        manipulationLow:  recentGrab.type === "sweep_low"  ? recentGrab.price : null,
        rangeLow: null,
        rangeHigh: null,
        complete: amdScore >= 80,
        amdScore,
      };
    }

    return {
      phase: "manipulation",
      direction,
      accumulationStart: null,
      manipulationTime: recentGrab.time,
      distributionStart: null,
      manipulationHigh: recentGrab.type === "sweep_high" ? recentGrab.price : null,
      manipulationLow:  recentGrab.type === "sweep_low"  ? recentGrab.price : null,
      rangeLow: null,
      rangeHigh: null,
      complete: false,
      amdScore,
    };
  }

  // ── Range found: full Accumulation → Manipulation → Distribution path ──────
  const accScore = range.score; // 0–30
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
      amdScore: accScore,
    };
  }

  const dist = manip.direction
    ? detectDistribution(candles, manip.time!, manip.direction, atr)
    : { found: false, startTime: null, score: 0 };

  const amdScore = accScore + manip.score + dist.score;

  if (dist.found) {
    return {
      phase: "distribution",
      direction: manip.direction,
      accumulationStart,
      manipulationTime: manip.time,
      distributionStart: dist.startTime,
      manipulationHigh: range.high,
      manipulationLow: range.low,
      rangeLow: range.low,
      rangeHigh: range.high,
      complete: amdScore >= 80,
      amdScore,
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
    amdScore,
  };
}
