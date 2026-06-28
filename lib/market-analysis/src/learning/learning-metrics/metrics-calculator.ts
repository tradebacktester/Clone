// ─── Metrics Calculator ─────────────────────────────────────────────────────
// All 18+ learning metrics computed from ExtractedFeature arrays.
// Pure functions — no randomness, fully reproducible from the same inputs.
// Risk-free rate assumed 0 for Sharpe/Sortino (trading context).

import type {
  ExtractedFeature,
  LearningMetrics,
  SegmentMetrics,
  HistogramBin,
} from "../learning-core/types.js";
import { safeDivide } from "../learning-validation/data-validator.js";

const RISK_FREE_RATE = 0; // assumed 0 for intraday forex

// ─── Main Calculation ────────────────────────────────────────────────────────

export function calculateMetrics(features: ExtractedFeature[]): LearningMetrics {
  if (features.length === 0) return emptyMetrics();

  const closed = features.filter(f => f.outcome !== undefined);
  const wins = closed.filter(f => f.outcome === "win");
  const losses = closed.filter(f => f.outcome === "loss");
  const breakEvens = closed.filter(f => f.outcome === "break_even");

  const totalTrades = closed.length;
  const winCount = wins.length;
  const lossCount = losses.length;
  const breakEvenCount = breakEvens.length;

  const winRate = safeDivide(winCount, totalTrades);
  const lossRate = safeDivide(lossCount, totalTrades);

  const avgRR = mean(closed.map(f => f.rrActual));
  const avgDurationMins = mean(closed.map(f => f.tradeDurationMins));

  const winPnls = wins.map(f => f.pnl);
  const lossPnls = losses.map(f => f.pnl);

  const avgWin = winPnls.length > 0 ? mean(winPnls) : 0;
  const avgLoss = lossPnls.length > 0 ? Math.abs(mean(lossPnls)) : 0;

  const grossProfit = winPnls.reduce((s, v) => s + Math.max(0, v), 0);
  const grossLoss = Math.abs(lossPnls.reduce((s, v) => s + Math.min(0, v), 0));
  const totalPnl = closed.reduce((s, f) => s + f.pnl, 0);

  const profitFactor = safeDivide(grossProfit, grossLoss, grossProfit > 0 ? Infinity : 0);
  const expectancy = winRate * avgWin - lossRate * avgLoss;

  const { maxDrawdownPct, recoveryFactor } = computeDrawdown(closed, totalPnl);
  const sharpeRatio = computeSharpe(closed);
  const sortinoRatio = computeSortino(closed);

  return {
    totalTrades,
    wins: winCount,
    losses: lossCount,
    breakEvens: breakEvenCount,
    winRate,
    lossRate,
    avgRR,
    avgWin,
    avgLoss,
    avgDurationMins,
    profitFactor,
    expectancy,
    maxDrawdownPct,
    recoveryFactor,
    sharpeRatio,
    sortinoRatio,
    totalPnl,
    grossProfit,
    grossLoss,

    byPair: segmentBy(closed, f => f.pair),
    bySession: segmentBy(closed, f => f.session),
    byRegime: segmentBy(closed, f => f.marketRegime),
    byZoneQuality: segmentBy(closed, f => qualityBucket(Math.max(f.supplyQuality, f.demandQuality))),
    byLiquidity: segmentBy(closed, f => qualityBucket(f.liquidityScore)),
    byAmd: segmentBy(closed, f => qualityBucket(f.amdScore)),
    byConfirmation: segmentBy(closed, f => qualityBucket(f.confirmationQuality)),
    byVolatility: segmentBy(closed, f => f.volatility),

    confidenceDistribution: buildHistogram(closed, f => f.confidence, confidenceBins()),
    rrDistribution: buildHistogram(closed, f => f.rrActual, rrBins()),
    durationDistribution: buildHistogram(closed, f => f.tradeDurationMins, durationBins()),
  };
}

// ─── Segment Analysis ────────────────────────────────────────────────────────

export function segmentBy(
  features: ExtractedFeature[],
  keyFn: (f: ExtractedFeature) => string,
): Record<string, SegmentMetrics> {
  const groups: Record<string, ExtractedFeature[]> = {};
  for (const f of features) {
    const k = keyFn(f) || "unknown";
    (groups[k] ??= []).push(f);
  }
  const result: Record<string, SegmentMetrics> = {};
  for (const [label, group] of Object.entries(groups)) {
    result[label] = computeSegmentMetrics(label, group);
  }
  return result;
}

function computeSegmentMetrics(label: string, features: ExtractedFeature[]): SegmentMetrics {
  const wins = features.filter(f => f.outcome === "win");
  const losses = features.filter(f => f.outcome === "loss");
  const breakEvens = features.filter(f => f.outcome === "break_even");
  const n = features.length;

  const grossProfit = wins.reduce((s, f) => s + Math.max(0, f.pnl), 0);
  const grossLoss = Math.abs(losses.reduce((s, f) => s + Math.min(0, f.pnl), 0));

  return {
    label,
    totalTrades: n,
    wins: wins.length,
    losses: losses.length,
    breakEvens: breakEvens.length,
    winRate: safeDivide(wins.length, n),
    lossRate: safeDivide(losses.length, n),
    avgRR: n > 0 ? mean(features.map(f => f.rrActual)) : 0,
    avgDurationMins: n > 0 ? mean(features.map(f => f.tradeDurationMins)) : 0,
    profitFactor: safeDivide(grossProfit, grossLoss, grossProfit > 0 ? Infinity : 0),
    expectancy:
      safeDivide(wins.length, n) * (wins.length > 0 ? mean(wins.map(f => f.pnl)) : 0) -
      safeDivide(losses.length, n) * (losses.length > 0 ? Math.abs(mean(losses.map(f => f.pnl))) : 0),
    totalPnl: features.reduce((s, f) => s + f.pnl, 0),
  };
}

