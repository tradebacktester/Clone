import type { Candle } from "../types.js";

export interface ConfirmationResult {
  score: number;      // 0–100
  valid: boolean;     // score ≥ 70
  hasDirection: boolean; // close direction matches expected
  hasBOS: boolean;       // close breaks the previous candle's high (buy) or low (sell)
  hasBody: boolean;      // body > 60% of full candle range
}

// ─── Scoring weights (max 100) ────────────────────────────────────────────────
//   Direction  (bullish/bearish close)   = +30
//   BOS        (close > prev high/low)   = +40
//   Body       (body > 60% range)        = +30
//
// Valid combinations that reach ≥ 70:
//   Direction + BOS               = 70  ✓
//   BOS       + Body              = 70  ✓
//   Direction + BOS + Body        = 100 ✓
// ─────────────────────────────────────────────────────────────────────────────

export function scoreConfirmationCandle(
  candle: Candle,
  prevCandle: Candle,
  direction: "buy" | "sell",
): ConfirmationResult {
  const body  = Math.abs(candle.close - candle.open);
  const range = candle.high - candle.low;

  // 1. Close direction
  const hasDirection =
    direction === "buy"
      ? candle.close > candle.open  // bullish close
      : candle.close < candle.open; // bearish close

  // 2. Break previous candle's structural extreme
  const hasBOS =
    direction === "buy"
      ? candle.close > prevCandle.high  // buy: close above prev high
      : candle.close < prevCandle.low;  // sell: close below prev low

  // 3. Body occupies more than 60% of the candle's total range
  const hasBody = range > 0 && body / range > 0.6;

  const score =
    (hasDirection ? 30 : 0) +
    (hasBOS       ? 40 : 0) +
    (hasBody      ? 30 : 0);

  return { score, valid: score >= 70, hasDirection, hasBOS, hasBody };
}

// Convenience wrapper: scores the most recent closed candle.
export function confirmCurrentCandle(
  candles: Candle[],
  direction: "buy" | "sell",
): ConfirmationResult {
  const invalid: ConfirmationResult = {
    score: 0, valid: false, hasDirection: false, hasBOS: false, hasBody: false,
  };
  if (candles.length < 2) return invalid;
  const candle     = candles[candles.length - 1]!;
  const prevCandle = candles[candles.length - 2]!;
  return scoreConfirmationCandle(candle, prevCandle, direction);
}
