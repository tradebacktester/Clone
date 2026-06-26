import { runBacktest } from "./engine.js";
import type { Pair } from "../types.js";

export interface WFWindowStats {
  trades: number;
  winRate: number;
  profitFactor: number;
  sharpeRatio: number;
  maxDrawdown: number;
  totalPnl: number;
  expectancy: number;
  finalBalance: number;
}

export interface WFOptimalParams {
  riskPerTrade: number;
  trainScore: number;
}

export interface WFRegimeSensitivity {
  regime: string;
  trainWinRate: number;
  testWinRate: number;
  trainProfitFactor: number;
  testProfitFactor: number;
  sensitivity: number;
}

export interface WFWindow {
  windowId: number;
  trainStart: string;
  trainEnd: string;
  testStart: string;
  testEnd: string;
  bestParams: WFOptimalParams;
  trainStats: WFWindowStats;
  testStats: WFWindowStats;
  efficiencyRatio: number;
  overfit: boolean;
  regimeSensitivity: WFRegimeSensitivity[];
}

export interface WFParameterStability {
  parameter: string;
  values: number[];
  mean: number;
  stdDev: number;
  variationCoeff: number;
  stable: boolean;
}

export interface WFPairResult {
  pair: string;
  windows: WFWindow[];
  overallEfficiencyRatio: number;
  overfitScore: number;
  parameterStability: WFParameterStability[];
  combinedTestStats: WFWindowStats;
  recommendation: "Pass" | "Marginal" | "Overfit";
}

export interface WalkForwardResult {
  pairs: WFPairResult[];
  summary: {
    avgEfficiencyRatio: number;
    avgOverfitScore: number;
    stableParams: boolean;
    regimeSensitive: boolean;
    recommendation: "Pass" | "Marginal" | "Overfit";
  };
  ranAt: string;
}

interface WFConfig {
  overallStartDate: string;
  overallEndDate: string;
  trainWindowYears: number;
  testWindowYears: number;
  initialBalance: number;
  riskOptions: number[];
}

function buildWindows(cfg: WFConfig): Array<{ trainStart: string; trainEnd: string; testStart: string; testEnd: string }> {
  const windows: Array<{ trainStart: string; trainEnd: string; testStart: string; testEnd: string }> = [];
  const overallStart = new Date(cfg.overallStartDate);
  const overallEnd = new Date(cfg.overallEndDate);

  let testStart = new Date(overallStart);
  testStart.setFullYear(testStart.getFullYear() + cfg.trainWindowYears);

  while (true) {
    const testEnd = new Date(testStart);
    testEnd.setFullYear(testEnd.getFullYear() + cfg.testWindowYears);
    testEnd.setDate(testEnd.getDate() - 1);

    if (testEnd > overallEnd) break;

    const trainEnd = new Date(testStart);
    trainEnd.setDate(trainEnd.getDate() - 1);

    const trainStart = new Date(testStart);
    trainStart.setFullYear(trainStart.getFullYear() - cfg.trainWindowYears);

    windows.push({
      trainStart: trainStart.toISOString().slice(0, 10),
      trainEnd: trainEnd.toISOString().slice(0, 10),
      testStart: testStart.toISOString().slice(0, 10),
      testEnd: testEnd.toISOString().slice(0, 10),
    });

    testStart = new Date(testStart);
    testStart.setFullYear(testStart.getFullYear() + cfg.testWindowYears);
  }

  return windows;
}

function extractStats(result: Awaited<ReturnType<typeof runBacktest>>, initialBalance: number): WFWindowStats {
  return {
    trades: result.totalTrades,
    winRate: result.winRate,
    profitFactor: result.profitFactor,
    sharpeRatio: result.sharpeRatio,
    maxDrawdown: result.maxDrawdown,
    totalPnl: result.totalPnl,
    expectancy: result.expectancy,
    finalBalance: result.finalBalance,
  };
}

function compositeScore(stats: WFWindowStats): number {
  // Weighted score: Sharpe 40%, PF 40%, WinRate 20%
  const sharpeNorm = Math.max(-2, Math.min(3, stats.sharpeRatio));
  const pfNorm = Math.max(0, Math.min(3, stats.profitFactor));
  const wrNorm = stats.winRate / 100;
  return sharpeNorm * 0.4 + pfNorm * 0.4 + wrNorm * 0.2;
}

function calcRegimeSensitivity(
  trainRegimes: Array<{ regime: string; winRate: number; profitFactor: number }>,
  testRegimes: Array<{ regime: string; winRate: number; profitFactor: number }>,
): WFRegimeSensitivity[] {
  const allRegimes = new Set([...trainRegimes.map(r => r.regime), ...testRegimes.map(r => r.regime)]);
  const result: WFRegimeSensitivity[] = [];

  for (const regime of allRegimes) {
    const train = trainRegimes.find(r => r.regime === regime);
    const test = testRegimes.find(r => r.regime === regime);
    if (!train || !test) continue;
    result.push({
      regime,
      trainWinRate: Math.round(train.winRate * 100) / 100,
      testWinRate: Math.round(test.winRate * 100) / 100,
      trainProfitFactor: Math.round(train.profitFactor * 1000) / 1000,
      testProfitFactor: Math.round(test.profitFactor * 1000) / 1000,
      sensitivity: Math.round(Math.abs(train.winRate - test.winRate) * 100) / 100,
    });
  }
  return result.sort((a, b) => b.sensitivity - a.sensitivity);
}

