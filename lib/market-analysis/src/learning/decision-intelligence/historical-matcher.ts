// ─── Historical Matcher ────────────────────────────────────────────────────────
// Finds the most similar historical experiences for a given setup.
// Uses normalized feature vectors with weighted cosine similarity.
// Architecture designed for future vector-embedding upgrade — vectors stored now.
// Advisory only — no trade execution.

import type { ExtractedFeature } from "../learning-core/types.js";
import { clamp } from "../learning-validation/data-validator.js";
import type { CurrentSetup, SimilarExperience } from "./types.js";
import { MAX_SIMILAR_EXPERIENCES, SIMILARITY_THRESHOLD } from "./types.js";

// ─── Feature vector extraction ────────────────────────────────────────────────
// 12-dimensional normalized vector per trade.
// All dimensions: 0–1 (1 = highest quality / most favorable).
// Designed to be upgraded to embedding-based similarity in future.

export const VECTOR_DIMENSIONS = [
  "supplyQuality",
  "demandQuality",
  "liquidityScore",
  "amdScore",
  "confirmationQuality",
  "setupScore",
  "tqi",
  "rrPlanned",
  "spreadPips",     // inverted: low spread = high value
  "sessionLondon",  // 1 if london, else 0
  "regimeTrending", // 1 if trending, else 0
  "volatilityLow",  // 1 if low volatility, else 0
] as const;

export function buildFeatureVector(
  supplyQuality: number,
  demandQuality: number,
  liquidityScore: number,
  amdScore: number,
  confirmationQuality: number,
  setupScore: number,
  tqi: number,
  rrPlanned: number,
  spreadPips: number,
  session: string,
  regime: string,
  volatility: string,
): number[] {
  return [
    clamp(supplyQuality / 100, 0, 1),
    clamp(demandQuality / 100, 0, 1),
    clamp(liquidityScore / 100, 0, 1),
    clamp(amdScore / 100, 0, 1),
    clamp(confirmationQuality / 100, 0, 1),
    clamp(setupScore / 100, 0, 1),
    clamp(tqi / 100, 0, 1),
    clamp((rrPlanned - 0.5) / 4.5, 0, 1),       // normalise RR from ~0.5–5 range
    clamp(1 - spreadPips / 5, 0, 1),             // inverted: low spread = 1
    session === "london" ? 1 : session === "new_york" ? 0.7 : 0.3,
    regime === "trending" ? 1 : regime === "ranging" ? 0.5 : 0.2,
    volatility === "low" ? 1 : volatility === "medium" ? 0.5 : 0,
  ];
}

export function buildVectorFromSetup(setup: CurrentSetup): number[] {
  return buildFeatureVector(
    setup.supplyQuality,
    setup.demandQuality,
    setup.liquidityScore,
    setup.amdScore,
    setup.confirmationQuality,
    setup.setupScore,
    setup.tqi,
    setup.rrPlanned,
    setup.spreadPips,
    setup.session,
    setup.regime,
    setup.volatility,
  );
}

export function buildVectorFromExtracted(f: ExtractedFeature): number[] {
  return buildFeatureVector(
    f.supplyQuality,
    f.demandQuality,
    f.liquidityScore,
    f.amdScore,
    f.confirmationQuality,
    f.setupScore,
    f.tqi,
    f.rrPlanned,
    f.spreadPips,
    f.session,
    f.marketRegime,
    f.volatility,
  );
}

// ─── Cosine similarity ────────────────────────────────────────────────────────

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot  += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const mag = Math.sqrt(magA) * Math.sqrt(magB);
  return mag === 0 ? 0 : clamp(dot / mag, 0, 1);
}

// ─── Similarity reason builder ────────────────────────────────────────────────

