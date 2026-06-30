// ─── Research Lab — Comparison Engine ────────────────────────────────────────
// Statistical comparison between production and experimental strategy metrics.
// Advisory only.

import { clamp, pctDelta } from "./types.js";
import type { PerformanceMetrics, ComparisonResult } from "./types.js";
import type { FeatureSnapshot } from "./weakness-detector.js";

// ─── Metric extractors ────────────────────────────────────────────────────────

export function extractMetrics(rows: FeatureSnapshot[], config: Record<string, unknown> = {}): PerformanceMetrics {
  const minScore = Number(config.min_setup_score ?? 0);
  const minTqi   = Number(config.min_tqi         ?? 0);
  const filtered = minScore > 0 || minTqi > 0
    ? rows.filter(r => r.setupScore >= minScore && r.tqi >= minTqi)
    : rows;

  const n = filtered.length;
  if (n === 0) {
    return { winRate: 0, avgRr: 0, profitFactor: 0, maxDrawdown: 0, sharpe: 0, totalReturn: 0, tradeCount: 0, avgHoldMins: 0 };
  }

  const wins   = filtered.filter(r => r.outcome === "win").length;
  const winRate= wins / n;
  const avgRr  = filtered.reduce((s, r) => s + (r.rrActual ?? 0), 0) / n;

  const profits= filtered.filter(r => r.outcome === "win" ).reduce((s, r) => s + Math.abs(r.pnl ?? 0), 0);
  const losses = filtered.filter(r => r.outcome === "loss").reduce((s, r) => s + Math.abs(r.pnl ?? 0), 0);
  const pf     = losses === 0 ? (profits > 0 ? 99 : 1) : profits / losses;

  // Simple drawdown
  let peak = 0; let equity = 1000; let maxDD = 0;
  const sorted = [...filtered].sort((a, b) => a.openedAt.getTime() - b.openedAt.getTime());
  let totalReturn = 0;
  for (const r of sorted) {
    const pnl = r.pnl ?? 0;
    equity += pnl; totalReturn += pnl;
    if (equity > peak) peak = equity;
    const dd = peak > 0 ? (peak - equity) / peak : 0;
    if (dd > maxDD) maxDD = dd;
  }

  const pnls   = filtered.map(r => r.pnl ?? 0);
  const avgPnl = pnls.reduce((s, v) => s + v, 0) / pnls.length;
  const pnlStd = Math.sqrt(pnls.reduce((s, v) => s + (v - avgPnl) ** 2, 0) / pnls.length);
  const sharpe = pnlStd === 0 ? 0 : (avgPnl / pnlStd) * Math.sqrt(252);

  return {
    winRate, avgRr, profitFactor: pf, maxDrawdown: maxDD,
    sharpe: clamp(sharpe, -5, 10), totalReturn, tradeCount: n, avgHoldMins: 0,
  };
}

// ─── Two-proportion z-test (approximate p-value) ──────────────────────────────

function twoProportionPValue(p1: number, n1: number, p2: number, n2: number): number {
  if (n1 < 5 || n2 < 5) return 1.0;
  const pPool = (p1 * n1 + p2 * n2) / (n1 + n2);
  const se    = Math.sqrt(pPool * (1 - pPool) * (1 / n1 + 1 / n2));
  if (se === 0) return 1.0;
  const z     = Math.abs(p1 - p2) / se;
  // Approximate p-value using normal CDF complement
  return 2 * (1 - normalCdf(z));
}

function normalCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const poly = t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  const pdf  = Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
  return z >= 0 ? 1 - pdf * poly : pdf * poly;
}

// ─── Main comparator ─────────────────────────────────────────────────────────

export function compareStrategies(
  prodRows: FeatureSnapshot[],
  expRows:  FeatureSnapshot[],
  expConfig: Record<string, unknown> = {},
): ComparisonResult {
  const prod = extractMetrics(prodRows);
  const exp  = extractMetrics(expRows, expConfig);

  const metrics: Array<{ key: keyof PerformanceMetrics; label: string; higherIsBetter: boolean }> = [
    { key: "winRate",      label: "Win Rate",      higherIsBetter: true  },
    { key: "avgRr",        label: "Avg R:R",        higherIsBetter: true  },
    { key: "profitFactor", label: "Profit Factor",  higherIsBetter: true  },
    { key: "maxDrawdown",  label: "Max Drawdown",   higherIsBetter: false },
    { key: "sharpe",       label: "Sharpe Ratio",   higherIsBetter: true  },
  ];

  const improvements: ComparisonResult["improvements"] = [];
  const regressions:  ComparisonResult["regressions"]  = [];

  for (const m of metrics) {
    const prodVal = prod[m.key] as number;
    const expVal  = exp[m.key]  as number;
    const delta   = expVal - prodVal;
    const pct     = pctDelta(prodVal, expVal);
    const isImprovement = m.higherIsBetter ? delta > 0 : delta < 0;
    const item    = { metric: m.label, prod: prodVal, exp: expVal, delta, pct };
    if (Math.abs(pct) > 1) {
      if (isImprovement) improvements.push(item);
      else               regressions.push(item);
    }
  }

  const winRatePValue   = twoProportionPValue(prod.winRate, prod.tradeCount, exp.winRate, exp.tradeCount);
  const sharpeImprovement = pctDelta(prod.sharpe || 0.01, exp.sharpe || 0.01);
  const isStatSignificant = winRatePValue < 0.05 && improvements.length > regressions.length;

  // Verdict scoring
  const improvementScore = improvements.reduce((s, i) => s + Math.min(Math.abs(i.pct), 20), 0);
  const regressionScore  = regressions.reduce((s,  r) => s + Math.min(Math.abs(r.pct), 20), 0);
  const verdictScore     = clamp(50 + improvementScore - regressionScore);

  const overallVerdict: "superior" | "equivalent" | "inferior" =
    verdictScore >= 60 ? "superior" : verdictScore >= 45 ? "equivalent" : "inferior";

  const summary = [
    `Experimental vs Production: ${improvements.length} improvements, ${regressions.length} regressions.`,
    `Verdict score: ${verdictScore.toFixed(0)}/100 — ${overallVerdict}.`,
    isStatSignificant
      ? `Win-rate difference statistically significant (p=${winRatePValue.toFixed(3)}).`
      : `Win-rate difference not yet statistically significant (p=${winRatePValue.toFixed(3)}).`,
    improvements.length > 0 ? `Top improvement: ${improvements[0]!.metric} +${improvements[0]!.pct.toFixed(1)}%.` : "",
    regressions.length > 0  ? `Top regression: ${regressions[0]!.metric} ${regressions[0]!.pct.toFixed(1)}%.` : "",
  ].filter(Boolean).join(" ");

  return {
    productionMetrics:   prod,
    experimentMetrics:   exp,
    improvements,
    regressions,
    winRatePValue,
    sharpeImprovement,
    isStatSignificant,
    overallVerdict,
    verdictScore,
    summary,
  };
}
