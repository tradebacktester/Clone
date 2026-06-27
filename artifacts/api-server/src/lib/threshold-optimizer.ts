import { db, tradesTable } from "@workspace/db";
import { eq, sql, and, gte, isNotNull } from "drizzle-orm";
import { logger } from "./logger.js";

export interface ThresholdCandidate {
  name: string;
  field: string;
  current: number;
  min: number;
  max: number;
  step: number;
}

export interface ThresholdCurvePoint {
  value: number;
  winRate: number;
  profitFactor: number;
  tradeCount: number;
  expectedValue: number;
}

export interface ThresholdResult {
  name: string;
  current: number;
  proposed: number;
  curve: ThresholdCurvePoint[];
  baselineWinRate: number;
  proposedWinRate: number;
  baselinePF: number;
  proposedPF: number;
  baselineEV: number;
  proposedEV: number;
  tradeCountDelta: number;
  improvementPct: number;
}

export interface WalkForwardFold {
  foldIndex: number;
  trainStart: number;
  trainEnd: number;
  testStart: number;
  testEnd: number;
  proposedThresholds: Record<string, number>;
  baselineWinRate: number;
  proposedWinRate: number;
  baselinePF: number;
  proposedPF: number;
  outperforms: boolean;
}

export interface OptimizationResult {
  tradesAnalyzed: number;
  durationMs: number;
  perThreshold: Record<string, ThresholdResult>;
  wfFolds: WalkForwardFold[];
  wfPassRate: number;
  wfConsistent: boolean;
  summary: {
    currentWinRate: number;
    proposedWinRate: number;
    currentPF: number;
    proposedPF: number;
    currentEV: number;
    proposedEV: number;
    totalTradeCountDelta: number;
    recommendations: string[];
  };
}

interface ClosedTrade {
  id: number;
  pnl: number;
  setupScore: number;
  zoneStrength: number;
  tqi: number | null;
  mtfScore: number | null;
  closedAt: Date;
}

async function fetchClosedTrades(): Promise<ClosedTrade[]> {
  const rows = await db
    .select({
      id: tradesTable.id,
      pnl: tradesTable.pnl,
      setupScore: tradesTable.setupScore,
      zoneStrength: tradesTable.zoneStrength,
      tqi: tradesTable.tqi,
      mtfScore: tradesTable.mtfScore,
      closedAt: tradesTable.closedAt,
    })
    .from(tradesTable)
    .where(
      and(
        eq(tradesTable.status, "closed"),
        isNotNull(tradesTable.pnl),
        isNotNull(tradesTable.closedAt),
      ),
    );

  return rows
    .filter((r) => r.closedAt != null)
    .map((r) => ({
      id: r.id,
      pnl: parseFloat(r.pnl ?? "0"),
      setupScore: parseFloat(r.setupScore ?? "0"),
      zoneStrength: parseFloat(r.zoneStrength ?? "0"),
      tqi: r.tqi != null ? parseFloat(r.tqi) : null,
      mtfScore: r.mtfScore != null ? parseFloat(r.mtfScore) : null,
      closedAt: r.closedAt!,
    }))
    .sort((a, b) => a.closedAt.getTime() - b.closedAt.getTime());
}

