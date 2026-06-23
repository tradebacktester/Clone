import type { Candle, SupplyDemandZone, FibAnalysis } from "../types.js";
import { calcATR } from "./swings.js";
import { getFibLevelForZone } from "./fibonacci.js";

interface RawZoneCandidate {
  baseTop: number;
  baseBottom: number;
  moveSize: number;
  direction: "bullish" | "bearish";
  originIndex: number;
  originTime: Date;
  baseCandles: number;
}

function findImpulseCandles(candles: Candle[], atr: number): RawZoneCandidate[] {
  const candidates: RawZoneCandidate[] = [];
  const impulseThreshold = atr * 1.5;

  for (let i = 3; i < candles.length; i++) {
    const c = candles[i]!;
    const body = Math.abs(c.close - c.open);

    if (body < impulseThreshold) continue;

    const direction: "bullish" | "bearish" = c.close > c.open ? "bullish" : "bearish";

    let baseTop = c.open;
    let baseBottom = c.open;
    let baseCount = 0;

    for (let b = i - 1; b >= Math.max(0, i - 4); b--) {
      const base = candles[b]!;
      const baseBody = Math.abs(base.close - base.open);
      if (baseBody > atr * 0.8) break;

      baseTop = Math.max(baseTop, base.high);
      baseBottom = Math.min(baseBottom, base.low);
      baseCount++;
    }

    if (baseCount === 0) {
      baseTop = Math.max(c.open, c.high * 0.998);
      baseBottom = Math.min(c.open, c.low * 1.002);
    }

    candidates.push({
      baseTop,
      baseBottom,
      moveSize: body / atr,
      direction,
      originIndex: i,
      originTime: c.time,
      baseCandles: baseCount,
    });
  }

  return candidates;
}

function scoreZone(candidate: RawZoneCandidate, atr: number): number {
  let score = 50;

  if (candidate.moveSize > 3) score += 20;
  else if (candidate.moveSize > 2) score += 12;
  else if (candidate.moveSize > 1.5) score += 6;

  if (candidate.baseCandles >= 2) score += 10;
  else if (candidate.baseCandles === 1) score += 5;

  const zoneHeight = candidate.baseTop - candidate.baseBottom;
  if (zoneHeight < atr * 0.5) score += 8;
  else if (zoneHeight > atr * 1.5) score -= 8;

  return Math.min(100, Math.max(0, score));
}

function countRetests(
  zone: { top: number; bottom: number },
  candles: Candle[],
  fromIndex: number,
): number {
  let count = 0;
  let inZone = false;

  for (let i = fromIndex + 1; i < candles.length; i++) {
    const c = candles[i]!;
    const touchesZone = c.low <= zone.top && c.high >= zone.bottom;

    if (touchesZone && !inZone) {
      count++;
      inZone = true;
    } else if (!touchesZone) {
      inZone = false;
    }
  }

  return count;
}

function isZoneBroken(
  zone: { top: number; bottom: number; type: "supply" | "demand" },
  candles: Candle[],
  fromIndex: number,
): boolean {
  for (let i = fromIndex + 1; i < candles.length; i++) {
    const c = candles[i]!;
    if (zone.type === "demand" && c.close < zone.bottom - (zone.top - zone.bottom) * 0.3) return true;
    if (zone.type === "supply" && c.close > zone.top + (zone.top - zone.bottom) * 0.3) return true;
  }
  return false;
}

export function detectZones(
  pair: string,
  timeframe: string,
  candles: Candle[],
  fib: FibAnalysis | null,
  maxZones = 8,
): SupplyDemandZone[] {
  if (candles.length < 20) return [];

  const atr = calcATR(candles);
  if (atr === 0) return [];

  const candidates = findImpulseCandles(candles, atr);
  const zones: SupplyDemandZone[] = [];
  const usedRanges: { top: number; bottom: number }[] = [];

  for (const cand of candidates.slice().reverse()) {
    const zoneType: "demand" | "supply" = cand.direction === "bullish" ? "demand" : "supply";

    const overlapping = usedRanges.some(r => {
      const overlap =
        Math.min(r.top, cand.baseTop) - Math.max(r.bottom, cand.baseBottom);
      const minSize = Math.min(r.top - r.bottom, cand.baseTop - cand.baseBottom);
      return minSize > 0 && overlap / minSize > 0.5;
    });

    if (overlapping) continue;

    const rawScore = scoreZone(cand, atr);
    const tested = countRetests(
      { top: cand.baseTop, bottom: cand.baseBottom },
      candles,
      cand.originIndex,
    );

    const score = Math.max(0, rawScore - tested * 8);

    const broken = isZoneBroken(
      { top: cand.baseTop, bottom: cand.baseBottom, type: zoneType },
      candles,
      cand.originIndex,
    );

    if (broken) continue;

    const freshness: "fresh" | "tested" | "stale" =
      tested === 0 ? "fresh" : tested <= 2 ? "tested" : "stale";

    const midprice = (cand.baseTop + cand.baseBottom) / 2;
    const fibLevel = fib ? getFibLevelForZone(midprice, fib) : null;

    usedRanges.push({ top: cand.baseTop, bottom: cand.baseBottom });

    zones.push({
      pair,
      timeframe,
      zoneType,
      priceTop: cand.baseTop,
      priceBottom: cand.baseBottom,
      strength: score,
      tested,
      active: true,
      fibLevel,
      originTime: cand.originTime,
      freshness,
    });

    if (zones.length >= maxZones) break;
  }

  return zones;
}

export function isPriceInZone(
  price: number,
  zone: SupplyDemandZone,
  atr: number,
): boolean {
  const buffer = atr * 0.5;
  return price >= zone.priceBottom - buffer && price <= zone.priceTop + buffer;
}

export function findActiveZoneForPrice(
  price: number,
  zones: SupplyDemandZone[],
  atr: number,
): SupplyDemandZone | null {
  return (
    zones.find(z => z.active && isPriceInZone(price, z, atr)) ?? null
  );
}
