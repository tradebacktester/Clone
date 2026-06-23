import type { BacktestTrade, PatternScore } from "../types.js";

export function buildPatternKey(trade: {
  amdPattern: string;
  zoneType: string;
  fibLevel: number;
  session: string;
  liquiditySweep?: boolean;
}): string {
  const fibLabel =
    trade.fibLevel >= 0.77 ? "FIB_786" :
    trade.fibLevel >= 0.60 ? "FIB_618" :
    trade.fibLevel >= 0.45 ? "FIB_500" :
    "FIB_382";

  const sweepTag = trade.liquiditySweep ? "+SWEEP" : "";
  return `${trade.amdPattern.toUpperCase()}_${trade.zoneType.toUpperCase()}_${fibLabel}_${trade.session.toUpperCase()}${sweepTag}`;
}

export function scorePatterns(trades: BacktestTrade[]): PatternScore[] {
  const map = new Map<
    string,
    { trades: number; wins: number; totalPnl: number; totalScore: number }
  >();

  for (const trade of trades) {
    const key = buildPatternKey(trade);
    const existing = map.get(key) ?? { trades: 0, wins: 0, totalPnl: 0, totalScore: 0 };
    existing.trades++;
    if (trade.pnl > 0) existing.wins++;
    existing.totalPnl += trade.pnl;
    existing.totalScore += trade.setupScore;
    map.set(key, existing);
  }

  const results: PatternScore[] = [];
  for (const [pattern, data] of map) {
    const winRate = data.trades > 0 ? (data.wins / data.trades) * 100 : 0;
    const avgPnl = data.trades > 0 ? data.totalPnl / data.trades : 0;
    const avgScore = data.trades > 0 ? data.totalScore / data.trades : 0;
    const confidence = Math.min(100, winRate * 0.6 + Math.max(0, avgPnl / 5) * 0.4);

    results.push({
      pattern: formatPatternLabel(pattern),
      trades: data.trades,
      wins: data.wins,
      totalPnl: Math.round(data.totalPnl * 100) / 100,
      winRate: Math.round(winRate * 100) / 100,
      avgPnl: Math.round(avgPnl * 100) / 100,
      avgScore: Math.round(avgScore * 100) / 100,
      confidence: Math.round(confidence * 100) / 100,
    });
  }

  return results.sort((a, b) => b.confidence - a.confidence);
}

function formatPatternLabel(key: string): string {
  return key
    .replace("DISTRIBUTION", "Distribution")
    .replace("MANIPULATION", "Manipulation")
    .replace("ACCUMULATION", "Accumulation")
    .replace("DEMAND", "Demand Zone")
    .replace("SUPPLY", "Supply Zone")
    .replace("FIB_786", "FIB 0.786")
    .replace("FIB_618", "FIB 0.618")
    .replace("FIB_500", "FIB 0.500")
    .replace("FIB_382", "FIB 0.382")
    .replace("LONDON", "London")
    .replace("NEWYORK", "NY")
    .replace("+SWEEP", " + Liquidity Sweep")
    .replace(/_/g, " + ");
}

export function calcEpsilonDecay(
  currentEpsilon: number,
  episode: number,
  decayRate = 0.995,
  minEpsilon = 0.05,
): number {
  return Math.max(minEpsilon, currentEpsilon * Math.pow(decayRate, episode));
}

export function calcRLReward(trade: BacktestTrade): number {
  const baseReward = trade.pnl > 0 ? 1.0 : -0.5;

  const qualityBonus =
    trade.setupScore > 85
      ? 0.5
      : trade.setupScore > 75
        ? 0.3
        : trade.setupScore > 65
          ? 0.1
          : 0;

  const rrBonus = trade.riskRewardRatio >= 2.5 ? 0.3 : trade.riskRewardRatio >= 2 ? 0.1 : 0;

  const sweepBonus = trade.liquiditySweep ? 0.2 : 0;

  const pnlMultiplier = trade.pnl > 0 ? Math.min(2, trade.pnl / 30) : 1;

  return (baseReward + qualityBonus + rrBonus + sweepBonus) * pnlMultiplier;
}

export function updateRLAgent(
  currentEpisode: number,
  currentTotalReward: number,
  currentEpsilon: number,
  newTrades: BacktestTrade[],
): {
  episode: number;
  totalReward: number;
  avgReward: number;
  epsilon: number;
  tradesAnalyzed: number;
} {
  const newRewards = newTrades.map(calcRLReward);
  const rewardSum = newRewards.reduce((a, b) => a + b, 0);
  const episode = currentEpisode + 1;
  const totalReward = currentTotalReward + rewardSum;
  const avgReward = totalReward / Math.max(1, episode);
  const epsilon = calcEpsilonDecay(currentEpsilon, episode);

  return {
    episode,
    totalReward: Math.round(totalReward * 1000) / 1000,
    avgReward: Math.round(avgReward * 1000) / 1000,
    epsilon: Math.round(epsilon * 10000) / 10000,
    tradesAnalyzed: newTrades.length,
  };
}

export function shouldEnterTrade(
  confidence: number,
  epsilon: number,
  patternScores: PatternScore[],
  patternKey: string,
): boolean {
  if (Math.random() < epsilon) {
    return confidence > 55;
  }

  const pattern = patternScores.find(p => p.pattern.includes(patternKey));
  if (!pattern) return confidence > 60;
  if (pattern.winRate < 40 && pattern.trades >= 5) return false;
  return confidence >= 65 - pattern.winRate * 0.1;
}