// ─── Drawdown ────────────────────────────────────────────────────────────────

export function computeDrawdown(
  features: ExtractedFeature[],
  totalPnl: number,
): { maxDrawdownPct: number; recoveryFactor: number } {
  if (features.length === 0) return { maxDrawdownPct: 0, recoveryFactor: 0 };

  // Sort by openedAt ascending to build equity curve
  const sorted = [...features].sort(
    (a, b) => a.openedAt.getTime() - b.openedAt.getTime(),
  );

  let equity = 0;
  let peak = 0;
  let maxDD = 0;

  for (const f of sorted) {
    equity += f.pnl;
    if (equity > peak) peak = equity;
    const dd = peak - equity;
    if (dd > maxDD) maxDD = dd;
  }

  // Express as % of peak equity (avoid div-by-zero if all losses)
  const maxDrawdownPct = peak > 0 ? (maxDD / peak) * 100 : maxDD > 0 ? 100 : 0;
  const recoveryFactor = safeDivide(totalPnl, maxDD);

  return { maxDrawdownPct, recoveryFactor };
}

// ─── Sharpe Ratio ────────────────────────────────────────────────────────────
// Uses per-trade pnl returns; risk-free rate = 0.

export function computeSharpe(features: ExtractedFeature[]): number {
  if (features.length < 2) return 0;
  const returns = features.map(f => f.pnlPercent);
  const mu = mean(returns) - RISK_FREE_RATE;
  const sigma = stdDev(returns);
  return safeDivide(mu, sigma);
}

// ─── Sortino Ratio ──────────────────────────────────────────────────────────
// Uses downside deviation (only negative returns).

export function computeSortino(features: ExtractedFeature[]): number {
  if (features.length < 2) return 0;
  const returns = features.map(f => f.pnlPercent);
  const mu = mean(returns) - RISK_FREE_RATE;
  const downside = returns.filter(r => r < 0);
  if (downside.length === 0) return mu > 0 ? Infinity : 0;
  const downsideDev = stdDev(downside);
  return safeDivide(mu, downsideDev);
}

// ─── Histograms ──────────────────────────────────────────────────────────────

export function buildHistogram(
  features: ExtractedFeature[],
  valueFn: (f: ExtractedFeature) => number,
  bins: Array<{ label: string; min: number; max: number }>,
): HistogramBin[] {
  return bins.map(bin => {
    const inBin = features.filter(f => {
      const v = valueFn(f);
      return v >= bin.min && v < bin.max;
    });
    const wins = inBin.filter(f => f.outcome === "win").length;
    return {
      label: bin.label,
      min: bin.min,
      max: bin.max,
      count: inBin.length,
      winRate: safeDivide(wins, inBin.length),
    };
  });
}

function confidenceBins() {
  return [
    { label: "0–20", min: 0, max: 20 },
    { label: "20–40", min: 20, max: 40 },
    { label: "40–60", min: 40, max: 60 },
    { label: "60–80", min: 60, max: 80 },
    { label: "80–100", min: 80, max: 101 },
  ];
}

function rrBins() {
  return [
    { label: "<0 (loss)", min: -Infinity, max: 0 },
    { label: "0–1R", min: 0, max: 1 },
    { label: "1–2R", min: 1, max: 2 },
    { label: "2–3R", min: 2, max: 3 },
    { label: ">3R", min: 3, max: Infinity },
  ];
}

function durationBins() {
  return [
    { label: "<30m", min: 0, max: 30 },
    { label: "30–120m", min: 30, max: 120 },
    { label: "2–8h", min: 120, max: 480 },
    { label: "8–24h", min: 480, max: 1440 },
    { label: ">24h", min: 1440, max: Infinity },
  ];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

export function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const mu = mean(values);
  const variance = values.reduce((s, v) => s + (v - mu) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

export function qualityBucket(score: number): "low" | "medium" | "high" {
  if (score >= 70) return "high";
  if (score >= 40) return "medium";
  return "low";
}

function emptyMetrics(): LearningMetrics {
  const emptySegments = {};
  return {
    totalTrades: 0, wins: 0, losses: 0, breakEvens: 0,
    winRate: 0, lossRate: 0, avgRR: 0, avgWin: 0, avgLoss: 0,
    avgDurationMins: 0, profitFactor: 0, expectancy: 0,
    maxDrawdownPct: 0, recoveryFactor: 0, sharpeRatio: 0, sortinoRatio: 0,
    totalPnl: 0, grossProfit: 0, grossLoss: 0,
    byPair: emptySegments, bySession: emptySegments, byRegime: emptySegments,
    byZoneQuality: emptySegments, byLiquidity: emptySegments,
    byAmd: emptySegments, byConfirmation: emptySegments,
    byVolatility: emptySegments,
    confidenceDistribution: [], rrDistribution: [], durationDistribution: [],
  };
}
