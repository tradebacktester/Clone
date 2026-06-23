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

  const recentHigh = highs.slice(-3).reduce((a, b) => (b.price > a.price ? b : a));
  const recentLow = lows.slice(-3).reduce((a, b) => (b.price < a.price ? b : a));

  const swingHigh = recentHigh.price;
  const swingLow = recentLow.price;
  const range = swingHigh - swingLow;

  if (range <= 0) return null;

  const levels: FibLevel[] = FIB_RATIOS.map(({ ratio, label }) => {
    const price = trend === "bullish"
      ? swingLow + ratio * range
      : swingHigh - ratio * range;
    return { ratio, label, price };
  });

  const equilibrium = swingLow + 0.5 * range;

  const premiumZone = {
    top: swingHigh,
    bottom: equilibrium,
  };

  const discountZone = {
    top: equilibrium,
    bottom: swingLow,
  };

  let currentPriceBias: "premium" | "discount" | "equilibrium";
  if (Math.abs(currentPrice - equilibrium) < range * 0.05) {
    currentPriceBias = "equilibrium";
  } else if (currentPrice > equilibrium) {
    currentPriceBias = "premium";
  } else {
    currentPriceBias = "discount";
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

export function isPremiumZone(price: number, fib: FibAnalysis): boolean {
  return price >= fib.equilibrium;
}

export function isDiscountZone(price: number, fib: FibAnalysis): boolean {
  return price <= fib.equilibrium;
}

export function getFibLevelForZone(zonePrice: number, fib: FibAnalysis): number | null {
  const keyLevels = [0.5, 0.618, 0.705, 0.786];
  const range = fib.swingHigh - fib.swingLow;

  for (const ratio of keyLevels) {
    const levelPrice = fib.trend === "bullish"
      ? fib.swingLow + ratio * range
      : fib.swingHigh - ratio * range;

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