function computeStats(trades: ClosedTrade[]): {
  winRate: number;
  profitFactor: number;
  expectedValue: number;
  count: number;
} {
  if (trades.length === 0) {
    return { winRate: 0, profitFactor: 0, expectedValue: 0, count: 0 };
  }
  const wins = trades.filter((t) => t.pnl > 0);
  const losses = trades.filter((t) => t.pnl <= 0);
  const grossProfit = wins.reduce((s, t) => s + t.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
  const winRate = wins.length / trades.length;
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 99 : 0;
  const avgWin = wins.length > 0 ? grossProfit / wins.length : 0;
  const avgLoss = losses.length > 0 ? grossLoss / losses.length : 0;
  const expectedValue = winRate * avgWin - (1 - winRate) * avgLoss;
  return { winRate: Math.round(winRate * 1000) / 10, profitFactor: Math.round(profitFactor * 100) / 100, expectedValue: Math.round(expectedValue * 100) / 100, count: trades.length };
}

function analyzeThreshold(
  trades: ClosedTrade[],
  field: keyof ClosedTrade,
  min: number,
  max: number,
  step: number,
  currentThreshold: number,
): ThresholdResult {
  const values: number[] = [];
  for (let v = min; v <= max; v = Math.round((v + step) * 100) / 100) {
    values.push(v);
  }

  const baseline = computeStats(trades);

  const curve: ThresholdCurvePoint[] = values.map((threshold) => {
    const filtered = trades.filter((t) => {
      const val = t[field];
      return val != null && (val as number) >= threshold;
    });
    const stats = computeStats(filtered);
    return {
      value: threshold,
      winRate: stats.winRate,
      profitFactor: stats.profitFactor,
      tradeCount: stats.count,
      expectedValue: stats.expectedValue,
    };
  });

  // Find optimal: maximize expected value with at least 10 trades minimum
  const minTrades = Math.max(10, Math.floor(trades.length * 0.15));
  const viable = curve.filter((p) => p.tradeCount >= minTrades);
  const optimal = viable.length > 0
    ? viable.reduce((best, p) => (p.expectedValue > best.expectedValue ? p : best), viable[0]!)
    : curve.find((p) => p.value === currentThreshold) ?? curve[0]!;

  const proposed = optimal.value;
  const proposedFiltered = trades.filter((t) => {
    const val = t[field];
    return val != null && (val as number) >= proposed;
  });
  const proposedStats = computeStats(proposedFiltered);
  const improvementPct =
    baseline.winRate > 0
      ? Math.round(((proposedStats.winRate - baseline.winRate) / baseline.winRate) * 1000) / 10
      : 0;

  return {
    name: field as string,
    current: currentThreshold,
    proposed,
    curve,
    baselineWinRate: baseline.winRate,
    proposedWinRate: proposedStats.winRate,
    baselinePF: baseline.profitFactor,
    proposedPF: proposedStats.profitFactor,
    baselineEV: baseline.expectedValue,
    proposedEV: proposedStats.expectedValue,
    tradeCountDelta: proposedStats.count - baseline.count,
    improvementPct,
  };
}

function runWalkForward(
  trades: ClosedTrade[],
  proposedThresholds: Record<string, number>,
  folds = 5,
): WalkForwardFold[] {
  if (trades.length < 40) return [];
  const windowSize = Math.floor(trades.length / (folds + 1));
  const results: WalkForwardFold[] = [];

  for (let i = 0; i < folds; i++) {
    const trainStart = 0;
    const trainEnd = (i + 1) * windowSize;
    const testStart = trainEnd;
    const testEnd = Math.min(testStart + windowSize, trades.length);

    if (testEnd <= testStart) continue;

    const testTrades = trades.slice(testStart, testEnd);

    const baselineStats = computeStats(testTrades);
    const filteredTest = testTrades.filter((t) => {
      return Object.entries(proposedThresholds).every(([field, threshold]) => {
        const val = t[field as keyof ClosedTrade];
        return val == null || (val as number) >= threshold;
      });
    });
    const proposedStats = computeStats(filteredTest);
    const outperforms = proposedStats.expectedValue > baselineStats.expectedValue;

    results.push({
      foldIndex: i,
      trainStart,
      trainEnd,
      testStart,
      testEnd,
      proposedThresholds,
      baselineWinRate: baselineStats.winRate,
      proposedWinRate: proposedStats.winRate,
      baselinePF: baselineStats.profitFactor,
      proposedPF: proposedStats.profitFactor,
      outperforms,
    });
  }

  return results;
}

export async function runThresholdOptimization(windowSize = 100, folds = 5): Promise<OptimizationResult> {
  const start = Date.now();
  const trades = await fetchClosedTrades();
  logger.info({ count: trades.length }, "Threshold optimizer: loaded trades");

  const candidates: ThresholdCandidate[] = [
    { name: "setupScore", field: "setupScore", current: 65, min: 40, max: 85, step: 5 },
    { name: "zoneStrength", field: "zoneStrength", current: 50, min: 30, max: 80, step: 5 },
    { name: "tqi", field: "tqi", current: 65, min: 50, max: 85, step: 5 },
    { name: "mtfScore", field: "mtfScore", current: 50, min: 30, max: 75, step: 5 },
  ];

  const perThreshold: Record<string, ThresholdResult> = {};
  const proposedThresholds: Record<string, number> = {};

  for (const candidate of candidates) {
    const result = analyzeThreshold(
      trades,
      candidate.field as keyof ClosedTrade,
      candidate.min,
      candidate.max,
      candidate.step,
      candidate.current,
    );
    perThreshold[candidate.name] = result;
    proposedThresholds[candidate.field] = result.proposed;
  }

  const wfFolds = runWalkForward(trades, proposedThresholds, folds);
  const wfPassRate = wfFolds.length > 0
    ? Math.round((wfFolds.filter((f) => f.outperforms).length / wfFolds.length) * 100)
    : 0;
  const wfConsistent = wfPassRate >= 60;

  const baseline = computeStats(trades);
  const proposed = computeStats(
    trades.filter((t) =>
      Object.entries(proposedThresholds).every(([field, threshold]) => {
        const val = t[field as keyof ClosedTrade];
        return val == null || (val as number) >= threshold;
      }),
    ),
  );

  const recommendations: string[] = [];
  for (const [name, result] of Object.entries(perThreshold)) {
    if (result.improvementPct >= 5 && wfConsistent) {
      recommendations.push(
        `Raise ${name} threshold from ${result.current} → ${result.proposed} (expected +${result.improvementPct}% win rate improvement, walk-forward validated)`,
      );
    } else if (result.improvementPct < -5) {
      recommendations.push(
        `Current ${name} threshold (${result.current}) appears optimal — no change recommended`,
      );
    }
  }

  if (!wfConsistent) {
    recommendations.push(
      `Walk-forward validation only passed ${wfPassRate}% of folds — threshold changes NOT recommended until more data is collected`,
    );
  }

  if (trades.length < 30) {
    recommendations.push(
      `Insufficient data (${trades.length} trades) — need at least 30 closed trades for reliable optimization`,
    );
  }

  return {
    tradesAnalyzed: trades.length,
    durationMs: Date.now() - start,
    perThreshold,
    wfFolds,
    wfPassRate,
    wfConsistent,
    summary: {
      currentWinRate: baseline.winRate,
      proposedWinRate: proposed.winRate,
      currentPF: baseline.profitFactor,
      proposedPF: proposed.profitFactor,
      currentEV: baseline.expectedValue,
      proposedEV: proposed.expectedValue,
      totalTradeCountDelta: proposed.count - baseline.count,
      recommendations,
    },
  };
}
