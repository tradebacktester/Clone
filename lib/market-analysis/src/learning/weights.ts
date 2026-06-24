import type { BacktestTrade, MarketRegimeResult } from "../types.js";

export type WeightCategory = "zone" | "liquidity" | "amd" | "confirmation";

export interface WeightProfile {
  zone: number;
  liquidity: number;
  amd: number;
  confirmation: number;
  sampleSize: number;
  lastUpdated: Date;
}

export const DEFAULT_WEIGHT_PROFILE: WeightProfile = {
  zone: 0.25,
  liquidity: 0.25,
  amd: 0.25,
  confirmation: 0.25,
  sampleSize: 0,
  lastUpdated: new Date(0),
};

const FACTOR_CATEGORY: Record<string, WeightCategory> = {
  "Price in active demand zone": "zone",
  "Price in active supply zone": "zone",
  "Approaching demand zone": "zone",
  "Approaching supply zone": "zone",
  "Zone strength > 80": "zone",
  "Zone strength > 70": "zone",
  "Zone strength > 60": "zone",
  "Fresh zone (untested)": "zone",
  "Liquidity sweep before zone": "liquidity",
  "Discount zone (bullish bias)": "liquidity",
  "Premium zone (bearish bias)": "liquidity",
  "AMD distribution phase": "amd",
  "AMD manipulation phase": "amd",
  "FIB 0.618 confluence": "confirmation",
  "FIB 0.786 confluence": "confirmation",
  "FIB 0.5 confluence": "confirmation",
  "London/NY session": "confirmation",
  "Bullish market structure": "confirmation",
  "Bearish market structure": "confirmation",
  "Good regime for trading": "confirmation",
};

export const BASE_FACTOR_WEIGHTS: Record<string, number> = {
  "Price in active demand zone": 28,
  "Price in active supply zone": 28,
  "Approaching demand zone": 18,
  "Approaching supply zone": 18,
  "Zone strength > 80": 12,
  "Zone strength > 70": 7,
  "Zone strength > 60": 4,
  "Fresh zone (untested)": 8,
  "Liquidity sweep before zone": 12,
  "Discount zone (bullish bias)": 8,
  "Premium zone (bearish bias)": 8,
  "AMD distribution phase": 20,
  "AMD manipulation phase": 15,
  "FIB 0.618 confluence": 15,
  "FIB 0.786 confluence": 12,
  "FIB 0.5 confluence": 8,
  "London/NY session": 12,
  "Bullish market structure": 8,
  "Bearish market structure": 8,
  "Good regime for trading": 5,
};

const REGIME_MULTIPLIERS: Record<
  MarketRegimeResult["regime"],
  Record<WeightCategory, number>
> = {
  trending: { zone: 1.0, liquidity: 1.3, amd: 0.85, confirmation: 1.0 },
  ranging:  { zone: 1.1, liquidity: 0.85, amd: 1.3, confirmation: 0.9 },
  volatile: { zone: 1.1, liquidity: 0.8, amd: 0.8, confirmation: 1.2 },
  unknown:  { zone: 1.0, liquidity: 1.0, amd: 1.0, confirmation: 1.0 },
};

function normalizeWeights(
  raw: Record<WeightCategory, number>,
): Record<WeightCategory, number> {
  const total = raw.zone + raw.liquidity + raw.amd + raw.confirmation;
  if (total === 0) return { zone: 0.25, liquidity: 0.25, amd: 0.25, confirmation: 0.25 };
  return {
    zone: raw.zone / total,
    liquidity: raw.liquidity / total,
    amd: raw.amd / total,
    confirmation: raw.confirmation / total,
  };
}

export function calcConfidenceWithWeights(
  factors: string[],
  profile: WeightProfile,
): number {
  const total = factors.reduce((sum, factor) => {
    const base = BASE_FACTOR_WEIGHTS[factor] ?? 3;
    const category = FACTOR_CATEGORY[factor];
    const multiplier = category ? profile[category] / 0.25 : 1;
    return sum + base * multiplier;
  }, 0);

  return Math.min(100, total);
}

