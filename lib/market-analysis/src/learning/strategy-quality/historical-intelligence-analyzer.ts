// ─── Historical Intelligence Analyzer ────────────────────────────────────────
// Cosine similarity search over feature history; computes win rate, RR,
// pattern ranking, feature importance weight, evidence volume scoring.
// Advisory only.

import { clamp } from "../learning-validation/data-validator.js";
import { wilsonLowerBound } from "../learning-confidence/confidence-engine.js";
import type { ExtractedFeature } from "../learning-core/types.js";
import type { QualitySetup, HistoricalIntelligenceResult } from "./types.js";
import {
  MIN_EVIDENCE_FOR_QUALITY,
  HIGH_CONFIDENCE_EVIDENCE,
  QUALITY_SIMILARITY_THRESHOLD,
  MAX_SIMILAR_QUALITY_TRADES,
} from "./types.js";

// ─── Feature vector ───────────────────────────────────────────────────────────
// 8-dimensional: adds market health to the 7D SR vector

function toVec(
  supply: number, demand: number, liquidity: number,
  amd: number, confirm: number, setup: number,
  tqi: number, health: number,
): number[] {
  return [supply, demand, liquidity, amd, confirm, setup, tqi, health];
}

function dot(a: number[], b: number[]): number {
  return a.reduce((s, v, i) => s + v * (b[i] ?? 0), 0);
}
function mag(v: number[]): number {
  return Math.sqrt(v.reduce((s, x) => s + x * x, 0));
}
function cosine(a: number[], b: number[]): number {
  const ma = mag(a), mb = mag(b);
  if (ma === 0 || mb === 0) return 0;
  return clamp(dot(a, b) / (ma * mb), 0, 1);
}

// ─── Sub-score helpers ────────────────────────────────────────────────────────

function winRateToScore(wr: number, n: number): number {
  if (n < MIN_EVIDENCE_FOR_QUALITY) return 0;
  return clamp(wr * 100, 0, 100);
}

function rrToScore(avgRR: number): number {
  return clamp((avgRR / 3.0) * 100, 0, 100);
}

// Pattern rank score: where does this similarity rank across all patterns?
function patternRankScore(avgSimilarity: number, topSimilarity: number): number {
  if (topSimilarity === 0) return 0;
  return clamp((avgSimilarity / topSimilarity) * 100, 0, 100);
}

// Feature importance score: how much do the strongest features align with winning setups?
function featureImportanceScore(
  setup: QualitySetup,
  wins: Array<ExtractedFeature>,
): number {
  if (wins.length === 0) return 50; // neutral
  const avgWinSetup  = wins.reduce((s, f) => s + Number(f.setupScore ?? 0), 0) / wins.length;
  const avgWinTqi    = wins.reduce((s, f) => s + Number(f.tqi ?? 0), 0) / wins.length;
  const avgWinAmd    = wins.reduce((s, f) => s + Number(f.amdScore ?? 0), 0) / wins.length;
  // How well does our setup match winning setups on key features?
  const setupMatch   = 100 - Math.abs(setup.setupScore - avgWinSetup);
  const tqiMatch     = 100 - Math.abs(setup.tqi - avgWinTqi);
  const amdMatch     = 100 - Math.abs(setup.amdScore - avgWinAmd);
  return clamp((setupMatch + tqiMatch + amdMatch) / 3, 0, 100);
}

function evidenceVolumeScore(n: number): number {
  return clamp((n / HIGH_CONFIDENCE_EVIDENCE) * 100, 0, 100);
}

// ─── Main analyzer ────────────────────────────────────────────────────────────

