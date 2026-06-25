import type { RegimeType } from "./regime_detector.js";

export type WeightCategory = "zone" | "liquidity" | "amd" | "confirmation";

export interface RegimeWeightProfile {
  regime: RegimeType;
  zone: number;
  liquidity: number;
  amd: number;
  confirmation: number;
  sampleSize: number;
  lastUpdated: Date;
}

export interface RegimeTradeRecord {
  regime: RegimeType;
  pnl: number;
  setupScore: number;
  zoneType: "demand" | "supply";
  liquiditySweep: boolean;
  amdPattern: string;
  fibLevel: number;
  session: string;
}

export interface RegimePerformanceStats {
  regime: RegimeType;
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  profitFactor: number;
  maxDrawdown: number;
  avgSetupScore: number;
  zoneWinRate: number;
  liquidityWinRate: number;
  amdWinRate: number;
  confirmationWinRate: number;
  bestComponent: WeightCategory;
}

// Base weights as specified (Zone 30%, Liquidity 25%, AMD 25%, Confirmation 20%)
export const BASE_WEIGHTS: Record<WeightCategory, number> = {
  zone: 0.30,
  liquidity: 0.25,
  amd: 0.25,
  confirmation: 0.20,
};

// Default per-regime starting weights (regime-adjusted from base)
export const DEFAULT_REGIME_WEIGHTS: Record<RegimeType, RegimeWeightProfile> = {
  trending: {
    regime: "trending",
    zone: 0.25,
    liquidity: 0.32,
    amd: 0.21,
    confirmation: 0.22,
    sampleSize: 0,
    lastUpdated: new Date(0),
  },
  ranging: {
    regime: "ranging",
    zone: 0.33,
    liquidity: 0.21,
    amd: 0.32,
    confirmation: 0.14,
    sampleSize: 0,
    lastUpdated: new Date(0),
  },
  volatile: {
    regime: "volatile",
    zone: 0.33,
    liquidity: 0.20,
    amd: 0.20,
    confirmation: 0.27,
    sampleSize: 0,
    lastUpdated: new Date(0),
  },
  low_volatility: {
    regime: "low_volatility",
    zone: 0.32,
    liquidity: 0.23,
    amd: 0.28,
    confirmation: 0.17,
    sampleSize: 0,
    lastUpdated: new Date(0),
  },
};

const MIN_WEIGHT = 0.05;
const MAX_WEIGHT = 0.60;
const MIN_SAMPLES_TO_ADAPT = 30;
const DEFAULT_LEARNING_RATE = 0.10;

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function normalizeWeights(
  raw: Record<WeightCategory, number>,
): Record<WeightCategory, number> {
  const clamped: Record<WeightCategory, number> = {
    zone: clamp(raw.zone, MIN_WEIGHT, MAX_WEIGHT),
    liquidity: clamp(raw.liquidity, MIN_WEIGHT, MAX_WEIGHT),
    amd: clamp(raw.amd, MIN_WEIGHT, MAX_WEIGHT),
    confirmation: clamp(raw.confirmation, MIN_WEIGHT, MAX_WEIGHT),
  };
  const total = clamped.zone + clamped.liquidity + clamped.amd + clamped.confirmation;
  if (total === 0) return { zone: 0.30, liquidity: 0.25, amd: 0.25, confirmation: 0.20 };
  return {
    zone: clamped.zone / total,
    liquidity: clamped.liquidity / total,
    amd: clamped.amd / total,
    confirmation: clamped.confirmation / total,
  };
}

function calcCategoryWinRate(
  trades: RegimeTradeRecord[],
  category: WeightCategory,
): { wins: number; total: number; winRate: number } {
  const relevant = trades.filter(t => {
    switch (category) {
      case "zone":         return t.zoneType === "demand" || t.zoneType === "supply";
      case "liquidity":    return t.liquiditySweep;
      case "amd":          return t.amdPattern === "distribution" || t.amdPattern === "manipulation";
      case "confirmation": return t.fibLevel > 0 || t.session === "london" || t.session === "newyork";
    }
  });
  if (relevant.length === 0) return { wins: 0, total: 0, winRate: 0.5 };
  const wins = relevant.filter(t => t.pnl > 0).length;
  return { wins, total: relevant.length, winRate: wins / relevant.length };
}