export function adaptWeights(
  trades: BacktestTrade[],
  minSamples = 30,
  learningRate = 0.3,
  currentProfile: WeightProfile = DEFAULT_WEIGHT_PROFILE,
): WeightProfile {
  if (trades.length < minSamples) return currentProfile;

  const categoryStats: Record<WeightCategory, { wins: number; total: number }> = {
    zone: { wins: 0, total: 0 },
    liquidity: { wins: 0, total: 0 },
    amd: { wins: 0, total: 0 },
    confirmation: { wins: 0, total: 0 },
  };

  for (const trade of trades) {
    const isWin = trade.pnl > 0;

    const categoriesPresent = new Set<WeightCategory>();

    if (trade.zoneType === "demand" || trade.zoneType === "supply") {
      categoriesPresent.add("zone");
    }
    if (trade.liquiditySweep) {
      categoriesPresent.add("liquidity");
    }
    if (trade.amdPattern === "distribution" || trade.amdPattern === "manipulation") {
      categoriesPresent.add("amd");
    }
    if (trade.fibLevel > 0 || trade.session === "london" || trade.session === "newyork") {
      categoriesPresent.add("confirmation");
    }

    for (const cat of categoriesPresent) {
      categoryStats[cat].total++;
      if (isWin) categoryStats[cat].wins++;
    }
  }

  const rawWinRates: Record<WeightCategory, number> = {
    zone: categoryStats.zone.total > 0
      ? categoryStats.zone.wins / categoryStats.zone.total
      : 0.25,
    liquidity: categoryStats.liquidity.total > 0
      ? categoryStats.liquidity.wins / categoryStats.liquidity.total
      : 0.25,
    amd: categoryStats.amd.total > 0
      ? categoryStats.amd.wins / categoryStats.amd.total
      : 0.25,
    confirmation: categoryStats.confirmation.total > 0
      ? categoryStats.confirmation.wins / categoryStats.confirmation.total
      : 0.25,
  };

  const normalized = normalizeWeights(rawWinRates);

  const blended: Record<WeightCategory, number> = {
    zone: currentProfile.zone * (1 - learningRate) + normalized.zone * learningRate,
    liquidity: currentProfile.liquidity * (1 - learningRate) + normalized.liquidity * learningRate,
    amd: currentProfile.amd * (1 - learningRate) + normalized.amd * learningRate,
    confirmation: currentProfile.confirmation * (1 - learningRate) + normalized.confirmation * learningRate,
  };

  const final = normalizeWeights(blended);

  return {
    ...final,
    sampleSize: trades.length,
    lastUpdated: new Date(),
  };
}

export function applyRegimeAdjustment(
  profile: WeightProfile,
  regime: MarketRegimeResult,
): WeightProfile {
  const mults = REGIME_MULTIPLIERS[regime.regime];

  const raw: Record<WeightCategory, number> = {
    zone: profile.zone * mults.zone,
    liquidity: profile.liquidity * mults.liquidity,
    amd: profile.amd * mults.amd,
    confirmation: profile.confirmation * mults.confirmation,
  };

  const adjusted = normalizeWeights(raw);

  return {
    ...adjusted,
    sampleSize: profile.sampleSize,
    lastUpdated: profile.lastUpdated,
  };
}

export function weightsToPercent(profile: WeightProfile): {
  zone: number;
  liquidity: number;
  amd: number;
  confirmation: number;
} {
  return {
    zone: Math.round(profile.zone * 100 * 10) / 10,
    liquidity: Math.round(profile.liquidity * 100 * 10) / 10,
    amd: Math.round(profile.amd * 100 * 10) / 10,
    confirmation: Math.round(profile.confirmation * 100 * 10) / 10,
  };
}
