// ─── Report Generator ────────────────────────────────────────────────────────
// Generates human-readable learning reports from completed cycles.
// Produces: cycle summary, recommendations, trend comparison.

import type {
  LearningCycle,
  LearningMetrics,
  ConfidenceReport,
  LearningRecommendation,
  StatisticalAnalysis,
} from "../learning-core/types.js";
import { safeDivide } from "../learning-validation/data-validator.js";

// ─── Recommendation Generator ────────────────────────────────────────────────

export function generateRecommendations(
  metrics: LearningMetrics,
  confidence: ConfidenceReport,
): LearningRecommendation[] {
  const recs: LearningRecommendation[] = [];

  // Pair performance
  for (const [pair, seg] of Object.entries(metrics.byPair)) {
    if (seg.totalTrades < 5) continue;
    if (seg.winRate < 0.35 && confidence.byPair[pair]?.confidenceTier !== "insufficient") {
      recs.push(rec(
        "pair_performance",
        `Low Win Rate on ${pair}`,
        `${pair} shows a win rate of ${pct(seg.winRate)} over ${seg.totalTrades} trades — ` +
        `significantly below the 35% threshold for positive expectancy with average R:R.`,
        `Win rate: ${pct(seg.winRate)}, Profit factor: ${seg.profitFactor.toFixed(2)}, ` +
        `Expectancy: ${seg.expectancy.toFixed(2)}, Sample: ${seg.totalTrades} trades`,
        confidence.byPair[pair]?.finalConfidence ?? 0,
        "high",
      ));
    }
    if (seg.winRate > 0.65 && seg.totalTrades >= 10 && seg.profitFactor > 1.5) {
      recs.push(rec(
        "pair_performance",
        `Strong Performance on ${pair}`,
        `${pair} shows consistent performance: ${pct(seg.winRate)} win rate with profit factor ${seg.profitFactor.toFixed(2)}.`,
        `Win rate: ${pct(seg.winRate)}, Profit factor: ${seg.profitFactor.toFixed(2)}, Sample: ${seg.totalTrades} trades`,
        confidence.byPair[pair]?.finalConfidence ?? 0,
        "medium",
      ));
    }
  }

  // Session timing
  for (const [session, seg] of Object.entries(metrics.bySession)) {
    if (seg.totalTrades < 5) continue;
    if (seg.winRate < 0.30) {
      recs.push(rec(
        "session_timing",
        `Underperforming Session: ${session}`,
        `The ${session} session shows only ${pct(seg.winRate)} win rate over ${seg.totalTrades} trades. ` +
        `Consider reviewing session-specific entry criteria.`,
        `Session: ${session}, WR: ${pct(seg.winRate)}, Avg RR: ${seg.avgRR.toFixed(2)}, PF: ${seg.profitFactor.toFixed(2)}`,
        confidence.bySession[session]?.finalConfidence ?? 0,
        "medium",
      ));
    }
  }

  // Regime filter
  for (const [regime, seg] of Object.entries(metrics.byRegime)) {
    if (seg.totalTrades < 5) continue;
    if (seg.winRate < 0.30 && seg.profitFactor < 1.0) {
      recs.push(rec(
        "regime_filter",
        `Negative Expectancy in ${regime} Regime`,
        `Trades taken during ${regime} market regime have negative expectancy ` +
        `(profit factor: ${seg.profitFactor.toFixed(2)}) over ${seg.totalTrades} trades.`,
        `Regime: ${regime}, WR: ${pct(seg.winRate)}, PF: ${seg.profitFactor.toFixed(2)}, Expectancy: ${seg.expectancy.toFixed(2)}`,
        confidence.byRegime[regime]?.finalConfidence ?? 0,
        "high",
      ));
    }
  }

  // Score threshold — low setup score trades
  const lowScore = metrics.byZoneQuality["low"];
  if (lowScore && lowScore.totalTrades >= 5 && lowScore.winRate < 0.40) {
    recs.push(rec(
      "score_threshold",
      `Low Zone Quality Setups Underperform`,
      `Trades with low zone quality (<40) show ${pct(lowScore.winRate)} win rate. ` +
      `Statistical evidence suggests these setups drag overall performance.`,
      `Low quality trades: ${lowScore.totalTrades}, WR: ${pct(lowScore.winRate)}, PF: ${lowScore.profitFactor.toFixed(2)}`,
      35,
      "medium",
    ));
  }

  // Data quality
  if (confidence.dataQuality < 60) {
    recs.push(rec(
      "data_quality",
      `Low Data Completeness`,
      `Data completeness is ${confidence.dataQuality.toFixed(0)}% — below the 60% threshold. ` +
      `Metrics may be unreliable. Ensure trades have complete score data.`,
      `Completeness: ${confidence.dataQuality.toFixed(0)}%`,
      80,
      "high",
    ));
  }

  // Sample size
  if (confidence.sampleSize < 30) {
    recs.push(rec(
      "sample_size",
      `Insufficient Sample Size`,
      `Only ${confidence.sampleSize} closed trades available. ` +
      `Statistical reliability increases significantly above 30 trades. Confidence scores are conservative.`,
      `Sample: ${confidence.sampleSize} trades, minimum recommended: 30`,
      90,
      "medium",
    ));
  }

  return recs.slice(0, 10); // cap at 10 recommendations per cycle
}

