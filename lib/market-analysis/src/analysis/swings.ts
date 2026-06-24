import type { Candle, SwingPoint, StructurePoint, StructureLabel } from "../types.js";

export function detectSwings(candles: Candle[], lookback = 3): SwingPoint[] {
  const swings: SwingPoint[] = [];
  const L = lookback;

  for (let i = L; i < candles.length - L; i++) {
    const c = candles[i]!;
    let isSwingHigh = true;
    let isSwingLow = true;

    for (let offset = 1; offset <= L; offset++) {
      const before = candles[i - offset]!;
      const after = candles[i + offset]!;

      if (before.high >= c.high || after.high >= c.high) isSwingHigh = false;
      if (before.low <= c.low || after.low <= c.low) isSwingLow = false;

      if (!isSwingHigh && !isSwingLow) break;
    }

    if (isSwingHigh) swings.push({ time: c.time, price: c.high, type: "high", index: i });
    if (isSwingLow) swings.push({ time: c.time, price: c.low, type: "low", index: i });
  }

  return swings.sort((a, b) => a.index - b.index);
}

export function labelStructure(swings: SwingPoint[]): StructurePoint[] {
  const highs = swings.filter(s => s.type === "high");
  const lows = swings.filter(s => s.type === "low");

  const structured: StructurePoint[] = [];

  for (let i = 1; i < highs.length; i++) {
    const prev = highs[i - 1]!;
    const curr = highs[i]!;
    let label: StructureLabel;

    if (curr.price > prev.price) {
      label = "HH";
    } else {
      label = "LH";
    }
    structured.push({ ...curr, label });
  }

  for (let i = 1; i < lows.length; i++) {
    const prev = lows[i - 1]!;
    const curr = lows[i]!;
    let label: StructureLabel;

    if (curr.price > prev.price) {
      label = "HL";
    } else {
      label = "LL";
    }
    structured.push({ ...curr, label });
  }

  structured.sort((a, b) => a.index - b.index);

  for (let i = 1; i < structured.length; i++) {
    const prev = structured[i - 1]!;
    const curr = structured[i]!;
    if (prev.label === "LH" && curr.label === "HL" && curr.price > prev.price) {
      curr.label = "BOS_UP";
    } else if (prev.label === "HL" && curr.label === "LH" && curr.price < prev.price) {
      curr.label = "BOS_DOWN";
    }
  }

  return structured;
}

export function detectTrend(swings: SwingPoint[]): "bullish" | "bearish" | "neutral" {
  const highs = swings.filter(s => s.type === "high").slice(-4);
  const lows = swings.filter(s => s.type === "low").slice(-4);

  if (highs.length < 2 || lows.length < 2) return "neutral";

  const hhCount = highs.slice(1).filter((h, i) => h.price > highs[i]!.price).length;
  const hlCount = lows.slice(1).filter((l, i) => l.price > lows[i]!.price).length;
  const llCount = lows.slice(1).filter((l, i) => l.price < lows[i]!.price).length;
  const lhCount = highs.slice(1).filter((h, i) => h.price < highs[i]!.price).length;

  const bullScore = hhCount + hlCount;
  const bearScore = llCount + lhCount;

  if (bullScore > bearScore + 1) return "bullish";
  if (bearScore > bullScore + 1) return "bearish";
  return "neutral";
}

export function calcATR(candles: Candle[], period = 14): number {
  if (candles.length < 2) return 0;

  const trValues = candles.slice(1).map((c, i) => {
    const prev = candles[i]!;
    return Math.max(
      c.high - c.low,
      Math.abs(c.high - prev.close),
      Math.abs(c.low - prev.close),
    );
  });

  const relevant = trValues.slice(-period);
  if (relevant.length === 0) return 0;
  return relevant.reduce((a, b) => a + b, 0) / relevant.length;
}

export function getMostRecentSwings(
  swings: SwingPoint[],
  type: "high" | "low",
  count = 3,
): SwingPoint[] {
  return swings.filter(s => s.type === type).slice(-count);
}
