// ─── Interaction Analyzer ─────────────────────────────────────────────────────
// Measures whether feature combinations outperform individual factors.
// Advisory only — no trade execution, no strategy modification.

import type { ExtractedFeature } from "../learning-core/types.js";
import { clamp } from "../learning-validation/data-validator.js";
import type {
  InteractionResult,
  FeatureId,
  BucketStats,
} from "./types.js";
import { MIN_INTERACTION_SAMPLE, SYNERGY_THRESHOLD } from "./types.js";

// ─── Pre-defined interactions to evaluate ──────────────────────────────────────

interface InteractionSpec {
  featureA: FeatureId;
  featureB: FeatureId;
  displayName: string;
  description: string;
  /** Filter: returns true when featureA condition is active */
  condA: (f: ExtractedFeature) => boolean;
  /** Filter: returns true when featureB condition is active */
  condB: (f: ExtractedFeature) => boolean;
}

const INTERACTION_SPECS: InteractionSpec[] = [
  {
    featureA: "demand_zone_quality",
    featureB: "session",
    displayName: "Strong Demand + London Session",
    description: "Demand zone quality ≥ 70 combined with London session",
    condA: (f) => f.demandQuality >= 70,
    condB: (f) => f.session === "london",
  },
  {
    featureA: "supply_zone_quality",
    featureB: "market_regime",
    displayName: "Strong Supply + Trending Market",
    description: "Supply zone quality ≥ 70 combined with trending market regime",
    condA: (f) => f.supplyQuality >= 70,
    condB: (f) => f.marketRegime === "trending",
  },
  {
    featureA: "liquidity_sweep_strength",
    featureB: "confirmation_candle_quality",
    displayName: "High Liquidity Sweep + Strong Confirmation",
    description: "Liquidity score ≥ 65 combined with confirmation quality ≥ 65",
    condA: (f) => f.liquidityScore >= 65,
    condB: (f) => f.confirmationQuality >= 65,
  },
  {
    featureA: "premium_discount_position",
    featureB: "volatility",
    displayName: "Premium Zone + High Volatility",
    description: "High TQI score (premium entry) combined with high volatility",
    condA: (f) => f.tqi >= 60,
    condB: (f) => f.volatility === "high",
  },
  {
    featureA: "demand_zone_quality",
    featureB: "spread",
    displayName: "Discount Zone + Low Spread",
    description: "Demand zone quality ≥ 60 (discount opportunity) combined with spread ≤ 1.5 pips",
    condA: (f) => f.demandQuality >= 60,
    condB: (f) => f.spreadPips <= 1.5,
  },
  {
    featureA: "amd_quality",
    featureB: "htf_alignment",
    displayName: "Strong AMD + High HTF Alignment",
    description: "AMD score ≥ 65 combined with setup score ≥ 70 (HTF proxy)",
    condA: (f) => f.amdScore >= 65,
    condB: (f) => f.setupScore >= 70,
  },
  {
    featureA: "market_regime",
    featureB: "session",
    displayName: "Trending Market + London/NY Session",
    description: "Trending regime combined with primary session (London or New York)",
    condA: (f) => f.marketRegime === "trending",
    condB: (f) => f.session === "london" || f.session === "new_york",
  },
  {
    featureA: "risk_reward_ratio",
    featureB: "confirmation_candle_quality",
    displayName: "High RR + Strong Confirmation",
    description: "Planned RR ≥ 2.0 combined with confirmation quality ≥ 65",
    condA: (f) => f.rrPlanned >= 2.0,
    condB: (f) => f.confirmationQuality >= 65,
  },
  {
    featureA: "amd_quality",
    featureB: "session",
    displayName: "Strong AMD + London Session",
    description: "AMD score ≥ 65 combined with London session",
    condA: (f) => f.amdScore >= 65,
    condB: (f) => f.session === "london",
  },
  {
    featureA: "supply_zone_quality",
    featureB: "liquidity_sweep_strength",
    displayName: "Strong Supply + Strong Liquidity Sweep",
    description: "Supply quality ≥ 70 combined with liquidity score ≥ 65",
    condA: (f) => f.supplyQuality >= 70,
    condB: (f) => f.liquidityScore >= 65,
  },
];

// ─── Compute bucket stats for a group ─────────────────────────────────────────

function bucketStats(group: ExtractedFeature[], label: string): BucketStats {
  const n = group.length;
  const wins   = group.filter(f => f.outcome === "win").length;
  const losses = group.filter(f => f.outcome === "loss").length;
  const breakEvens = n - wins - losses;
  const winRate  = n > 0 ? wins / n : 0;
  const lossRate = n > 0 ? losses / n : 0;
  const winT  = group.filter(f => f.outcome === "win");
  const lossT = group.filter(f => f.outcome === "loss");
  const avgRR     = n > 0 ? group.reduce((s, f) => s + f.rrActual, 0) / n : 0;
  const avgProfit = winT.length > 0 ? winT.reduce((s, f) => s + f.pnl, 0) / winT.length : 0;
  const avgLoss   = lossT.length > 0 ? Math.abs(lossT.reduce((s, f) => s + f.pnl, 0) / lossT.length) : 0;
  const totalPnl  = group.reduce((s, f) => s + f.pnl, 0);
  return { label, sampleSize: n, wins, losses, breakEvens, winRate, lossRate, avgRR, avgProfit, avgLoss, totalPnl };
}

