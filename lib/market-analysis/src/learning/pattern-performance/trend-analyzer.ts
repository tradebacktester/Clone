// ─── Trend Analyzer ───────────────────────────────────────────────────────────
// Computes pattern performance trends over rolling windows:
//   last 30 → last 100 → last 500 trades.
// Direction: improving | stable | declining | insufficient_data
// Never reports trend on < 5 trades in the 30-trade window.

import type { ExtractedFeature } from "../learning-core/types.js";
import type { PatternStats, PatternTrend, TrendStatus } from "./types.js";
import { MIN_EVIDENCE_SAMPLE } from "./types.js";

const TREND_DELTA_THRESHOLD = 0.05;   // 5% change in win rate = directional trend

// ─── Internal Stats (same math as main engine, no circular dep) ───────────────

function safeDiv(a: number, b: number, fallback = 0): number {
  return b === 0 ? fallback : a / b;
}

function mean(arr: number[]): number {
  return arr.length === 0 ? 0 : arr.reduce((s, v) => s + v, 0) / arr.length;
}

function stdDev(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - 1));
}

function computeMaxDrawdown(sorted: ExtractedFeature[]): number {
  let peak = 0;
  let equity = 0;
  let maxDd = 0;
  for (const f of sorted) {
    equity += f.pnl;
    if (equity > peak) peak = equity;
    const dd = peak > 0 ? (peak - equity) / peak : 0;
    if (dd > maxDd) maxDd = dd;
  }
  return maxDd * 100;
}

function windowStats(features: ExtractedFeature[]): PatternStats {
  const n = features.length;
  const wins = features.filter(f => f.outcome === "win");
  const losses = features.filter(f => f.outcome === "loss");
  const bes = features.filter(f => f.outcome === "break_even");

  const winRate = safeDiv(wins.length, n);
  const lossRate = safeDiv(losses.length, n);

  const rrVals = features.map(f => f.rrActual);
  const avgRR = mean(rrVals);

  const avgProfit = mean(wins.map(f => f.pnl));
  const avgLoss = mean(losses.map(f => Math.abs(f.pnl)));

  const grossProfit = wins.reduce((s, f) => s + f.pnl, 0);
  const grossLoss = losses.reduce((s, f) => s + Math.abs(f.pnl), 0);

  const expectancy = winRate * avgProfit - lossRate * avgLoss;
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 99 : 0;
  const totalPnl = features.reduce((s, f) => s + f.pnl, 0);

  const sorted = [...features].sort((a, b) => a.openedAt.getTime() - b.openedAt.getTime());
  const maxDd = computeMaxDrawdown(sorted);
  const recoveryFactor = maxDd > 0 ? safeDiv(totalPnl, maxDd) : totalPnl > 0 ? 99 : 0;

  const sd = stdDev(rrVals);
  const z95 = 1.96;
  const margin = n > 0 ? z95 * Math.sqrt(winRate * (1 - winRate) / Math.max(n, 1)) : 0;

  return {
    totalTrades: n,
    sampleSize: n,
    wins: wins.length,
    losses: losses.length,
    breakEvens: bes.length,
    winRate,
    lossRate,
    avgRR,
    avgProfit,
    avgLoss,
    expectancy,
    profitFactor,
    avgDurationMins: mean(features.map(f => f.tradeDurationMins)),
    maxDrawdownPct: maxDd,
    recoveryFactor,
    stdDevRR: sd,
    confidenceInterval95: {
      lower: Math.max(0, winRate - margin),
      upper: Math.min(1, winRate + margin),
    },
  };
}

// ─── Trend Analysis ───────────────────────────────────────────────────────────

export function analyzeTrend(features: ExtractedFeature[]): PatternTrend {
  if (features.length === 0) {
    return emptyTrend("No trades available for trend analysis.");
  }

  // Sort newest first for window slicing
  const sorted = [...features].sort((a, b) => b.openedAt.getTime() - a.openedAt.getTime());

  const window30 = sorted.slice(0, 30);
  const window100 = sorted.slice(0, 100);
  const window500 = sorted.slice(0, 500);

  const stats30 = window30.length >= MIN_EVIDENCE_SAMPLE ? windowStats(window30) : null;
  const stats100 = window100.length >= MIN_EVIDENCE_SAMPLE ? windowStats(window100) : null;
  const stats500 = window500.length >= MIN_EVIDENCE_SAMPLE ? windowStats(window500) : null;

  if (!stats30) {
    return {
      last30: null,
      last100: stats100,
      last500: stats500,
      direction: "insufficient_data",
      directionConfidence: 0,
      explanation: `Only ${features.length} trade(s) available. Need at least ${MIN_EVIDENCE_SAMPLE} in the most recent 30 to assess trend.`,
    };
  }

  if (!stats100) {
    return {
      last30: stats30,
      last100: null,
      last500: stats500,
      direction: "insufficient_data",
      directionConfidence: 0,
      explanation: `${features.length} trade(s) total — need at least ${MIN_EVIDENCE_SAMPLE} in the 100-trade window for trend comparison.`,
    };
  }

  const delta = stats30.winRate - stats100.winRate;
  let direction: TrendStatus;
  let directionConfidence: number;
  let explanation: string;

  const pct30 = (stats30.winRate * 100).toFixed(1);
  const pct100 = (stats100.winRate * 100).toFixed(1);
  const deltaPct = (Math.abs(delta) * 100).toFixed(1);

  if (delta > TREND_DELTA_THRESHOLD) {
    direction = "improving";
    directionConfidence = Math.min(95, Math.round(delta * 1200));
    explanation = `Recent 30 trades: ${pct30}% win rate vs ${pct100}% over last 100 — improving by ${deltaPct}%.`;
  } else if (delta < -TREND_DELTA_THRESHOLD) {
    direction = "declining";
    directionConfidence = Math.min(95, Math.round(Math.abs(delta) * 1200));
    explanation = `Recent 30 trades: ${pct30}% win rate vs ${pct100}% over last 100 — declining by ${deltaPct}%.`;
  } else {
    direction = "stable";
    directionConfidence = 80;
    explanation = `Win rate stable at approximately ${pct100}% over the last 100 trades (recent 30: ${pct30}%).`;
  }

  return {
    last30: stats30,
    last100: stats100,
    last500: stats500,
    direction,
    directionConfidence,
    explanation,
  };
}

function emptyTrend(explanation: string): PatternTrend {
  return {
    last30: null,
    last100: null,
    last500: null,
    direction: "insufficient_data",
    directionConfidence: 0,
    explanation,
  };
}
