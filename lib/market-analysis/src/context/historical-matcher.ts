import type { HistoricalMatch, SnapshotRecord, OutcomeLabel } from "./types.js";

interface MatchWeights {
  regime: number;
  trendDirection: number;
  volatilityClassification: number;
  session: number;
  liquidityQuality: number;
  newsEnvironment: number;
  trendStrength: number;
  volatilityPercentile: number;
}

const DEFAULT_WEIGHTS: MatchWeights = {
  regime: 0.28,
  trendDirection: 0.22,
  volatilityClassification: 0.18,
  session: 0.14,
  liquidityQuality: 0.08,
  newsEnvironment: 0.06,
  trendStrength: 0.02,
  volatilityPercentile: 0.02,
};

function categoricalSim(a: string, b: string): number {
  return a === b ? 1 : 0;
}

function numericSim(a: number, b: number, range: number): number {
  return Math.max(0, 1 - Math.abs(a - b) / range);
}

export interface CurrentFeatures {
  regime: string;
  trendDirection: string;
  trendStrength: number;
  volatilityClassification: string;
  volatilityPercentile: number;
  session: string;
  liquidityQuality: string;
  newsEnvironment: string;
}

function computeSimilarity(current: CurrentFeatures, snapshot: SnapshotRecord, w = DEFAULT_WEIGHTS): number {
  const regimeSim = categoricalSim(current.regime, snapshot.regime) * w.regime;
  const trendDirSim = categoricalSim(current.trendDirection, snapshot.trendDirection) * w.trendDirection;
  const volClassSim = categoricalSim(current.volatilityClassification, snapshot.volatilityClassification) * w.volatilityClassification;
  const sessionSim = categoricalSim(current.session, snapshot.session) * w.session;
  const liqSim = categoricalSim(current.liquidityQuality, snapshot.liquidityQuality) * w.liquidityQuality;
  const newsSim = categoricalSim(current.newsEnvironment, snapshot.newsEnvironment) * w.newsEnvironment;
  const trendStrSim = numericSim(current.trendStrength, snapshot.trendStrength, 100) * w.trendStrength;
  const volPctSim = numericSim(current.volatilityPercentile, snapshot.volatilityPercentile, 100) * w.volatilityPercentile;

  const raw = regimeSim + trendDirSim + volClassSim + sessionSim + liqSim + newsSim + trendStrSim + volPctSim;
  return Math.round(raw * 100);
}

function inferOutcome(snapshot: SnapshotRecord): OutcomeLabel {
  if (snapshot.confidenceScore >= 70) return "profitable";
  if (snapshot.confidenceScore <= 30) return "losing";
  if (snapshot.confidenceScore >= 50) return "neutral";
  return "unknown";
}

export function findHistoricalMatches(
  current: CurrentFeatures,
  snapshots: SnapshotRecord[],
  topN = 10,
  minSimilarity = 40,
): HistoricalMatch[] {
  if (snapshots.length === 0) return [];

  const scored = snapshots.map(snap => ({
    snap,
    similarity: computeSimilarity(current, snap),
  }));

  scored.sort((a, b) => b.similarity - a.similarity);

  return scored
    .filter(s => s.similarity >= minSimilarity)
    .slice(0, topN)
    .map(({ snap, similarity }) => ({
      id: snap.id,
      date: snap.createdAt?.toISOString().slice(0, 10) ?? "unknown",
      pair: snap.pair,
      regime: snap.regime,
      trendDirection: snap.trendDirection,
      volatilityClassification: snap.volatilityClassification,
      session: snap.session,
      similarityScore: similarity,
      outcome: inferOutcome(snap),
      confidence: snap.confidenceScore,
    }));
}

export function computeSimilarityScore(current: CurrentFeatures, snapshot: SnapshotRecord): number {
  return computeSimilarity(current, snapshot);
}

export function aggregateMatchOutcomes(matches: HistoricalMatch[]): {
  avgSimilarity: number;
  dominantOutcome: OutcomeLabel;
  profitableCount: number;
  losingCount: number;
  neutralCount: number;
} {
  if (matches.length === 0) {
    return { avgSimilarity: 0, dominantOutcome: "unknown", profitableCount: 0, losingCount: 0, neutralCount: 0 };
  }
  const profitable = matches.filter(m => m.outcome === "profitable").length;
  const losing = matches.filter(m => m.outcome === "losing").length;
  const neutral = matches.filter(m => m.outcome === "neutral" || m.outcome === "unknown").length;
  const avgSimilarity = Math.round(matches.reduce((s, m) => s + m.similarityScore, 0) / matches.length);

  let dominantOutcome: OutcomeLabel = "neutral";
  if (profitable > losing && profitable > neutral) dominantOutcome = "profitable";
  else if (losing > profitable && losing > neutral) dominantOutcome = "losing";

  return { avgSimilarity, dominantOutcome, profitableCount: profitable, losingCount: losing, neutralCount: neutral };
}
