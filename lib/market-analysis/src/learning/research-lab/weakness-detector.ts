// ─── Research Lab — Weakness Detector ────────────────────────────────────────
// Observes production learning features and trade results to identify weaknesses.
// Advisory only — no strategy modification.

import { randomUUID } from "crypto";
import type { Weakness } from "./types.js";

// ─── Feature snapshot ─────────────────────────────────────────────────────────

export interface FeatureSnapshot {
  pair:       string;
  session:    string;
  regime:     string;
  outcome:    string;
  winRate?:   number;
  avgRr?:     number;
  pf?:        number;
  setupScore: number;
  tqi:        number;
  drawdown?:  number;
  rrActual?:  number;
  pnl?:       number;
  openedAt:   Date;
}

// ─── Aggregate helpers ────────────────────────────────────────────────────────

function winRate(rows: FeatureSnapshot[]): number {
  if (rows.length === 0) return 0;
  return rows.filter(r => r.outcome === "win").length / rows.length;
}

function avg(rows: FeatureSnapshot[], key: keyof FeatureSnapshot): number {
  const vals = rows.map(r => Number(r[key] ?? 0)).filter(v => v !== 0);
  return vals.length === 0 ? 0 : vals.reduce((s, v) => s + v, 0) / vals.length;
}

function profitFactor(rows: FeatureSnapshot[]): number {
  const wins  = rows.filter(r => r.outcome === "win" ).reduce((s, r) => s + Math.abs(Number(r.pnl ?? 0)), 0);
  const losses= rows.filter(r => r.outcome === "loss").reduce((s, r) => s + Math.abs(Number(r.pnl ?? 0)), 0);
  return losses === 0 ? (wins > 0 ? 99 : 1) : wins / losses;
}

// ─── Individual weakness checks ────────────────────────────────────────────────

function checkWinRate(rows: FeatureSnapshot[]): Weakness | null {
  if (rows.length < 10) return null;
  const wr = winRate(rows);
  if (wr >= 0.45) return null;
  const severity: Weakness["severity"] = wr < 0.30 ? "critical" : wr < 0.38 ? "high" : "medium";
  return {
    id: randomUUID(), category: "win_rate",
    title: "Below-Threshold Win Rate",
    description: `Overall win rate is ${(wr * 100).toFixed(1)}%, below the 45% minimum target.`,
    severity,
    metric: "win_rate", currentValue: wr, targetValue: 0.45,
    evidence: [
      `${rows.length} trades analyzed`,
      `Win rate: ${(wr * 100).toFixed(1)}%`,
      `Target: 45%`,
      `Gap: ${((0.45 - wr) * 100).toFixed(1)}pp`,
    ],
    detectedAt: new Date(),
  };
}

function checkAvgRr(rows: FeatureSnapshot[]): Weakness | null {
  if (rows.length < 10) return null;
  const rr = avg(rows, "rrActual");
  if (rr >= 1.5 || rr === 0) return null;
  const severity: Weakness["severity"] = rr < 0.8 ? "critical" : rr < 1.2 ? "high" : "medium";
  return {
    id: randomUUID(), category: "avg_rr",
    title: "Insufficient Average R:R",
    description: `Average realized R:R is ${rr.toFixed(2)}, below the 1.5 minimum target.`,
    severity,
    metric: "avg_rr", currentValue: rr, targetValue: 1.5,
    evidence: [
      `Average R:R: ${rr.toFixed(2)}`,
      `Target: 1.5`,
      `Gap: ${(1.5 - rr).toFixed(2)}`,
      `Sample: ${rows.length} trades`,
    ],
    detectedAt: new Date(),
  };
}

function checkProfitFactor(rows: FeatureSnapshot[]): Weakness | null {
  if (rows.length < 10) return null;
  const pf = profitFactor(rows);
  if (pf >= 1.3 || pf === 0) return null;
  const severity: Weakness["severity"] = pf < 0.8 ? "critical" : pf < 1.0 ? "high" : "medium";
  return {
    id: randomUUID(), category: "profit_factor",
    title: "Low Profit Factor",
    description: `Profit factor is ${pf.toFixed(2)}, below the 1.3 threshold.`,
    severity,
    metric: "profit_factor", currentValue: pf, targetValue: 1.3,
    evidence: [
      `Profit factor: ${pf.toFixed(2)}`,
      `Target: ≥1.3`,
      `Sample: ${rows.length} trades`,
    ],
    detectedAt: new Date(),
  };
}

