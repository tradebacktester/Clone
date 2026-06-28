// ─── Drift Detector ───────────────────────────────────────────────────────────
// Phase 3: Detects changes in market behavior and learning quality over time.
// ADVISORY ONLY — generates alerts and reduces confidence, never changes strategy.
//
// Drift types monitored:
//   1. Win rate decline (rolling window regression)
//   2. Market regime change (regime distribution shift)
//   3. Pattern degradation (per-pattern win rate decline)
//   4. Confidence deterioration (confidence score trend)
//   5. Statistical significance loss (p-value drift)
//   6. Volatility shift (spread/volatility distribution change)
//   7. Correlation change (pair/session correlation shifts)

import { randomUUID } from "crypto";
import type { ExtractedFeature } from "../learning-core/types.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export type DriftType =
  | "win_rate"
  | "regime"
  | "pattern"
  | "confidence"
  | "statistical_significance"
  | "volatility"
  | "correlation";

export type DriftSeverity = "low" | "medium" | "high" | "critical";

export interface DriftEvent {
  driftId: string;
  driftType: DriftType;
  severity: DriftSeverity;
  affectedEntity: string;
  affectedWindow: string;

  baselineValue: number;
  currentValue: number;
  deltaAbsolute: number;
  deltaPct: number;
  threshold: number;

  zScore: number;
  pValue: number;
  isSignificant: boolean;

  description: string;
  recommendation: string;
}

export interface DriftReport {
  runId: string;
  detectedAt: Date;
  totalEventsDetected: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  events: DriftEvent[];
  summary: string;
  overallDriftSeverity: DriftSeverity | "none";
}

// ─── Thresholds ───────────────────────────────────────────────────────────────

const THRESHOLDS = {
  winRate: {
    low: 0.05,     // 5pp decline
    medium: 0.10,  // 10pp decline
    high: 0.15,    // 15pp decline
    critical: 0.20,
  },
  confidence: {
    low: 5,
    medium: 10,
    high: 15,
    critical: 20,
  },
  volatility: {
    low: 0.15,
    medium: 0.25,
    high: 0.40,
    critical: 0.60,
  },
};

// ─── Normal CDF Approximation ─────────────────────────────────────────────────

function normalCDF(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const poly = t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  const pdf = Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
  const cdf = 1 - pdf * poly;
  return z >= 0 ? cdf : 1 - cdf;
}

