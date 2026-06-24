import type { Candle, SwingPoint } from "../types.js";

export interface SRLevel {
  price: number;
  type: "support" | "resistance";
  touches: number;
  touchScore: number;
  rejectionScore: number;
  historicalScore: number;
  totalScore: number;
  originTime: Date;
  lastTouchTime: Date;
}

function scoreTouches(count: number): number {
  if (count >= 4) return 40;
  if (count === 3) return 30;
  if (count === 2) return 20;
  return 10;
}

function scoreRejection(wick: number, atr: number): number {
  if (atr === 0) return 0;
  if (wick > atr) return 30;
  if (wick > atr * 0.5) return 20;
  if (wick > atr * 0.25) return 10;
  return 0;
}

function scoreHistorical(originTime: Date, referenceTime: Date): number {
  const days = (referenceTime.getTime() - originTime.getTime()) / (1000 * 60 * 60 * 24);
  if (days >= 180) return 30;
  if (days >= 90) return 20;
  if (days >= 30) return 10;
  return 0;
}

function calcSwingWick(candle: Candle, type: "high" | "low"): number {
  if (type === "high") {
    return candle.high - Math.max(candle.open, candle.close);
  }
  return Math.min(candle.open, candle.close) - candle.low;
}

function maxRejectionWick(
  swings: SwingPoint[],
  candleByIndex: Map<number, Candle>,
): number {
  let max = 0;
  for (const s of swings) {
    const candle = candleByIndex.get(s.index);
    if (!candle) continue;
    const wick = calcSwingWick(candle, s.type);
    if (wick > max) max = wick;
  }
  return max;
}

export function detectSRLevels(
  swings: SwingPoint[],
  candles: Candle[],
  atr: number,
  minScore = 70,
): SRLevel[] {
  if (swings.length === 0 || candles.length === 0 || atr === 0) return [];

  const referenceTime = candles[candles.length - 1]!.time;

  const candleByIndex = new Map<number, Candle>();
  for (const s of swings) {
    if (candles[s.index]) candleByIndex.set(s.index, candles[s.index]!);
  }

  const highs = swings.filter(s => s.type === "high").sort((a, b) => a.price - b.price);
  const lows = swings.filter(s => s.type === "low").sort((a, b) => a.price - b.price);

  const levels: SRLevel[] = [];

  for (const group of [
    { swings: highs, type: "resistance" as const },
    { swings: lows, type: "support" as const },
  ]) {
    const clustered: SwingPoint[][] = [];

    for (const swing of group.swings) {
      const existing = clustered.find(cluster =>
        Math.abs(cluster[0]!.price - swing.price) <= atr,
      );
      if (existing) {
        existing.push(swing);
      } else {
        clustered.push([swing]);
      }
    }

    for (const cluster of clustered) {
      const touches = cluster.length;
      const originTime = cluster.reduce(
        (min, s) => (s.time < min ? s.time : min),
        cluster[0]!.time,
      );
      const lastTouchTime = cluster.reduce(
        (max, s) => (s.time > max ? s.time : max),
        cluster[0]!.time,
      );

      const avgPrice =
        cluster.reduce((s, p) => s + p.price, 0) / cluster.length;

      const maxWick = maxRejectionWick(cluster, candleByIndex);

      const ts = scoreTouches(touches);
      const rs = scoreRejection(maxWick, atr);
      const hs = scoreHistorical(originTime, referenceTime);
      const total = ts + rs + hs;

      if (total < minScore) continue;

      levels.push({
        price: Math.round(avgPrice * 1e6) / 1e6,
        type: group.type,
        touches,
        touchScore: ts,
        rejectionScore: rs,
        historicalScore: hs,
        totalScore: total,
        originTime,
        lastTouchTime,
      });
    }
  }

  return levels.sort((a, b) => b.totalScore - a.totalScore);
}
