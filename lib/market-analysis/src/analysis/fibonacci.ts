import type { Candle, SwingPoint, FibAnalysis, FibLevel } from "../types.js";
import { detectTrend } from "./swings.js";

const FIB_RATIOS = [
  { ratio: 0, label: "0%" },
  { ratio: 0.236, label: "23.6%" },
  { ratio: 0.382, label: "38.2%" },
  { ratio: 0.5, label: "50%" },
  { ratio: 0.618, label: "61.8%" },
  { ratio: 0.705, label: "70.5%" },
  { ratio: 0.786, label: "78.6%" },
  { ratio: 1.0, label: "100%" },
];

export function calcFibonacci(swings: SwingPoint[], currentPrice: number): FibAnalysis | null {
  const highs = swings.filter(s => s.type === "high");
  const lows = swings.filter(s => s.type === "low");

  if (highs.length < 1 || lows.length < 1) return null;

  const trend = detectTrend(swings);

  // Use the absolute highest and lowest of ALL detected swings.
  // 0 = Swing Low (anchor), 1 = Swing High (anchor) — always.
  const swingHigh = highs.reduce((max, s) => (s.price > max ? s.price : max), -Infinity);
  const swingLow = lows.reduce((min, s) => (s.price < min ? s.price : min), Infinity);
  const range = swingHigh - swingLow;

  if (range <= 0) return null;

  // Levels always run from 0 (swingLow) to 1 (swingHigh).
  const levels: FibLevel[] = FIB_RATIOS.map(({ ratio, label }) => ({
    ratio,
    label,
    price: swingLow + ratio * range,
  }));

  // Equilibrium is always exactly 0.5 of the full range.
  const equilibrium = swingLow + 0.5 * range;

  // Premium zone: above equilibrium (price > 0.5) → shorts preferred.
  // Discount zone: below equilibrium (price < 0.5) → longs preferred.
  const premiumZone = { top: swingHigh, bottom: equilibrium };
  const discountZone = { top: equilibrium, bottom: swingLow };

  let currentPriceBias: "premium" | "discount" | "equilibrium";
  if (currentPrice > equilibrium) {
    currentPriceBias = "premium";
  } else if (currentPrice < equilibrium) {
    currentPriceBias = "discount";
  } else {
    currentPriceBias = "equilibrium";
  }

  return {
    swingHigh,
    swingLow,
    trend,
    levels,
    premiumZone,
    discountZone,
    equilibrium,
    currentPriceBias,
  };
}

export function findNearestFibLevel(
  price: number,
  fib: FibAnalysis,
  tolerance = 0.001,
): number | null {
  const range = fib.swingHigh - fib.swingLow;
  const tol = range * tolerance * 10;

  let nearest: FibLevel | null = null;
  let minDist = Infinity;

  for (const level of fib.levels) {
    const dist = Math.abs(price - level.price);
    if (dist < minDist && dist < tol) {
      minDist = dist;
      nearest = level;
    }
  }

  return nearest?.ratio ?? null;
}

// Price strictly above 0.5 → premium → shorts preferred.
export function isPremiumZone(price: number, fib: FibAnalysis): boolean {
  return price > fib.equilibrium;
}

// Price strictly below 0.5 → discount → longs preferred.
export function isDiscountZone(price: number, fib: FibAnalysis): boolean {
  return price < fib.equilibrium;
}

// Returns the ratio (0–1) of where a price sits within the swing range.
// 0 = at swingLow, 1 = at swingHigh, 0.5 = equilibrium.
export function getPricePosition(price: number, fib: FibAnalysis): number {
  const range = fib.swingHigh - fib.swingLow;
  if (range === 0) return 0.5;
  return (price - fib.swingLow) / range;
}

// Levels always run swingLow → swingHigh, so no direction check needed.
export function getFibLevelForZone(zonePrice: number, fib: FibAnalysis): number | null {
  const keyLevels = [0.5, 0.618, 0.705, 0.786];
  const range = fib.swingHigh - fib.swingLow;

  for (const ratio of keyLevels) {
    const levelPrice = fib.swingLow + ratio * range;
    if (Math.abs(zonePrice - levelPrice) / range < 0.05) {
      return ratio;
    }
  }
  return null;
}

export function calcFibForCandles(candles: Candle[], swings: SwingPoint[]): FibAnalysis | null {
  if (candles.length === 0) return null;
  const currentPrice = candles[candles.length - 1]!.close;
  return calcFibonacci(swings, currentPrice);
}