export function calcRegimePerformance(
  trades: RegimeTradeRecord[],
): RegimePerformanceStats[] {
  const regimes: RegimeType[] = ["trending", "ranging", "volatile", "low_volatility"];
  return regimes.map(regime => {
    const rt = trades.filter(t => t.regime === regime);
    if (rt.length === 0) {
      return {
        regime, totalTrades: 0, wins: 0, losses: 0,
        winRate: 0, profitFactor: 0, maxDrawdown: 0,
        avgSetupScore: 0, zoneWinRate: 0, liquidityWinRate: 0,
        amdWinRate: 0, confirmationWinRate: 0, bestComponent: "zone" as WeightCategory,
      };
    }

    const wins = rt.filter(t => t.pnl > 0).length;
    const losses = rt.length - wins;
    const winRate = wins / rt.length;

    const grossProfit = rt.filter(t => t.pnl > 0).reduce((s, t) => s + t.pnl, 0);
    const grossLoss = Math.abs(rt.filter(t => t.pnl < 0).reduce((s, t) => s + t.pnl, 0));
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 10 : 0;

    let peak = 0;
    let equity = 0;
    let maxDrawdown = 0;
    for (const t of rt) {
      equity += t.pnl;
      if (equity > peak) peak = equity;
      if (peak > 0) maxDrawdown = Math.max(maxDrawdown, ((peak - equity) / peak) * 100);
    }

    const avgSetupScore = rt.reduce((s, t) => s + t.setupScore, 0) / rt.length;

    const zoneWR    = calcCategoryWinRate(rt, "zone");
    const liqWR     = calcCategoryWinRate(rt, "liquidity");
    const amdWR     = calcCategoryWinRate(rt, "amd");
    const confWR    = calcCategoryWinRate(rt, "confirmation");

    const components: [WeightCategory, number][] = [
      ["zone", zoneWR.winRate],
      ["liquidity", liqWR.winRate],
      ["amd", amdWR.winRate],
      ["confirmation", confWR.winRate],
    ];
    const bestComponent = components.sort((a, b) => b[1] - a[1])[0]![0];

    return {
      regime,
      totalTrades: rt.length,
      wins, losses,
      winRate: Math.round(winRate * 1000) / 10,
      profitFactor: Math.round(profitFactor * 100) / 100,
      maxDrawdown: Math.round(maxDrawdown * 100) / 100,
      avgSetupScore: Math.round(avgSetupScore * 10) / 10,
      zoneWinRate:         Math.round(zoneWR.winRate * 1000) / 10,
      liquidityWinRate:    Math.round(liqWR.winRate * 1000) / 10,
      amdWinRate:          Math.round(amdWR.winRate * 1000) / 10,
      confirmationWinRate: Math.round(confWR.winRate * 1000) / 10,
      bestComponent,
    };
  });
}

export function adaptRegimeWeights(
  trades: RegimeTradeRecord[],
  currentProfile: RegimeWeightProfile,
  learningRate = DEFAULT_LEARNING_RATE,
): RegimeWeightProfile {
  const regimeTrades = trades.filter(t => t.regime === currentProfile.regime);
  if (regimeTrades.length < MIN_SAMPLES_TO_ADAPT) return currentProfile;

  const zoneWR   = calcCategoryWinRate(regimeTrades, "zone").winRate;
  const liqWR    = calcCategoryWinRate(regimeTrades, "liquidity").winRate;
  const amdWR    = calcCategoryWinRate(regimeTrades, "amd").winRate;
  const confWR   = calcCategoryWinRate(regimeTrades, "confirmation").winRate;

  const rawPerf = { zone: zoneWR, liquidity: liqWR, amd: amdWR, confirmation: confWR };
  const normPerf = normalizeWeights(rawPerf);

  const blended: Record<WeightCategory, number> = {
    zone:         currentProfile.zone         * (1 - learningRate) + normPerf.zone         * learningRate,
    liquidity:    currentProfile.liquidity    * (1 - learningRate) + normPerf.liquidity    * learningRate,
    amd:          currentProfile.amd          * (1 - learningRate) + normPerf.amd          * learningRate,
    confirmation: currentProfile.confirmation * (1 - learningRate) + normPerf.confirmation * learningRate,
  };

  const final = normalizeWeights(blended);

  return {
    ...final,
    regime: currentProfile.regime,
    sampleSize: regimeTrades.length,
    lastUpdated: new Date(),
  };
}

export function weightsToPercent(p: RegimeWeightProfile): Record<WeightCategory, number> {
  return {
    zone:         Math.round(p.zone         * 1000) / 10,
    liquidity:    Math.round(p.liquidity    * 1000) / 10,
    amd:          Math.round(p.amd          * 1000) / 10,
    confirmation: Math.round(p.confirmation * 1000) / 10,
  };
}

export function bestPerformingRegime(stats: RegimePerformanceStats[]): RegimeType | null {
  const eligible = stats.filter(s => s.totalTrades >= 5);
  if (eligible.length === 0) return null;
  return eligible.sort((a, b) => {
    const scoreA = a.winRate * 0.5 + Math.min(a.profitFactor * 10, 50) * 0.3 + (100 - a.maxDrawdown) * 0.2;
    const scoreB = b.winRate * 0.5 + Math.min(b.profitFactor * 10, 50) * 0.3 + (100 - b.maxDrawdown) * 0.2;
    return scoreB - scoreA;
  })[0]!.regime;
}