function pValue(z: number): number {
  return 2 * (1 - normalCDF(Math.abs(z)));
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function meanVal(vals: number[]): number {
  if (!vals.length) return 0;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function stdDev(vals: number[]): number {
  if (vals.length < 2) return 0;
  const m = meanVal(vals);
  return Math.sqrt(vals.reduce((s, v) => s + Math.pow(v - m, 2), 0) / vals.length);
}

function classifySeverity(delta: number, thresholds: typeof THRESHOLDS.winRate): DriftSeverity {
  const abs = Math.abs(delta);
  if (abs >= thresholds.critical) return "critical";
  if (abs >= thresholds.high) return "high";
  if (abs >= thresholds.medium) return "medium";
  return "low";
}

function splitByWindow(features: ExtractedFeature[], windowDays: number): {
  baseline: ExtractedFeature[];
  recent: ExtractedFeature[];
} {
  const cutoff = new Date(Date.now() - windowDays * 24 * 3600 * 1000);
  const recent = features.filter(f => f.openedAt >= cutoff);
  const baseline = features.filter(f => f.openedAt < cutoff);
  return { baseline, recent };
}

// ─── 1. Win Rate Drift ────────────────────────────────────────────────────────

function detectWinRateDrift(features: ExtractedFeature[]): DriftEvent[] {
  const events: DriftEvent[] = [];

  for (const windowDays of [7, 30, 90]) {
    const { baseline, recent } = splitByWindow(features, windowDays);
    if (recent.length < 5 || baseline.length < 5) continue;

    const baselineWR = baseline.filter(f => f.outcome === "win").length / baseline.length;
    const recentWR = recent.filter(f => f.outcome === "win").length / recent.length;
    const delta = recentWR - baselineWR;

    if (delta >= 0) continue; // Only flag declines

    const p1 = baselineWR;
    const p2 = recentWR;
    const n1 = baseline.length;
    const n2 = recent.length;
    const pooled = (p1 * n1 + p2 * n2) / (n1 + n2);
    const se = Math.sqrt(pooled * (1 - pooled) * (1 / n1 + 1 / n2));
    const z = se > 0 ? (p2 - p1) / se : 0;
    const p = pValue(z);
    const isSignificant = p < 0.05 && recent.length >= 10;

    const severity = classifySeverity(delta, THRESHOLDS.winRate);

    events.push({
      driftId: randomUUID(),
      driftType: "win_rate",
      severity,
      affectedEntity: "system",
      affectedWindow: `${windowDays}d`,
      baselineValue: baselineWR,
      currentValue: recentWR,
      deltaAbsolute: delta,
      deltaPct: baselineWR > 0 ? (delta / baselineWR) * 100 : 0,
      threshold: THRESHOLDS.winRate.medium,
      zScore: z,
      pValue: p,
      isSignificant,
      description: `Win rate declined ${Math.abs(delta * 100).toFixed(1)}pp over last ${windowDays} days (${(recentWR * 100).toFixed(1)}% vs baseline ${(baselineWR * 100).toFixed(1)}%)`,
      recommendation: `Monitor closely. ${isSignificant ? "Statistically significant decline detected." : "Not yet statistically significant."} Do not modify strategy — observe for another ${windowDays} days.`,
    });
  }

  return events;
}

// ─── 2. Regime Drift ──────────────────────────────────────────────────────────

function detectRegimeDrift(features: ExtractedFeature[]): DriftEvent[] {
  const events: DriftEvent[] = [];
  const { baseline, recent } = splitByWindow(features, 30);

  if (recent.length < 5 || baseline.length < 5) return events;

  const regimes = ["trending", "ranging", "volatile", "low_volatility"] as const;

  for (const regime of regimes) {
    const baselinePct = baseline.filter(f => f.marketRegime === regime).length / baseline.length;
    const recentPct = recent.filter(f => f.marketRegime === regime).length / recent.length;
    const delta = Math.abs(recentPct - baselinePct);

    if (delta < 0.15) continue; // Less than 15pp shift — not significant

    events.push({
      driftId: randomUUID(),
      driftType: "regime",
      severity: delta >= 0.30 ? "high" : "medium",
      affectedEntity: regime,
      affectedWindow: "30d",
      baselineValue: baselinePct,
      currentValue: recentPct,
      deltaAbsolute: delta,
      deltaPct: baselinePct > 0 ? (delta / baselinePct) * 100 : 100,
      threshold: 0.15,
      zScore: 0,
      pValue: 1,
      isSignificant: delta >= 0.25,
      description: `Market regime "${regime}" frequency shifted ${(delta * 100).toFixed(0)}pp over 30 days (${(recentPct * 100).toFixed(0)}% vs ${(baselinePct * 100).toFixed(0)}% baseline)`,
      recommendation: `Market conditions are changing. Confidence in ${regime}-trained conclusions should be reduced. Continue observing.`,
    });
  }

  return events;
}

// ─── 3. Pattern Degradation ───────────────────────────────────────────────────

function detectPatternDegradation(features: ExtractedFeature[]): DriftEvent[] {
  const events: DriftEvent[] = [];
  const { baseline, recent } = splitByWindow(features, 30);

  if (recent.length < 5 || baseline.length < 5) return events;

  // Group by pair + session as "patterns"
  const pairs = [...new Set(features.map(f => f.pair))];
  const sessions = [...new Set(features.map(f => f.session))];

  for (const pair of pairs) {
    for (const session of sessions) {
      const bSlice = baseline.filter(f => f.pair === pair && f.session === session);
      const rSlice = recent.filter(f => f.pair === pair && f.session === session);

      if (bSlice.length < 3 || rSlice.length < 3) continue;

      const bWR = bSlice.filter(f => f.outcome === "win").length / bSlice.length;
      const rWR = rSlice.filter(f => f.outcome === "win").length / rSlice.length;
      const delta = rWR - bWR;

      if (delta > -0.15) continue; // Only flag declines ≥ 15pp

      events.push({
        driftId: randomUUID(),
        driftType: "pattern",
        severity: Math.abs(delta) >= 0.25 ? "high" : "medium",
        affectedEntity: `${pair}::${session}`,
        affectedWindow: "30d",
        baselineValue: bWR,
        currentValue: rWR,
        deltaAbsolute: delta,
        deltaPct: bWR > 0 ? (delta / bWR) * 100 : 0,
        threshold: 0.15,
        zScore: 0,
        pValue: 1,
        isSignificant: Math.abs(delta) >= 0.20,
        description: `Pattern ${pair}/${session} win rate declined ${Math.abs(delta * 100).toFixed(1)}pp over 30 days`,
        recommendation: `Reduce confidence weight for ${pair}/${session} pattern. Extend observation before any strategy adjustment.`,
      });
    }
  }

  return events;
}

// ─── 4. Confidence Deterioration ─────────────────────────────────────────────

function detectConfidenceDrift(features: ExtractedFeature[]): DriftEvent[] {
  const events: DriftEvent[] = [];
  const { baseline, recent } = splitByWindow(features, 30);

  if (recent.length < 5 || baseline.length < 5) return events;

  const bConf = meanVal(baseline.map(f => f.confidence));
  const rConf = meanVal(recent.map(f => f.confidence));
  const delta = rConf - bConf;

  if (delta >= 0) return events;

  const severity = classifySeverity(Math.abs(delta), THRESHOLDS.confidence);
  const sd = stdDev([...baseline.map(f => f.confidence), ...recent.map(f => f.confidence)]);
  const n = baseline.length + recent.length;
  const z = sd > 0 ? delta / (sd / Math.sqrt(n)) : 0;
  const p = pValue(z);

  events.push({
    driftId: randomUUID(),
    driftType: "confidence",
    severity,
    affectedEntity: "system",
    affectedWindow: "30d",
    baselineValue: bConf,
    currentValue: rConf,
    deltaAbsolute: delta,
    deltaPct: bConf > 0 ? (delta / bConf) * 100 : 0,
    threshold: THRESHOLDS.confidence.medium,
    zScore: z,
    pValue: p,
    isSignificant: p < 0.05,
    description: `System confidence declined ${Math.abs(delta).toFixed(1)} points over 30 days (${rConf.toFixed(1)} vs ${bConf.toFixed(1)} baseline)`,
    recommendation: "Confidence is deteriorating. Run a fresh validation cycle and review data quality.",
  });

  return events;
}

// ─── 5. Volatility Shift ──────────────────────────────────────────────────────

function detectVolatilityShift(features: ExtractedFeature[]): DriftEvent[] {
  const events: DriftEvent[] = [];
  const { baseline, recent } = splitByWindow(features, 30);

  if (recent.length < 5 || baseline.length < 5) return events;

  const bSpreads = baseline.map(f => f.spreadPips);
  const rSpreads = recent.map(f => f.spreadPips);
  const bMean = meanVal(bSpreads);
  const rMean = meanVal(rSpreads);
  const delta = (rMean - bMean) / Math.max(bMean, 0.01);

  if (Math.abs(delta) < THRESHOLDS.volatility.low) return events;

  events.push({
    driftId: randomUUID(),
    driftType: "volatility",
    severity: classifySeverity(Math.abs(delta), THRESHOLDS.volatility),
    affectedEntity: "system",
    affectedWindow: "30d",
    baselineValue: bMean,
    currentValue: rMean,
    deltaAbsolute: rMean - bMean,
    deltaPct: delta * 100,
    threshold: THRESHOLDS.volatility.low,
    zScore: 0,
    pValue: 1,
    isSignificant: Math.abs(delta) >= THRESHOLDS.volatility.medium,
    description: `Average spread shifted ${(delta * 100).toFixed(0)}% over 30 days (${rMean.toFixed(2)} vs ${bMean.toFixed(2)} pips baseline)`,
    recommendation: "Market volatility has changed. Spread-sensitive conclusions may need re-evaluation.",
  });

  return events;
}

// ─── 6. Correlation Change ────────────────────────────────────────────────────

function detectCorrelationChange(features: ExtractedFeature[]): DriftEvent[] {
  const events: DriftEvent[] = [];
  const { baseline, recent } = splitByWindow(features, 30);

  if (recent.length < 10 || baseline.length < 10) return events;

  // Measure correlation between TQI and outcome (win=1, loss=0) in each period
  function correlation(slice: ExtractedFeature[]): number {
    const xs = slice.map(f => f.tqi);
    const ys = slice.map(f => (f.outcome === "win" ? 1 : 0));
    const mx = meanVal(xs);
    const my = meanVal(ys);
    const num = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0);
    const den = Math.sqrt(xs.reduce((s, x) => s + Math.pow(x - mx, 2), 0)) *
                Math.sqrt(ys.reduce((s, y) => s + Math.pow(y - my, 2), 0));
    return den > 0 ? num / den : 0;
  }

  const bCorr = correlation(baseline);
  const rCorr = correlation(recent);
  const delta = Math.abs(rCorr - bCorr);

  if (delta < 0.15) return events;

  events.push({
    driftId: randomUUID(),
    driftType: "correlation",
    severity: delta >= 0.35 ? "high" : "medium",
    affectedEntity: "tqi_outcome",
    affectedWindow: "30d",
    baselineValue: bCorr,
    currentValue: rCorr,
    deltaAbsolute: rCorr - bCorr,
    deltaPct: Math.abs(bCorr) > 0.01 ? ((rCorr - bCorr) / Math.abs(bCorr)) * 100 : 100,
    threshold: 0.15,
    zScore: 0,
    pValue: 1,
    isSignificant: delta >= 0.25,
    description: `TQI→outcome correlation changed from ${bCorr.toFixed(2)} to ${rCorr.toFixed(2)} (Δ${delta.toFixed(2)}) over 30 days`,
    recommendation: "TQI predictive power has shifted. Review TQI scoring weights and continue observing.",
  });

  return events;
}

// ─── Main Drift Detector ──────────────────────────────────────────────────────

export function runDriftDetection(features: ExtractedFeature[]): DriftReport {
  const events: DriftEvent[] = [
    ...detectWinRateDrift(features),
    ...detectRegimeDrift(features),
    ...detectPatternDegradation(features),
    ...detectConfidenceDrift(features),
    ...detectVolatilityShift(features),
    ...detectCorrelationChange(features),
  ];

  // Deduplicate by type+entity+window (keep highest severity)
  const seen = new Map<string, DriftEvent>();
  for (const e of events) {
    const key = `${e.driftType}::${e.affectedEntity}::${e.affectedWindow}`;
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, e);
    } else {
      const severityOrder = { low: 0, medium: 1, high: 2, critical: 3 };
      if (severityOrder[e.severity] > severityOrder[existing.severity]) {
        seen.set(key, e);
      }
    }
  }

  const deduped = [...seen.values()];
  const criticalCount = deduped.filter(e => e.severity === "critical").length;
  const highCount = deduped.filter(e => e.severity === "high").length;
  const mediumCount = deduped.filter(e => e.severity === "medium").length;
  const lowCount = deduped.filter(e => e.severity === "low").length;

  let overallDriftSeverity: DriftSeverity | "none";
  if (deduped.length === 0) overallDriftSeverity = "none";
  else if (criticalCount > 0) overallDriftSeverity = "critical";
  else if (highCount > 0) overallDriftSeverity = "high";
  else if (mediumCount > 0) overallDriftSeverity = "medium";
  else overallDriftSeverity = "low";

  const summary = deduped.length === 0
    ? "No drift detected. Learning conclusions appear stable."
    : `${deduped.length} drift event(s) detected: ${criticalCount} critical, ${highCount} high, ${mediumCount} medium, ${lowCount} low. Advisory alerts generated — no strategy changes applied.`;

  return {
    runId: randomUUID(),
    detectedAt: new Date(),
    totalEventsDetected: deduped.length,
    criticalCount,
    highCount,
    mediumCount,
    lowCount,
    events: deduped,
    summary,
    overallDriftSeverity,
  };
}
