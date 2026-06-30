// ─── Trader Identity — Preference Analyzer (Stage 2) ─────────────────────────
// Discovers statistically significant trading preferences from historical data.
// Only adopts preferences supported by MIN_PREFERENCE_SAMPLE and confidence.
// Observational only — never treats preferences as execution rules.

import {
  MIN_PREFERENCE_SAMPLE,
  MIN_PREFERENCE_CONFIDENCE,
  PREFERENCE_LIFT_THRESHOLD,
  clamp,
} from "./types.js";
import type {
  IdentityFeature,
  PreferenceGroup,
  AdaptiveIdentityResult,
  PreferenceType,
} from "./types.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function winRate(trades: IdentityFeature[]): number {
  if (trades.length === 0) return 0;
  return trades.filter(t => t.outcome === "win").length / trades.length;
}

function avgRr(trades: IdentityFeature[]): number {
  if (trades.length === 0) return 0;
  return trades.reduce((s, t) => s + t.rrActual, 0) / trades.length;
}

function profitFactor(trades: IdentityFeature[]): number {
  const wins  = trades.filter(t => t.outcome === "win").reduce((s, t)  => s + Math.max(0, t.pnl), 0);
  const losses= trades.filter(t => t.outcome !== "win").reduce((s, t) => s + Math.abs(Math.min(0, t.pnl)), 0);
  return losses === 0 ? (wins > 0 ? 999 : 1) : wins / losses;
}

// Cohen's h effect size for proportions
function cohensH(p1: number, p2: number): number {
  return 2 * Math.asin(Math.sqrt(p1)) - 2 * Math.asin(Math.sqrt(p2));
}

// Wilson lower bound at 90% confidence (z=1.645)
function wilsonLB(wins: number, n: number): number {
  if (n === 0) return 0;
  const z = 1.645;
  const p = wins / n;
  const denom = 1 + z * z / n;
  return Math.max(0, (p + z * z / (2 * n) - z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))) / denom);
}

// ─── Per-dimension analysis ───────────────────────────────────────────────────

function analyzeGroupDimension(
  all: IdentityFeature[],
  getDim: (t: IdentityFeature) => string,
  type: PreferenceType,
  dimLabel: (v: string) => string,
): PreferenceGroup[] {
  const baseWr  = winRate(all);
  const baseAvgRr = avgRr(all);

  const groups = new Map<string, IdentityFeature[]>();
  for (const t of all) {
    const k = getDim(t);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(t);
  }

  const results: PreferenceGroup[] = [];

  for (const [val, trades] of groups) {
    if (trades.length < MIN_PREFERENCE_SAMPLE) continue;

    const wr = winRate(trades);
    const ar = avgRr(trades);
    const pf = profitFactor(trades);
    const wins = trades.filter(t => t.outcome === "win").length;
    const h  = Math.abs(cohensH(wr, baseWr));
    const lb = wilsonLB(wins, trades.length);

    // Confidence: based on sample size and effect size
    const sampleFactor   = Math.min(trades.length / 40, 1.0);
    const effectFactor   = Math.min(h / 0.3, 1.0);
    const confidence     = clamp((sampleFactor * 0.6 + effectFactor * 0.4) * 100);
    const liftVsBaseline = wr - baseWr;
    const isSignificant  =
      confidence / 100 >= MIN_PREFERENCE_CONFIDENCE &&
      Math.abs(liftVsBaseline) >= PREFERENCE_LIFT_THRESHOLD;

    const effect: PreferenceGroup["effect"] =
      liftVsBaseline >  PREFERENCE_LIFT_THRESHOLD ? "positive" :
      liftVsBaseline < -PREFERENCE_LIFT_THRESHOLD ? "negative" : "neutral";

    const label = dimLabel(val);
    const explanation = isSignificant
      ? `${label}: ${trades.length} trades, ${(wr * 100).toFixed(1)}% win rate (${liftVsBaseline > 0 ? "+" : ""}${(liftVsBaseline * 100).toFixed(1)}pp vs baseline), avg RR ${ar.toFixed(2)} — statistically significant (confidence ${confidence.toFixed(0)}%).`
      : `${label}: ${trades.length} trades, ${(wr * 100).toFixed(1)}% win rate — insufficient evidence for adoption (confidence ${confidence.toFixed(0)}%).`;

    results.push({
      type,
      value:         val,
      label,
      sampleSize:    trades.length,
      winRate:       wr,
      avgRr:         ar,
      profitFactor:  pf,
      confidence:    clamp(confidence),
      effect,
      effectSize:    h,
      baselineWinRate: baseWr,
      liftVsBaseline,
      isSignificant,
      explanation,
    });
  }

  return results.sort((a, b) => b.confidence - a.confidence);
}

// ─── Compute medians ──────────────────────────────────────────────────────────

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[m]! : ((s[m - 1]! + s[m]!) / 2);
}

// ─── Top preference from a group ─────────────────────────────────────────────