// ─── Cycle Summary Text ───────────────────────────────────────────────────────

export function formatCycleSummary(cycle: LearningCycle): string {
  const m = cycle.metrics;
  const c = cycle.confidence;
  if (!m || !c) return "Learning cycle incomplete — no metrics available.";

  const lines: string[] = [
    `Learning Cycle #${cycle.cycleNumber} — ${cycle.version}`,
    `Status: ${cycle.status.toUpperCase()} | Validation: ${cycle.validationStatus.toUpperCase()}`,
    `Period: ${fmtDate(cycle.dataRangeFrom)} → ${fmtDate(cycle.dataRangeTo)}`,
    `Sample: ${m.totalTrades} trades (${m.wins}W / ${m.losses}L / ${m.breakEvens}BE)`,
    ``,
    `── Core Metrics ──`,
    `Win Rate:       ${pct(m.winRate)}`,
    `Avg R:R:        ${m.avgRR.toFixed(2)}`,
    `Profit Factor:  ${m.profitFactor === Infinity ? "∞" : m.profitFactor.toFixed(2)}`,
    `Expectancy:     ${m.expectancy.toFixed(2)}`,
    `Sharpe:         ${m.sharpeRatio.toFixed(2)}`,
    `Sortino:        ${m.sortinoRatio === Infinity ? "∞" : m.sortinoRatio.toFixed(2)}`,
    `Max Drawdown:   ${m.maxDrawdownPct.toFixed(1)}%`,
    `Recovery Factor:${m.recoveryFactor.toFixed(2)}`,
    ``,
    `── Confidence ──`,
    `Overall:        ${c.overallConfidence.toFixed(1)}% (${c.overallTier})`,
    `Data Quality:   ${c.dataQuality.toFixed(0)}%`,
    `Sample OK:      ${c.minSampleReached ? "Yes" : "No (below minimum)"}`,
    ``,
    `── Recommendations ──`,
    ...cycle.recommendations.map((r, i) =>
      `${i + 1}. [${r.priority.toUpperCase()}] ${r.title}`,
    ),
    cycle.recommendations.length === 0 ? "  None generated." : "",
  ];

  return lines.filter(l => l !== undefined).join("\n");
}

// ─── Comparison Helper ────────────────────────────────────────────────────────

export interface CycleComparison {
  metric: string;
  previous: number | null;
  current: number;
  delta: number | null;
  trend: "improved" | "declined" | "stable" | "no_baseline";
}

export function compareCycles(
  current: LearningCycle,
  previous: LearningCycle | null,
): CycleComparison[] {
  if (!current.metrics) return [];
  const cm = current.metrics;
  const pm = previous?.metrics ?? null;

  const compare = (
    label: string,
    cur: number,
    prev: number | null,
    higherIsBetter: boolean,
  ): CycleComparison => {
    const delta = prev !== null ? cur - prev : null;
    let trend: CycleComparison["trend"] = "no_baseline";
    if (delta !== null) {
      if (Math.abs(delta) < 0.005) trend = "stable";
      else trend = (higherIsBetter ? delta > 0 : delta < 0) ? "improved" : "declined";
    }
    return { metric: label, current: cur, previous: prev, delta, trend };
  };

  return [
    compare("Win Rate", cm.winRate, pm?.winRate ?? null, true),
    compare("Avg R:R", cm.avgRR, pm?.avgRR ?? null, true),
    compare("Profit Factor", cm.profitFactor === Infinity ? 99 : cm.profitFactor, pm?.profitFactor === Infinity ? 99 : (pm?.profitFactor ?? null), true),
    compare("Expectancy", cm.expectancy, pm?.expectancy ?? null, true),
    compare("Sharpe Ratio", cm.sharpeRatio, pm?.sharpeRatio ?? null, true),
    compare("Max Drawdown %", cm.maxDrawdownPct, pm?.maxDrawdownPct ?? null, false),
    compare("Total PnL", cm.totalPnl, pm?.totalPnl ?? null, true),
    compare("Sample Size", cm.totalTrades, pm?.totalTrades ?? null, true),
  ];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

let _recCounter = 0;

function rec(
  category: LearningRecommendation["category"],
  title: string,
  description: string,
  evidence: string,
  confidence: number,
  priority: LearningRecommendation["priority"],
): LearningRecommendation {
  return {
    id: `rec-${++_recCounter}-${Date.now()}`,
    category,
    title,
    description,
    evidence,
    confidence,
    priority,
    isAdvisoryOnly: true,
  };
}

function pct(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

function fmtDate(d: Date | null): string {
  if (!d) return "N/A";
  return d.toISOString().slice(0, 10);
}