function buildSimilarityReason(setup: CurrentSetup, f: ExtractedFeature, score: number): string {
  const reasons: string[] = [];

  if (Math.abs(setup.demandQuality - f.demandQuality) < 15 && setup.demandQuality > 50) {
    reasons.push(`similar demand quality (${f.demandQuality.toFixed(0)})`);
  }
  if (Math.abs(setup.supplyQuality - f.supplyQuality) < 15 && setup.supplyQuality > 50) {
    reasons.push(`similar supply quality (${f.supplyQuality.toFixed(0)})`);
  }
  if (setup.session === f.session) reasons.push(`same session (${f.session})`);
  if (setup.regime === f.marketRegime) reasons.push(`same regime (${f.marketRegime})`);
  if (Math.abs(setup.amdScore - f.amdScore) < 15) reasons.push(`similar AMD score`);
  if (Math.abs(setup.liquidityScore - f.liquidityScore) < 15) reasons.push(`similar liquidity`);
  if (setup.volatility === f.volatility) reasons.push(`same volatility (${f.volatility})`);

  if (reasons.length === 0) reasons.push(`general feature similarity (${(score * 100).toFixed(0)}%)`);
  return `Similar: ${reasons.slice(0, 3).join(", ")}`;
}

// ─── Historical matcher ───────────────────────────────────────────────────────

export interface MatchResult {
  similarWins: SimilarExperience[];
  similarLosses: SimilarExperience[];
  evidenceCount: number;
  historicalWinRate: number;
  statisticalExpectancy: number;
}

export function findSimilarExperiences(
  setup: CurrentSetup,
  historicalFeatures: ExtractedFeature[],
): MatchResult {
  if (historicalFeatures.length === 0) {
    return {
      similarWins: [],
      similarLosses: [],
      evidenceCount: 0,
      historicalWinRate: 0,
      statisticalExpectancy: 0,
    };
  }

  const setupVector = buildVectorFromSetup(setup);

  // Compute similarity for every historical trade
  const scored = historicalFeatures.map(f => {
    const fVec = buildVectorFromExtracted(f);
    const sim  = cosineSimilarity(setupVector, fVec);
    return { f, sim, vec: fVec };
  });

  // Filter to similar trades above threshold
  const similar = scored
    .filter(s => s.sim >= SIMILARITY_THRESHOLD)
    .sort((a, b) => b.sim - a.sim);

  const wins   = similar.filter(s => s.f.outcome === "win");
  const losses = similar.filter(s => s.f.outcome === "loss");

  const topWins   = wins.slice(0, MAX_SIMILAR_EXPERIENCES);
  const topLosses = losses.slice(0, MAX_SIMILAR_EXPERIENCES);

  const toExperience = ({ f, sim, vec }: typeof similar[0]): SimilarExperience => ({
    tradeId: f.tradeId,
    similarityScore: sim,
    isWin: f.outcome === "win",
    outcome: f.outcome,
    historicalRR: f.rrActual,
    historicalPnl: f.pnl,
    historicalConf: f.confidence,
    pair: f.pair,
    session: f.session,
    regime: f.marketRegime,
    similarityReason: buildSimilarityReason(setup, f, sim),
    featureVector: vec,
  });

  // Stats across all similar trades
  const n = similar.length;
  const nWins = wins.length;
  const historicalWinRate = n > 0 ? nWins / n : 0;

  // Expectancy = avg(win_pnl) × winRate − avg(loss_pnl) × lossRate
  const avgWinPnl  = wins.length   > 0 ? wins.reduce((s, { f }) => s + f.pnl, 0)   / wins.length   : 0;
  const avgLossPnl = losses.length > 0 ? losses.reduce((s, { f }) => s + Math.abs(f.pnl), 0) / losses.length : 0;
  const lossRate   = n > 0 ? losses.length / n : 0;
  const statisticalExpectancy = avgWinPnl * historicalWinRate - avgLossPnl * lossRate;

  return {
    similarWins:   topWins.map(toExperience),
    similarLosses: topLosses.map(toExperience),
    evidenceCount: n,
    historicalWinRate,
    statisticalExpectancy,
  };
}
