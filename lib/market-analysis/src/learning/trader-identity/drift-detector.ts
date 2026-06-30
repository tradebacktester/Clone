// ─── Trader Identity — Drift Detector ────────────────────────────────────────
// Monitors long-term changes in trading behaviour.
// Only emits alerts when supported by statistical evidence.

import { randomUUID } from "crypto";
import { clamp, driftSeverityFromScore } from "./types.js";
import type { IdentityFeature, DriftEvent, DriftReport, DriftType } from "./types.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function winRate(trades: IdentityFeature[]): number {
  if (trades.length === 0) return 0;
  return trades.filter(t => t.outcome === "win").length / trades.length;
}

function avgScore(trades: IdentityFeature[], key: keyof IdentityFeature): number {
  if (trades.length === 0) return 0;
  return trades.reduce((s, t) => s + Number(t[key] ?? 0), 0) / trades.length;
}

function topValue(trades: IdentityFeature[], key: keyof IdentityFeature): string {
  const counts = new Map<string, number>();
  for (const t of trades) {
    const v = String(t[key] ?? "unknown");
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  let best = ""; let bestCount = 0;
  for (const [v, c] of counts) {
    if (c > bestCount) { bestCount = c; best = v; }
  }
  return best;
}

// Cohen's h for proportions — measures effect size between two win rates
function cohensH(p1: number, p2: number): number {
  return Math.abs(2 * Math.asin(Math.sqrt(Math.max(0, Math.min(1, p1)))) -
                  2 * Math.asin(Math.sqrt(Math.max(0, Math.min(1, p2)))));
}

// ─── Dimension checker ────────────────────────────────────────────────────────

interface DimDrift {
  dimension:     string;
  type:          DriftType;
  prevVal:       string;
  currVal:       string;
  changePct:     number;
  effect:        number;    // Cohen's h or normalised delta
  n1:            number;
  n2:            number;
  isSignificant: boolean;
}

function checkContinuous(
  before: IdentityFeature[],
  after:  IdentityFeature[],
  key:    keyof IdentityFeature,
  dimension: string,
  type: DriftType,
  normaliser = 100,
): DimDrift | null {
  if (before.length < 5 || after.length < 5) return null;
  const prev = avgScore(before, key);
  const curr = avgScore(after, key);
  const delta = curr - prev;
  const changePct = prev === 0 ? 0 : (delta / prev) * 100;
  const effect = Math.abs(delta) / normaliser;
  // Significant if > 10% change AND effect > 0.08
  const isSignificant = Math.abs(changePct) > 10 && effect > 0.08;
  if (Math.abs(changePct) < 5) return null;

  return {
    dimension,
    type,
    prevVal:   prev.toFixed(1),
    currVal:   curr.toFixed(1),
    changePct,
    effect,
    n1:        before.length,
    n2:        after.length,
    isSignificant,
  };
}

function checkCategorical(
  before: IdentityFeature[],
  after:  IdentityFeature[],
  key:    keyof IdentityFeature,
  dimension: string,
  type: DriftType,
): DimDrift | null {
  if (before.length < 5 || after.length < 5) return null;
  const prevTop = topValue(before, key);
  const currTop = topValue(after, key);
  if (prevTop === currTop) return null;
  const prevWr = winRate(before);
  const currWr = winRate(after);
  const effect = cohensH(prevWr, currWr);
  const changePct = prevWr === 0 ? 0 : ((currWr - prevWr) / prevWr) * 100;
  return {
    dimension,
    type,
    prevVal:   prevTop,
    currVal:   currTop,
    changePct,
    effect,
    n1:        before.length,
    n2:        after.length,
    isSignificant: effect >= 0.2 && Math.abs(changePct) >= 10,
  };
}

function checkWinRateDrift(
  before: IdentityFeature[],
  after:  IdentityFeature[],
): DimDrift | null {
  if (before.length < 8 || after.length < 8) return null;
  const prevWr = winRate(before);
  const currWr = winRate(after);
  const h = cohensH(prevWr, currWr);
  const changePct = prevWr === 0 ? 0 : ((currWr - prevWr) / prevWr) * 100;
  if (Math.abs(changePct) < 10) return null;
  return {
    dimension:     "Win Rate",
    type:          "consistency_drift",
    prevVal:       `${(prevWr * 100).toFixed(1)}%`,
    currVal:       `${(currWr * 100).toFixed(1)}%`,
    changePct,
    effect:        h,
    n1:            before.length,
    n2:            after.length,
    isSignificant: h >= 0.2,
  };
}

// ─── Main drift detection ─────────────────────────────────────────────────────

export function detectDrift(
  trades: IdentityFeature[],
  profileId: string,
  windowSize = 30,
  minWindow  = 10,
): DriftReport {
  const detectedAt = new Date();

  if (trades.length < minWindow * 2) {
    return {
      hasActiveDrift:    false,
      driftEvents:       [],
      overallDriftScore: 0,
      driftSummary:      `Insufficient trade history for drift analysis (need ${minWindow * 2} trades, have ${trades.length}).`,
      detectedAt,
    };
  }

  // Sort chronologically
  const sorted = [...trades].sort((a, b) => a.openedAt.getTime() - b.openedAt.getTime());
  const mid    = Math.floor(sorted.length / 2);
  const before = sorted.slice(0, mid);
  const after  = sorted.slice(mid);

  const dimChecks: Array<DimDrift | null> = [
    checkWinRateDrift(before, after),
    checkContinuous(before, after, "setupScore",    "Setup Score",         "consistency_drift", 100),
    checkContinuous(before, after, "tqi",           "TQI",                  "consistency_drift", 100),
    checkContinuous(before, after, "rrActual",      "Average R:R",          "learning_drift",    5),
    checkContinuous(before, after, "liquidityScore","Liquidity Score",      "consistency_drift", 100),
    checkCategorical(before, after, "pair",         "Preferred Pair",       "preference_drift"),
    checkCategorical(before, after, "session",      "Preferred Session",    "preference_drift"),
    checkCategorical(before, after, "marketRegime", "Preferred Regime",     "market_adaptation"),
    checkCategorical(before, after, "volatility",   "Preferred Volatility", "preference_drift"),
    checkCategorical(before, after, "trend",        "Preferred Trend",      "market_adaptation"),
  ];

  const driftEvents: DriftEvent[] = dimChecks
    .filter((d): d is DimDrift => d !== null && Math.abs(d.changePct) >= 5)
    .map(d => {
      const driftScore = clamp(Math.abs(d.changePct) * 0.6 + d.effect * 40);
      return {
        eventId:       randomUUID(),
        driftType:     d.type,
        driftSeverity: driftSeverityFromScore(driftScore),
        driftScore:    clamp(driftScore),
        dimension:     d.dimension,
        previousValue: d.prevVal,
        currentValue:  d.currVal,
        changePercent: d.changePct,
        sampleSizeBefore: d.n1,
        sampleSizeAfter:  d.n2,
        isStatisticallySignificant: d.isSignificant,
        description: `${d.dimension} shifted from "${d.prevVal}" to "${d.currVal}" (${d.changePct > 0 ? "+" : ""}${d.changePct.toFixed(1)}% change over ${sorted.length} trades).`,
      };
    });

  const significantEvents = driftEvents.filter(e => e.isStatisticallySignificant);
  const hasActiveDrift    = significantEvents.length > 0;

  const overallDriftScore = driftEvents.length === 0
    ? 0
    : clamp(driftEvents.reduce((s, e) => s + e.driftScore, 0) / driftEvents.length);

  let driftSummary: string;
  if (!hasActiveDrift) {
    driftSummary = "No statistically significant drift detected. Trading behaviour is stable.";
  } else if (significantEvents.length === 1) {
    driftSummary = `1 statistically significant drift event detected: ${significantEvents[0]!.dimension}. Monitor for continuation.`;
  } else {
    const dims = significantEvents.map(e => e.dimension).join(", ");
    driftSummary = `${significantEvents.length} significant drift events detected across: ${dims}. Trading behaviour may be evolving.`;
  }

  return { hasActiveDrift, driftEvents, overallDriftScore, driftSummary, detectedAt };
}