function topSignificant(
  groups: PreferenceGroup[],
  effect: "positive" | "negative" | "neutral" = "positive",
): string[] {
  return groups
    .filter(g => g.isSignificant && g.effect === effect)
    .sort((a, b) => b.liftVsBaseline - a.liftVsBaseline)
    .slice(0, 3)
    .map(g => g.value);
}

// ─── Main entry point ─────────────────────────────────────────────────────────

export function analyzeAdaptiveIdentity(
  trades: IdentityFeature[],
): AdaptiveIdentityResult {
  if (trades.length === 0) {
    return {
      stage:               "rule_identity",
      sampleSize:          0,
      confidenceScore:     0,
      preferredPairs:      [],
      preferredSessions:   [],
      preferredRegimes:    [],
      preferredVolatility: null,
      preferredTrend:      null,
      avgSetupScore:       0,
      avgTqi:              0,
      avgRrPlanned:        0,
      avgHoldDuration:     0,
      overallWinRate:      0,
      overallPf:           1,
      overallAvgRr:        0,
      discoveries:         [],
    };
  }

  const stage = trades.length >= 20 ? "adaptive_identity" as const : "rule_identity" as const;
  const n      = trades.length;
  const wr     = winRate(trades);
  const ar     = avgRr(trades);
  const pf     = profitFactor(trades);

  const avgSetupScore  = trades.reduce((s, t) => s + t.setupScore, 0) / n;
  const avgTqi         = trades.reduce((s, t) => s + t.tqi, 0) / n;
  const avgRrPlanned   = trades.reduce((s, t) => s + t.rrPlanned, 0) / n;
  const avgHoldDuration= median(trades.map(t => t.holdDurationMinutes));

  // Confidence grows with sample size (saturates at ~200 trades)
  const confidenceScore = clamp(Math.min(n / 200, 1.0) * 100);

  // Discover preferences across all key dimensions
  const allDiscoveries: PreferenceGroup[] = [];

  const pairDisc = analyzeGroupDimension(
    trades, t => t.pair, "pair", v => v,
  );
  allDiscoveries.push(...pairDisc);

  const sessionDisc = analyzeGroupDimension(
    trades, t => t.session, "session", v => `${v.charAt(0).toUpperCase()}${v.slice(1)} Session`,
  );
  allDiscoveries.push(...sessionDisc);

  const regimeDisc = analyzeGroupDimension(
    trades, t => t.marketRegime, "regime", v => `${v.charAt(0).toUpperCase()}${v.slice(1)} Market`,
  );
  allDiscoveries.push(...regimeDisc);

  const volDisc = analyzeGroupDimension(
    trades, t => t.volatility, "volatility", v => `${v.charAt(0).toUpperCase()}${v.slice(1)} Volatility`,
  );
  allDiscoveries.push(...volDisc);

  const trendDisc = analyzeGroupDimension(
    trades, t => t.trend, "trend", v => `${v.charAt(0).toUpperCase()}${v.slice(1)} Trend`,
  );
  allDiscoveries.push(...trendDisc);

  // Zone quality bucketed analysis
  const zoneDisc = analyzeGroupDimension(
    trades,
    t => t.demandQuality >= 70 || t.supplyQuality >= 70 ? "high_quality" : "standard_quality",
    "zone_quality",
    v => v === "high_quality" ? "High-Quality Zones (≥70)" : "Standard Zones (<70)",
  );
  allDiscoveries.push(...zoneDisc);

  // Hold duration bucketed
  const holdDisc = analyzeGroupDimension(
    trades,
    t => t.holdDurationMinutes <= 60 ? "short" : t.holdDurationMinutes <= 240 ? "medium" : "long",
    "hold_duration",
    v => v === "short" ? "Short Duration (≤1h)" : v === "medium" ? "Medium Duration (1-4h)" : "Long Duration (>4h)",
  );
  allDiscoveries.push(...holdDisc);

  // Preferred categories from significant positive discoveries
  const preferredPairs    = topSignificant(pairDisc);
  const preferredSessions = topSignificant(sessionDisc);
  const preferredRegimes  = topSignificant(regimeDisc);

  const topVol  = volDisc.find(g => g.isSignificant && g.effect === "positive");
  const topTrend= trendDisc.find(g => g.isSignificant && g.effect === "positive");

  return {
    stage,
    sampleSize:          n,
    confidenceScore:     clamp(confidenceScore),
    preferredPairs,
    preferredSessions,
    preferredRegimes,
    preferredVolatility: topVol  ? topVol.value  : null,
    preferredTrend:      topTrend ? topTrend.value : null,
    avgSetupScore:       clamp(avgSetupScore),
    avgTqi:              clamp(avgTqi),
    avgRrPlanned:        Math.max(0, avgRrPlanned),
    avgHoldDuration:     Math.max(0, avgHoldDuration),
    overallWinRate:      wr,
    overallPf:           pf,
    overallAvgRr:        ar,
    discoveries:         allDiscoveries,
  };
}
