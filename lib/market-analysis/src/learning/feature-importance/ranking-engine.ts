// ─── Feature Ranking Engine ───────────────────────────────────────────────────
// Produces ranked feature lists by various metrics.
// Advisory only — never modifies trading behavior.

import type {
  FeatureImportanceResult,
  FeatureRanking,
  InteractionResult,
} from "./types.js";

export type RankingSortKey =
  | "predictive_value"
  | "confidence_score"
  | "reliability_score"
  | "win_rate"
  | "sample_size";

// ─── Composite ranking score ───────────────────────────────────────────────────

function compositeScore(f: FeatureImportanceResult): number {
  if (f.isInsufficient) return 0;
  return (
    f.predictiveValue  * 0.40 +
    f.confidenceScore  * 0.35 +
    f.reliabilityScore * 0.25
  );
}

// ─── Build rankings ───────────────────────────────────────────────────────────

export function rankFeatures(
  features: FeatureImportanceResult[],
  sortBy: RankingSortKey = "predictive_value",
): FeatureRanking[] {
  const sorted = [...features].sort((a, b) => {
    // Insufficient always last
    if (a.isInsufficient && !b.isInsufficient) return 1;
    if (!a.isInsufficient && b.isInsufficient) return -1;

    switch (sortBy) {
      case "predictive_value":  return b.predictiveValue  - a.predictiveValue;
      case "confidence_score":  return b.confidenceScore  - a.confidenceScore;
      case "reliability_score": return b.reliabilityScore - a.reliabilityScore;
      case "win_rate":          return b.winRate          - a.winRate;
      case "sample_size":       return b.sampleSize       - a.sampleSize;
      default:                  return compositeScore(b)  - compositeScore(a);
    }
  });

  return sorted.map((f, idx) => ({
    rank: idx + 1,
    featureId: f.featureId,
    displayName: f.displayName,
    category: f.category,
    predictiveValue: f.predictiveValue,
    confidenceScore: f.confidenceScore,
    reliabilityScore: f.reliabilityScore,
    sampleSize: f.sampleSize,
    winRate: f.winRate,
    isInsufficient: f.isInsufficient,
    reliabilityRating: f.reliabilityRating,
  }));
}

// ─── Top / bottom extractors ──────────────────────────────────────────────────

export function topFeatures(features: FeatureImportanceResult[], n: number = 5): FeatureRanking[] {
  return rankFeatures(features, "predictive_value").slice(0, n);
}

export function weakestFeatures(features: FeatureImportanceResult[], n: number = 5): FeatureRanking[] {
  const sufficient = features.filter(f => !f.isInsufficient);
  return rankFeatures(sufficient, "predictive_value").reverse().slice(0, n).map((r, idx) => ({
    ...r,
    rank: idx + 1,
  }));
}

export function topByConfidence(features: FeatureImportanceResult[], n: number = 5): FeatureRanking[] {
  return rankFeatures(features, "confidence_score").slice(0, n);
}

// ─── Top interactions ─────────────────────────────────────────────────────────

export function topInteractions(interactions: InteractionResult[], n: number = 5): InteractionResult[] {
  return [...interactions]
    .filter(i => !i.isInsufficient)
    .sort((a, b) => b.synergyScore - a.synergyScore)
    .slice(0, n);
}

// ─── Category summary ─────────────────────────────────────────────────────────

export interface CategorySummary {
  category: string;
  total: number;
  sufficient: number;
  avgPredictiveValue: number;
  avgConfidence: number;
  topFeature: string | null;
}

export function summarizeByCategory(features: FeatureImportanceResult[]): CategorySummary[] {
  const categories = [...new Set(features.map(f => f.category))];
  return categories.map(cat => {
    const catFeatures = features.filter(f => f.category === cat);
    const sufficient  = catFeatures.filter(f => !f.isInsufficient);
    const top = sufficient.length > 0
      ? sufficient.reduce((a, b) => a.predictiveValue > b.predictiveValue ? a : b)
      : null;
    return {
      category: cat,
      total: catFeatures.length,
      sufficient: sufficient.length,
      avgPredictiveValue: sufficient.length > 0
        ? sufficient.reduce((s, f) => s + f.predictiveValue, 0) / sufficient.length
        : 0,
      avgConfidence: sufficient.length > 0
        ? sufficient.reduce((s, f) => s + f.confidenceScore, 0) / sufficient.length
        : 0,
      topFeature: top?.displayName ?? null,
    };
  });
}