// ─── Synergy score: 0–100 ──────────────────────────────────────────────────────
// Measures how much better the combination performs versus individual features.

function computeSynergyScore(
  combinedWinRate: number,
  baselineA: number,
  baselineB: number,
  n: number,
): number {
  const combinedBaseline = (baselineA + baselineB) / 2;
  if (combinedBaseline === 0) return 0;
  const lift = combinedWinRate / combinedBaseline;
  // Lift of 1 = no synergy (50), lift 2 = max synergy (100), lift 0.5 = destructive (0)
  const raw = clamp((lift - 0.5) / 1.5, 0, 1) * 100;
  // Weight by sample size
  const sampleFactor = clamp(n / 20, 0, 1);
  return clamp(raw * sampleFactor, 0, 100);
}

// ─── Statistical significance for interaction ──────────────────────────────────

function interactionSignificance(n: number, interactionWinRate: number, baselineWinRate: number): number {
  if (n < MIN_INTERACTION_SAMPLE) return 0;
  const diff = Math.abs(interactionWinRate - baselineWinRate);
  // Simple effect size × sample factor
  const effectSize = clamp(diff * 2, 0, 1);
  const sampleFactor = clamp(n / 30, 0, 1);
  return clamp(effectSize * sampleFactor, 0, 1);
}

// ─── Main analyzer ────────────────────────────────────────────────────────────

export function analyzeInteractions(features: ExtractedFeature[]): InteractionResult[] {
  const n = features.length;
  if (n === 0) return [];

  const overallWinRate = features.filter(f => f.outcome === "win").length / n;
  const results: InteractionResult[] = [];

  for (const spec of INTERACTION_SPECS) {
    const groupA  = features.filter(spec.condA);
    const groupB  = features.filter(spec.condB);
    const groupAB = features.filter(f => spec.condA(f) && spec.condB(f));

    const baselineA = groupA.length > 0
      ? groupA.filter(f => f.outcome === "win").length / groupA.length
      : overallWinRate;
    const baselineB = groupB.length > 0
      ? groupB.filter(f => f.outcome === "win").length / groupB.length
      : overallWinRate;

    const nAB    = groupAB.length;
    const winsAB = groupAB.filter(f => f.outcome === "win").length;
    const lossesAB = groupAB.filter(f => f.outcome === "loss").length;
    const winRateAB = nAB > 0 ? winsAB / nAB : 0;
    const avgRR  = nAB > 0 ? groupAB.reduce((s, f) => s + f.rrActual, 0) / nAB : 0;
    const winT   = groupAB.filter(f => f.outcome === "win");
    const avgProfit = winT.length > 0 ? winT.reduce((s, f) => s + f.pnl, 0) / winT.length : 0;

    const liftA = baselineA > 0 ? winRateAB / baselineA : 1;
    const liftB = baselineB > 0 ? winRateAB / baselineB : 1;
    const synergyScore = computeSynergyScore(winRateAB, baselineA, baselineB, nAB);
    const isSynergistic = liftA >= SYNERGY_THRESHOLD || liftB >= SYNERGY_THRESHOLD;
    const significance = interactionSignificance(nAB, winRateAB, (baselineA + baselineB) / 2);

    const isInsufficient = nAB < MIN_INTERACTION_SAMPLE;

    // Build breakdown: A only, B only, A+B
    const groupAOnly = features.filter(f => spec.condA(f) && !spec.condB(f));
    const groupBOnly = features.filter(f => !spec.condA(f) && spec.condB(f));
    const breakdown: BucketStats[] = [
      bucketStats(groupAOnly, `${spec.featureA} only`),
      bucketStats(groupBOnly, `${spec.featureB} only`),
      bucketStats(groupAB, "Both conditions"),
    ];

    results.push({
      interactionId: `${spec.featureA}::${spec.featureB}`,
      featureA: spec.featureA,
      featureB: spec.featureB,
      displayName: spec.displayName,
      description: spec.description,
      sampleSize: nAB,
      wins: winsAB,
      losses: lossesAB,
      winRate: winRateAB,
      avgRR,
      avgProfit,
      baselineWinRateA: baselineA,
      baselineWinRateB: baselineB,
      combinedBaseline: (baselineA + baselineB) / 2,
      liftVsFeatureA: clamp(liftA, 0, 5),
      liftVsFeatureB: clamp(liftB, 0, 5),
      synergyScore,
      isSynergistic,
      statisticalSignificance: significance,
      isInsufficient,
      insufficientReason: isInsufficient
        ? `Only ${nAB} trades match both conditions (min: ${MIN_INTERACTION_SAMPLE})`
        : undefined,
      breakdown,
    });
  }

  // Sort by synergy score descending
  return results.sort((a, b) => b.synergyScore - a.synergyScore);
}