function calcParamStability(values: number[], parameter: string): WFParameterStability {
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / values.length;
  const stdDev = Math.sqrt(variance);
  const variationCoeff = mean !== 0 ? stdDev / Math.abs(mean) : 1;
  return {
    parameter,
    values: values.map(v => Math.round(v * 100) / 100),
    mean: Math.round(mean * 100) / 100,
    stdDev: Math.round(stdDev * 100) / 100,
    variationCoeff: Math.round(variationCoeff * 1000) / 1000,
    stable: variationCoeff < 0.35,
  };
}

async function runPairWalkForward(pair: Pair, cfg: WFConfig): Promise<WFPairResult> {
  const windowDefs = buildWindows(cfg);

  const windows: WFWindow[] = [];
  const optimalRisks: number[] = [];

  for (let wi = 0; wi < windowDefs.length; wi++) {
    const w = windowDefs[wi]!;

    // ── Parameter optimization on train period ────────────────────────────
    let bestTrainStats: WFWindowStats | null = null;
    let bestScore = -Infinity;
    let bestRisk = cfg.riskOptions[0]!;

    for (const risk of cfg.riskOptions) {
      const trainResult = await runBacktest({
        pair,
        startDate: w.trainStart,
        endDate: w.trainEnd,
        initialBalance: cfg.initialBalance,
        riskPerTrade: risk,
        timeframe: "4h",
        contextTimeframe: "1d",
      });
      const stats = extractStats(trainResult, cfg.initialBalance);
      const score = compositeScore(stats);
      if (score > bestScore && stats.trades >= 3) {
        bestScore = score;
        bestTrainStats = stats;
        bestRisk = risk;
        // Store regimes for this best run
        (bestTrainStats as unknown as { _regimes: typeof trainResult.regimeStats })._regimes = trainResult.regimeStats;
      }
    }

    // If no valid params found, use default
    if (!bestTrainStats) {
      const fallback = await runBacktest({
        pair,
        startDate: w.trainStart,
        endDate: w.trainEnd,
        initialBalance: cfg.initialBalance,
        riskPerTrade: 1,
        timeframe: "4h",
        contextTimeframe: "1d",
      });
      bestTrainStats = extractStats(fallback, cfg.initialBalance);
      (bestTrainStats as unknown as { _regimes: typeof fallback.regimeStats })._regimes = fallback.regimeStats;
      bestRisk = 1;
      bestScore = compositeScore(bestTrainStats);
    }

    optimalRisks.push(bestRisk);

    // ── Out-of-sample test with best params ───────────────────────────────
    const testResult = await runBacktest({
      pair,
      startDate: w.testStart,
      endDate: w.testEnd,
      initialBalance: cfg.initialBalance,
      riskPerTrade: bestRisk,
      timeframe: "4h",
      contextTimeframe: "1d",
    });
    const testStats = extractStats(testResult, cfg.initialBalance);

    // ── Efficiency ratio ──────────────────────────────────────────────────
    const trainPF = bestTrainStats.profitFactor;
    const testPF = testStats.profitFactor;
    let efficiencyRatio: number;
    if (trainPF <= 0) {
      efficiencyRatio = testPF > 0 ? 0.8 : 0.2; // edge cases
    } else {
      efficiencyRatio = Math.min(testPF / trainPF, 1.5);
    }
    efficiencyRatio = Math.round(efficiencyRatio * 1000) / 1000;

    // ── Regime sensitivity ────────────────────────────────────────────────
    const trainRegimes = ((bestTrainStats as unknown as { _regimes: typeof testResult.regimeStats })._regimes ?? [])
      .map(r => ({ regime: r.regime, winRate: r.winRate, profitFactor: r.profitFactor }));
    const testRegimes = (testResult.regimeStats ?? [])
      .map(r => ({ regime: r.regime, winRate: r.winRate, profitFactor: r.profitFactor }));
    const regimeSensitivity = calcRegimeSensitivity(trainRegimes, testRegimes);

    windows.push({
      windowId: wi + 1,
      trainStart: w.trainStart,
      trainEnd: w.trainEnd,
      testStart: w.testStart,
      testEnd: w.testEnd,
      bestParams: { riskPerTrade: bestRisk, trainScore: Math.round(bestScore * 1000) / 1000 },
      trainStats: bestTrainStats,
      testStats,
      efficiencyRatio,
      overfit: efficiencyRatio < 0.5,
      regimeSensitivity,
    });
  }

  // ── Aggregate results ─────────────────────────────────────────────────
  const validWindows = windows.filter(w => w.trainStats.trades > 0);
  const avgER = validWindows.length > 0
    ? validWindows.reduce((s, w) => s + w.efficiencyRatio, 0) / validWindows.length
    : 0;
  const overfitCount = windows.filter(w => w.overfit).length;
  const overfitScore = windows.length > 0
    ? Math.round((overfitCount / windows.length) * 100)
    : 0;

  // Combined test stats across all windows
  const allTestTrades = windows.reduce((s, w) => s + w.testStats.trades, 0);
  const allTestPnl = windows.reduce((s, w) => s + w.testStats.totalPnl, 0);
  const avgTestWR = validWindows.length > 0
    ? validWindows.reduce((s, w) => s + w.testStats.winRate, 0) / validWindows.length
    : 0;
  const avgTestPF = validWindows.length > 0
    ? validWindows.reduce((s, w) => s + w.testStats.profitFactor, 0) / validWindows.length
    : 0;
  const avgTestSharpe = validWindows.length > 0
    ? validWindows.reduce((s, w) => s + w.testStats.sharpeRatio, 0) / validWindows.length
    : 0;
  const maxTestDD = Math.max(...windows.map(w => w.testStats.maxDrawdown), 0);
  const avgExpectancy = validWindows.length > 0
    ? validWindows.reduce((s, w) => s + w.testStats.expectancy, 0) / validWindows.length
    : 0;

  const combinedTestStats: WFWindowStats = {
    trades: allTestTrades,
    winRate: Math.round(avgTestWR * 100) / 100,
    profitFactor: Math.round(avgTestPF * 1000) / 1000,
    sharpeRatio: Math.round(avgTestSharpe * 1000) / 1000,
    maxDrawdown: Math.round(maxTestDD * 100) / 100,
    totalPnl: Math.round(allTestPnl * 100) / 100,
    expectancy: Math.round(avgExpectancy * 100) / 100,
    finalBalance: Math.round((cfg.initialBalance + allTestPnl) * 100) / 100,
  };

  const paramStability = [calcParamStability(optimalRisks, "riskPerTrade")];

  const overallER = Math.round(avgER * 1000) / 1000;
  let recommendation: "Pass" | "Marginal" | "Overfit";
  if (overfitScore <= 25 && overallER >= 0.65 && paramStability[0]!.stable) {
    recommendation = "Pass";
  } else if (overfitScore >= 75 || overallER < 0.4) {
    recommendation = "Overfit";
  } else {
    recommendation = "Marginal";
  }

  return {
    pair,
    windows,
    overallEfficiencyRatio: overallER,
    overfitScore,
    parameterStability: paramStability,
    combinedTestStats,
    recommendation,
  };
}

