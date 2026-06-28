// ─── Statistical Analyzer ───────────────────────────────────────────────────
// Computes distributions, Pearson correlations, skipped-setup insights,
// and review insights. Pure functions — no side effects.

import type {
  ExtractedFeature,
  RawSkippedSetup,
  RawManualReview,
  StatisticalAnalysis,
  DistributionStats,
  CorrelationResult,
  SkippedSetupInsight,
  ReviewInsight,
} from "../learning-core/types.js";
import {
  mean,
  median,
  stdDev,
  percentile,
} from "../learning-metrics/metrics-calculator.js";
import { toNumber, safeDivide } from "../learning-validation/data-validator.js";

// ─── Main Entry Point ────────────────────────────────────────────────────────

export function analyzeStatistics(
  features: ExtractedFeature[],
  skipped: RawSkippedSetup[],
  reviews: RawManualReview[],
): StatisticalAnalysis {
  const distributions = computeDistributions(features);
  const correlations = computeCorrelations(features);
  const skippedSetupInsights = analyzeSkippedSetups(skipped);
  const reviewInsights = analyzeReviews(reviews);

  return { distributions, correlations, skippedSetupInsights, reviewInsights };
}

// ─── Distributions ────────────────────────────────────────────────────────────

const NUMERIC_FEATURES: Array<{
  name: string;
  fn: (f: ExtractedFeature) => number;
}> = [
  { name: "setupScore", fn: f => f.setupScore },
  { name: "liquidityScore", fn: f => f.liquidityScore },
  { name: "amdScore", fn: f => f.amdScore },
  { name: "confirmationQuality", fn: f => f.confirmationQuality },
  { name: "confidence", fn: f => f.confidence },
  { name: "tqi", fn: f => f.tqi },
  { name: "rrActual", fn: f => f.rrActual },
  { name: "rrPlanned", fn: f => f.rrPlanned },
  { name: "tradeDurationMins", fn: f => f.tradeDurationMins },
  { name: "spreadPips", fn: f => f.spreadPips },
  { name: "pnl", fn: f => f.pnl },
  { name: "pnlPercent", fn: f => f.pnlPercent },
];

export function computeDistributions(features: ExtractedFeature[]): DistributionStats[] {
  if (features.length === 0) return [];

  return NUMERIC_FEATURES.map(({ name, fn }) => {
    const values = features.map(fn).filter(v => isFinite(v));
    if (values.length === 0) {
      return {
        feature: name,
        count: 0,
        mean: 0, median: 0, stdDev: 0,
        min: 0, max: 0, p25: 0, p75: 0, skewness: 0,
      };
    }
    const mu = mean(values);
    const sd = stdDev(values);
    const sorted = [...values].sort((a, b) => a - b);

    return {
      feature: name,
      count: values.length,
      mean: mu,
      median: median(values),
      stdDev: sd,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      p25: percentile(values, 25),
      p75: percentile(values, 75),
      skewness: computeSkewness(values, mu, sd),
    };
  });
}

// ─── Pearson Correlations ─────────────────────────────────────────────────────
// Correlates each input score against rrActual (outcome proxy).

const CORRELATION_PAIRS: Array<[string, (f: ExtractedFeature) => number, string, (f: ExtractedFeature) => number]> = [
  ["setupScore", f => f.setupScore, "rrActual", f => f.rrActual],
  ["liquidityScore", f => f.liquidityScore, "rrActual", f => f.rrActual],
  ["amdScore", f => f.amdScore, "rrActual", f => f.rrActual],
  ["confirmationQuality", f => f.confirmationQuality, "rrActual", f => f.rrActual],
  ["confidence", f => f.confidence, "rrActual", f => f.rrActual],
  ["tqi", f => f.tqi, "rrActual", f => f.rrActual],
  ["tradeDurationMins", f => f.tradeDurationMins, "rrActual", f => f.rrActual],
  ["spreadPips", f => f.spreadPips, "rrActual", f => f.rrActual],
  ["setupScore", f => f.setupScore, "pnl", f => f.pnl],
  ["confidence", f => f.confidence, "pnl", f => f.pnl],
];

