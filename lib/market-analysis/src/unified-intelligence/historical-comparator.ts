// ─── Historical Comparator ─────────────────────────────────────────────────────
// Advisory only. No trade execution. No strategy modification.
// Compares current market environment against historical data to find similar
// conditions and their outcomes.

import type { FeatureRow, HistoricalContext, HistoricalMatch } from "./types.js";

// ─── Feature vector extraction for current state ───────────────────────────────

function extractCurrentState(features: FeatureRow[]): Record<string, string | number> {
  if (features.length === 0) {
    return { regime: "unknown", trend: "unknown", volatility: "medium", session: "unknown" };
  }
  const recent = features.slice(-10);

  // Dominant regime
  const regimeCounts: Record<string, number> = {};
  for (const f of recent) regimeCounts[f.marketRegime] = (regimeCounts[f.marketRegime] || 0) + 1;
  const regime = Object.entries(regimeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "unknown";

  // Dominant trend
  const trendCounts: Record<string, number> = {};
  for (const f of recent) trendCounts[f.trend] = (trendCounts[f.trend] || 0) + 1;
  const trend = Object.entries(trendCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "unknown";

  // Dominant volatility
  const volCounts: Record<string, number> = {};
  for (const f of recent) volCounts[f.volatility] = (volCounts[f.volatility] || 0) + 1;
  const volatility = Object.entries(volCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "medium";

  // Dominant session
  const sessionCounts: Record<string, number> = {};
  for (const f of recent) sessionCounts[f.session] = (sessionCounts[f.session] || 0) + 1;
  const session = Object.entries(sessionCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "unknown";

  const avgLiquidity = recent.reduce((s, f) => s + f.liquidityScore, 0) / recent.length;
  const avgSpread = recent.reduce((s, f) => s + f.spreadPips, 0) / recent.length;

  return { regime, trend, volatility, session, avgLiquidity, avgSpread };
}

// ─── Similarity scoring ────────────────────────────────────────────────────────

function computeSimilarity(
  current: Record<string, string | number>,
  historical: FeatureRow[],
): number {
  if (historical.length === 0) return 0;

  const sample = historical.slice(-10);
  let score = 0;
  let maxScore = 0;

  // Regime match (weight: 3)
  const historicalRegimes: Record<string, number> = {};
  for (const f of sample) historicalRegimes[f.marketRegime] = (historicalRegimes[f.marketRegime] || 0) + 1;
  const dominantHistRegime = Object.entries(historicalRegimes).sort((a, b) => b[1] - a[1])[0]?.[0];
  score += dominantHistRegime === current.regime ? 3 : 0;
  maxScore += 3;

  // Trend match (weight: 2)
  const historicalTrends: Record<string, number> = {};
  for (const f of sample) historicalTrends[f.trend] = (historicalTrends[f.trend] || 0) + 1;
  const dominantHistTrend = Object.entries(historicalTrends).sort((a, b) => b[1] - a[1])[0]?.[0];
  score += dominantHistTrend === current.trend ? 2 : 0;
  maxScore += 2;

  // Volatility match (weight: 2)
  const historicalVols: Record<string, number> = {};
  for (const f of sample) historicalVols[f.volatility] = (historicalVols[f.volatility] || 0) + 1;
  const dominantHistVol = Object.entries(historicalVols).sort((a, b) => b[1] - a[1])[0]?.[0];
  score += dominantHistVol === current.volatility ? 2 : 0;
  maxScore += 2;

  // Session match (weight: 1)
  const historicalSessions: Record<string, number> = {};
  for (const f of sample) historicalSessions[f.session] = (historicalSessions[f.session] || 0) + 1;
  const dominantHistSession = Object.entries(historicalSessions).sort((a, b) => b[1] - a[1])[0]?.[0];
  score += dominantHistSession === current.session ? 1 : 0;
  maxScore += 1;

  // Liquidity proximity (weight: 1)
  const histLiquidity = sample.reduce((s, f) => s + f.liquidityScore, 0) / sample.length;
  const liquidityDiff = Math.abs(histLiquidity - Number(current.avgLiquidity));
  score += liquidityDiff < 15 ? 1 : liquidityDiff < 30 ? 0.5 : 0;
  maxScore += 1;

  return maxScore > 0 ? (score / maxScore) * 100 : 0;
}

// ─── Group features into windows for comparison ────────────────────────────────

function groupIntoWindows(features: FeatureRow[], windowSize = 20): FeatureRow[][] {
  const windows: FeatureRow[][] = [];
  // Use every 10th starting point to avoid excessive overlap
  for (let i = 0; i + windowSize <= features.length; i += 10) {
    windows.push(features.slice(i, i + windowSize));
  }
  return windows;
}

// ─── Compute outcomes for a window ────────────────────────────────────────────

function computeWindowOutcomes(window: FeatureRow[]): {
  winRate: number;
  profitFactor: number;
  expectancy: number;
  drawdown: number;
  sampleSize: number;
} {
  const completed = window.filter(f => f.outcome === "win" || f.outcome === "loss");
  if (completed.length === 0) {
    return { winRate: 0.5, profitFactor: 1, expectancy: 0, drawdown: 0, sampleSize: 0 };
  }

  const wins = completed.filter(f => f.outcome === "win");
  const losses = completed.filter(f => f.outcome === "loss");
  const winRate = wins.length / completed.length;

  const grossProfit = wins.reduce((s, f) => s + f.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((s, f) => s + f.pnl, 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 3 : 1;

  const avgWin = wins.length > 0 ? grossProfit / wins.length : 0;
  const avgLoss = losses.length > 0 ? grossLoss / losses.length : 0;
  const expectancy = winRate * avgWin - (1 - winRate) * avgLoss;

  // Approximate drawdown from running PnL
  const pnls = completed.map(f => f.pnl);
  let peak = 0, equity = 0, maxDD = 0;
  for (const p of pnls) {
    equity += p;
    if (equity > peak) peak = equity;
    const dd = peak > 0 ? ((peak - equity) / peak) * 100 : 0;
    if (dd > maxDD) maxDD = dd;
  }

  return {
    winRate,
    profitFactor,
    expectancy,
    drawdown: maxDD,
    sampleSize: completed.length,
  };
}

// ─── Main export ───────────────────────────────────────────────────────────────

export function compareHistorical(features: FeatureRow[]): HistoricalContext {
  if (features.length < 30) {
    return {
      similarityScore: 0,
      similarMarketsCount: 0,
      winRate: 0.5,
      profitFactor: 1,
      expectancy: 0,
      drawdown: 0,
      confidence: 0,
      sampleSize: features.length,
      matches: [],
    };
  }

  const currentWindow = features.slice(-20);
  const currentState = extractCurrentState(currentWindow);
  const historicalWindows = groupIntoWindows(features.slice(0, -20), 20);

  // Find similar windows
  const MIN_SIMILARITY = 50; // 50% match threshold
  const similarWindows: { window: FeatureRow[]; similarity: number }[] = [];

  for (const window of historicalWindows) {
    const sim = computeSimilarity(currentState, window);
    if (sim >= MIN_SIMILARITY) {
      similarWindows.push({ window, similarity: sim });
    }
  }

  similarWindows.sort((a, b) => b.similarity - a.similarity);
  const topMatches = similarWindows.slice(0, 10);

  if (topMatches.length === 0) {
    return {
      similarityScore: 0,
      similarMarketsCount: 0,
      winRate: 0.5,
      profitFactor: 1,
      expectancy: 0,
      drawdown: 0,
      confidence: 20,
      sampleSize: features.length,
      matches: [],
    };
  }

  // Aggregate outcomes from similar windows
  const allOutcomes = topMatches.map(m => computeWindowOutcomes(m.window));
  const validOutcomes = allOutcomes.filter(o => o.sampleSize > 0);

  const avgWinRate = validOutcomes.length > 0
    ? validOutcomes.reduce((s, o) => s + o.winRate, 0) / validOutcomes.length
    : 0.5;
  const avgProfitFactor = validOutcomes.length > 0
    ? validOutcomes.reduce((s, o) => s + o.profitFactor, 0) / validOutcomes.length
    : 1;
  const avgExpectancy = validOutcomes.length > 0
    ? validOutcomes.reduce((s, o) => s + o.expectancy, 0) / validOutcomes.length
    : 0;
  const avgDrawdown = validOutcomes.length > 0
    ? validOutcomes.reduce((s, o) => s + o.drawdown, 0) / validOutcomes.length
    : 0;

  const avgSimilarity = topMatches.reduce((s, m) => s + m.similarity, 0) / topMatches.length;

  // Confidence scales with number of similar markets and their similarity scores
  const confidence = Math.round(
    Math.min(100, (topMatches.length / 10) * 50 + (avgSimilarity / 100) * 50)
  );

  const matches: HistoricalMatch[] = topMatches.slice(0, 5).map(m => {
    const ws = m.window.slice(-5);
    const regimeCounts: Record<string, number> = {};
    const trendCounts: Record<string, number> = {};
    const volCounts: Record<string, number> = {};
    for (const f of ws) {
      regimeCounts[f.marketRegime] = (regimeCounts[f.marketRegime] || 0) + 1;
      trendCounts[f.trend] = (trendCounts[f.trend] || 0) + 1;
      volCounts[f.volatility] = (volCounts[f.volatility] || 0) + 1;
    }
    const outcomes = computeWindowOutcomes(m.window);
    return {
      regime: Object.entries(regimeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "unknown",
      trendDirection: Object.entries(trendCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "unknown",
      volatilityLevel: Object.entries(volCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "medium",
      winRate: outcomes.winRate,
      profitFactor: outcomes.profitFactor,
      expectancy: outcomes.expectancy,
      sampleSize: outcomes.sampleSize,
      similarityScore: m.similarity,
    };
  });

  return {
    similarityScore: avgSimilarity,
    similarMarketsCount: topMatches.length,
    winRate: avgWinRate,
    profitFactor: avgProfitFactor,
    expectancy: avgExpectancy,
    drawdown: avgDrawdown,
    confidence,
    sampleSize: features.length,
    matches,
  };
}