export async function runWalkForward(config: {
  initialBalance: number;
  trainWindowYears?: number;
  testWindowYears?: number;
  overallStartDate?: string;
  overallEndDate?: string;
}): Promise<WalkForwardResult> {
  const cfg: WFConfig = {
    overallStartDate: config.overallStartDate ?? "2018-01-01",
    overallEndDate: config.overallEndDate ?? "2023-12-31",
    trainWindowYears: config.trainWindowYears ?? 2,
    testWindowYears: config.testWindowYears ?? 1,
    initialBalance: config.initialBalance,
    riskOptions: [0.5, 1.0, 1.5, 2.0],
  };

  const pairs: Pair[] = ["EURUSD", "GBPUSD", "USDJPY"];
  const pairResults = await Promise.all(pairs.map(p => runPairWalkForward(p, cfg)));

  const avgER = pairResults.reduce((s, r) => s + r.overallEfficiencyRatio, 0) / pairResults.length;
  const avgOverfit = pairResults.reduce((s, r) => s + r.overfitScore, 0) / pairResults.length;
  const stableParams = pairResults.every(r => r.parameterStability.every(p => p.stable));

  // Regime sensitivity: avg sensitivity across all regime stats in all windows
  const allSensitivities = pairResults.flatMap(r => r.windows.flatMap(w => w.regimeSensitivity.map(rs => rs.sensitivity)));
  const avgSens = allSensitivities.length > 0
    ? allSensitivities.reduce((s, v) => s + v, 0) / allSensitivities.length
    : 0;
  const regimeSensitive = avgSens > 15;

  let recommendation: "Pass" | "Marginal" | "Overfit";
  const passCount = pairResults.filter(r => r.recommendation === "Pass").length;
  const overfitCount2 = pairResults.filter(r => r.recommendation === "Overfit").length;
  if (passCount >= 2 && avgOverfit <= 30) recommendation = "Pass";
  else if (overfitCount2 >= 2 || avgOverfit >= 65) recommendation = "Overfit";
  else recommendation = "Marginal";

  return {
    pairs: pairResults,
    summary: {
      avgEfficiencyRatio: Math.round(avgER * 1000) / 1000,
      avgOverfitScore: Math.round(avgOverfit * 10) / 10,
      stableParams,
      regimeSensitive,
      recommendation,
    },
    ranAt: new Date().toISOString(),
  };
}