export function analyzeHistoricalIntelligence(
  setup: QualitySetup,
  features: ExtractedFeature[],
): HistoricalIntelligenceResult {
  const healthVal = setup.marketHealthScore ?? 50;
  const queryVec  = toVec(
    setup.supplyQuality, setup.demandQuality, setup.liquidityScore,
    setup.amdScore, setup.confirmationQuality, setup.setupScore,
    setup.tqi, healthVal,
  );

  const scored = features
    .filter(f => f.pair === setup.pair || f.session === setup.session)
    .map(f => ({
      f,
      sim: cosine(queryVec, toVec(
        Number(f.supplyQuality ?? 0),
        Number(f.demandQuality ?? 0),
        Number(f.liquidityScore ?? 0),
        Number(f.amdScore ?? 0),
        Number(f.confirmationQuality ?? 0),
        Number(f.setupScore ?? 0),
        Number(f.tqi ?? 0),
        healthVal,
      )),
    }))
    .filter(s => s.sim >= QUALITY_SIMILARITY_THRESHOLD)
    .sort((a, b) => b.sim - a.sim)
    .slice(0, MAX_SIMILAR_QUALITY_TRADES);

  const n       = scored.length;
  const winFs   = scored.filter(s => s.f.outcome === "win").map(s => s.f);
  const wins    = winFs.length;
  const losses  = n - wins;
  const winRate = n > 0 ? wins / n : 0;

  const winRRs  = winFs.map(f => Number(f.rrActual ?? 0));
  const lossRRs = scored.filter(s => s.f.outcome !== "win").map(s => Math.abs(Number(s.f.rrActual ?? 0)));
  const avgWinRR  = winRRs.length  > 0 ? winRRs.reduce((a, b) => a + b, 0)  / winRRs.length  : 0;
  const avgLossRR = lossRRs.length > 0 ? lossRRs.reduce((a, b) => a + b, 0) / lossRRs.length : 1;
  const pf = losses > 0 ? (wins * avgWinRR) / (losses * avgLossRR) : wins > 0 ? 99 : 0;
  const avgSim    = n > 0 ? scored.reduce((s, x) => s + x.sim, 0) / n : 0;
  const topSim    = scored.length > 0 ? scored[0]!.sim : 0;
  const wilson    = n >= 3 ? wilsonLowerBound(wins, n) : 0;

  // Sub-scores
  const simScore     = clamp(avgSim * 100, 0, 100);
  const wrScore      = winRateToScore(winRate, n);
  const rrScore      = rrToScore(avgWinRR);
  const rankScore    = patternRankScore(avgSim, topSim);
  const fiScore      = featureImportanceScore(setup, winFs);
  const volScore     = evidenceVolumeScore(n);

  // Historical intelligence composite (0–100)
  let historicalIntelligenceScore = 0;
  if (n >= MIN_EVIDENCE_FOR_QUALITY) {
    historicalIntelligenceScore = clamp(
      wrScore   * 0.30 +
      rrScore   * 0.20 +
      simScore  * 0.20 +
      rankScore * 0.10 +
      fiScore   * 0.10 +
      volScore  * 0.10,
      0, 100,
    );
  } else {
    // Insufficient evidence — partial score proportional to evidence
    historicalIntelligenceScore = clamp((n / MIN_EVIDENCE_FOR_QUALITY) * 35, 0, 35);
  }

  const reliability =
    n < MIN_EVIDENCE_FOR_QUALITY ? "insufficient" :
    n < 10                        ? "low"          :
    n < HIGH_CONFIDENCE_EVIDENCE  ? "moderate"     : "high";

  const explanations: string[] = [
    `Historical Intelligence Score: ${historicalIntelligenceScore.toFixed(1)}/100`,
    `${n} similar trades — ${wins}W / ${losses}L — Win rate: ${(winRate * 100).toFixed(1)}%`,
    `Avg RR: ${avgWinRR.toFixed(2)} | Profit Factor: ${pf.toFixed(2)} | Wilson LB: ${(wilson * 100).toFixed(1)}%`,
    `Similarity: ${(avgSim * 100).toFixed(1)}% | Evidence reliability: ${reliability}`,
  ];
  if (n < MIN_EVIDENCE_FOR_QUALITY) {
    explanations.push(`⚠ Insufficient evidence (${n}/${MIN_EVIDENCE_FOR_QUALITY}) — historical score indicative only.`);
  }
  if (winRate >= 0.65 && n >= MIN_EVIDENCE_FOR_QUALITY) {
    explanations.push("Statistically strong historical performance for this setup type.");
  }

  return {
    similarityScore:          simScore,
    winRateScore:             wrScore,
    rrScore,
    patternRankScore:         rankScore,
    featureImportanceScore:   fiScore,
    evidenceVolumeScore:      volScore,
    historicalIntelligenceScore,
    evidenceCount:            n,
    winRate,
    averageRR:                avgWinRR,
    wilsonLowerBound:         wilson,
    sampleReliability:        reliability,
    explanations,
  };
}