export function computeCorrelations(features: ExtractedFeature[]): CorrelationResult[] {
  if (features.length < 5) return [];

  return CORRELATION_PAIRS.map(([nameA, fnA, nameB, fnB]) => {
    const pairs = features
      .map(f => ({ a: fnA(f), b: fnB(f) }))
      .filter(p => isFinite(p.a) && isFinite(p.b));

    const r = pearson(pairs.map(p => p.a), pairs.map(p => p.b));
    const n = pairs.length;

    return {
      featureA: nameA,
      featureB: nameB,
      pearsonR: r,
      sampleSize: n,
      significant: Math.abs(r) > 0.3 && n >= 10,
    };
  });
}

// ─── Skipped Setup Analysis ───────────────────────────────────────────────────

export function analyzeSkippedSetups(skipped: RawSkippedSetup[]): SkippedSetupInsight {
  if (skipped.length === 0) {
    return {
      totalSkipped: 0,
      byRejectingRule: {},
      byPair: {},
      avgScores: { zone: 0, liquidity: 0, amd: 0, confirmation: 0 },
    };
  }

  const byRejectingRule: Record<string, number> = {};
  const byPair: Record<string, number> = {};
  const zones: number[] = [];
  const liqs: number[] = [];
  const amds: number[] = [];
  const confs: number[] = [];

  for (const s of skipped) {
    const rule = s.rejectingRule || s.rejectionReason || "unknown";
    byRejectingRule[rule] = (byRejectingRule[rule] ?? 0) + 1;
    const pair = (s.pair || "unknown").toUpperCase();
    byPair[pair] = (byPair[pair] ?? 0) + 1;

    const z = toNumber(s.zoneScore); if (z !== null) zones.push(z);
    const l = toNumber(s.liquidityScore); if (l !== null) liqs.push(l);
    const a = toNumber(s.amdScore); if (a !== null) amds.push(a);
    const c = toNumber(s.confirmationScore); if (c !== null) confs.push(c);
  }

  return {
    totalSkipped: skipped.length,
    byRejectingRule,
    byPair,
    avgScores: {
      zone: zones.length ? mean(zones) : 0,
      liquidity: liqs.length ? mean(liqs) : 0,
      amd: amds.length ? mean(amds) : 0,
      confirmation: confs.length ? mean(confs) : 0,
    },
  };
}

// ─── Manual Review Analysis ───────────────────────────────────────────────────

export function analyzeReviews(reviews: RawManualReview[]): ReviewInsight {
  if (reviews.length === 0) {
    return { totalReviewed: 0, avgRating: 0, ruleAdherenceRate: 0 };
  }

  const ratings = reviews.map(r => toNumber(r.rating)).filter((r): r is number => r !== null);
  const avgRating = ratings.length > 0 ? mean(ratings) : 0;

  const withRuleData = reviews.filter(r => r.followedRules !== null && r.followedRules !== undefined);
  const ruleAdherenceRate = withRuleData.length > 0
    ? safeDivide(withRuleData.filter(r => r.followedRules === true).length, withRuleData.length)
    : 0;

  return {
    totalReviewed: reviews.length,
    avgRating,
    ruleAdherenceRate,
  };
}

// ─── Math Helpers ─────────────────────────────────────────────────────────────

export function pearson(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 2 || ys.length < 2) return 0;
  const muX = mean(xs);
  const muY = mean(ys);
  let num = 0, dX = 0, dY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - muX;
    const dy = ys[i] - muY;
    num += dx * dy;
    dX += dx * dx;
    dY += dy * dy;
  }
  const denom = Math.sqrt(dX * dY);
  return denom === 0 ? 0 : num / denom;
}

export function computeSkewness(values: number[], mu: number, sd: number): number {
  if (values.length < 3 || sd === 0) return 0;
  const n = values.length;
  const sum = values.reduce((s, v) => s + ((v - mu) / sd) ** 3, 0);
  return (n / ((n - 1) * (n - 2))) * sum;
}