function checkSetupQuality(rows: FeatureSnapshot[]): Weakness | null {
  if (rows.length < 10) return null;
  const avgScore = avg(rows, "setupScore");
  const lowQuality = rows.filter(r => r.setupScore < 65);
  const lowQualityWr = winRate(lowQuality);
  if (lowQuality.length < 5 || lowQualityWr >= 0.45) return null;
  const severity: Weakness["severity"] = lowQualityWr < 0.30 ? "high" : "medium";
  return {
    id: randomUUID(), category: "setup_quality",
    title: "Low-Quality Setup Acceptance",
    description: `${lowQuality.length} trades taken with setup score <65 have win rate ${(lowQualityWr * 100).toFixed(1)}%.`,
    severity,
    metric: "low_quality_win_rate", currentValue: lowQualityWr, targetValue: 0.45,
    evidence: [
      `Average setup score: ${avgScore.toFixed(1)}`,
      `Low-quality trades (score<65): ${lowQuality.length}`,
      `Low-quality win rate: ${(lowQualityWr * 100).toFixed(1)}%`,
      `Hypothesis: raising the setup score threshold may improve quality.`,
    ],
    detectedAt: new Date(),
  };
}

function checkRegimedPerformance(rows: FeatureSnapshot[]): Weakness | null {
  if (rows.length < 20) return null;
  const regimes = ["trending", "ranging", "volatile", "low_volatility"];
  for (const regime of regimes) {
    const subset = rows.filter(r => r.regime === regime);
    if (subset.length < 5) continue;
    const wr = winRate(subset);
    if (wr < 0.35) {
      return {
        id: randomUUID(), category: "regime_performance",
        title: `Poor Performance in ${regime.replace("_", " ")} Regime`,
        description: `Win rate is only ${(wr * 100).toFixed(1)}% in ${regime} market conditions (${subset.length} trades).`,
        severity: wr < 0.25 ? "high" : "medium",
        metric: `${regime}_win_rate`, currentValue: wr, targetValue: 0.40,
        evidence: [
          `${regime} regime: ${subset.length} trades`,
          `Win rate: ${(wr * 100).toFixed(1)}%`,
          `Target: 40%`,
          `Consider adding a ${regime} regime filter or specific adjustments.`,
        ],
        detectedAt: new Date(),
      };
    }
  }
  return null;
}

function checkSessionPerformance(rows: FeatureSnapshot[]): Weakness | null {
  if (rows.length < 20) return null;
  const sessions = ["london", "new_york", "overlap"];
  for (const session of sessions) {
    const subset = rows.filter(r => r.session === session);
    if (subset.length < 5) continue;
    const wr = winRate(subset);
    if (wr < 0.35) {
      return {
        id: randomUUID(), category: "session_performance",
        title: `Poor Performance in ${session.replace("_", " ")} Session`,
        description: `Win rate is only ${(wr * 100).toFixed(1)}% during ${session} session (${subset.length} trades).`,
        severity: wr < 0.25 ? "high" : "medium",
        metric: `${session}_win_rate`, currentValue: wr, targetValue: 0.40,
        evidence: [
          `${session} session: ${subset.length} trades`,
          `Win rate: ${(wr * 100).toFixed(1)}%`,
          `Consider session-specific filters.`,
        ],
        detectedAt: new Date(),
      };
    }
  }
  return null;
}

function checkTqiDivergence(rows: FeatureSnapshot[]): Weakness | null {
  if (rows.length < 15) return null;
  const highTqi  = rows.filter(r => r.tqi >= 70);
  const lowTqi   = rows.filter(r => r.tqi < 70);
  if (highTqi.length < 4 || lowTqi.length < 4) return null;
  const highWr = winRate(highTqi);
  const lowWr  = winRate(lowTqi);
  if (highWr - lowWr < 0.10) return null; // no significant divergence
  return {
    id: randomUUID(), category: "tqi_gate",
    title: "TQI Gate Not Fully Enforced",
    description: `High-TQI trades (≥70) win rate: ${(highWr * 100).toFixed(1)}% vs low-TQI (<70): ${(lowWr * 100).toFixed(1)}%. Gap: ${((highWr - lowWr) * 100).toFixed(1)}pp.`,
    severity: (highWr - lowWr) > 0.20 ? "high" : "medium",
    metric: "tqi_win_rate_gap", currentValue: highWr - lowWr, targetValue: 0.05,
    evidence: [
      `High-TQI trades: ${highTqi.length} (win rate ${(highWr * 100).toFixed(1)}%)`,
      `Low-TQI trades: ${lowTqi.length} (win rate ${(lowWr * 100).toFixed(1)}%)`,
      `Win rate gap: ${((highWr - lowWr) * 100).toFixed(1)}pp`,
      `Recommendation: raise TQI threshold to 70+.`,
    ],
    detectedAt: new Date(),
  };
}

// ─── Main detector ─────────────────────────────────────────────────────────────

export function detectWeaknesses(rows: FeatureSnapshot[]): Weakness[] {
  const checks: Array<() => Weakness | null> = [
    () => checkWinRate(rows),
    () => checkAvgRr(rows),
    () => checkProfitFactor(rows),
    () => checkSetupQuality(rows),
    () => checkRegimedPerformance(rows),
    () => checkSessionPerformance(rows),
    () => checkTqiDivergence(rows),
  ];

  const weaknesses: Weakness[] = [];
  for (const check of checks) {
    const w = check();
    if (w) weaknesses.push(w);
  }

  // Sort by severity
  const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  return weaknesses.sort((a, b) => order[a.severity]! - order[b.severity]!);
}
