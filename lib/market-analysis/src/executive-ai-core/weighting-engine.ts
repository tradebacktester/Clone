// ─── Weighting Engine ─────────────────────────────────────────────────────────
// Configurable, transparent, versioned scoring weights.

import { DEFAULT_EAI_WEIGHTS, type EaiWeights } from "./types.js";

export const WEIGHTS_VERSION = "1.0.0";

// ─── Normalise + validate weights ─────────────────────────────────────────────

export function buildWeights(overrides?: Partial<EaiWeights>): EaiWeights {
  const raw = { ...DEFAULT_EAI_WEIGHTS, ...overrides };

  // Clamp each weight to [0, 1]
  const clamped: EaiWeights = {
    strategy: Math.max(0, Math.min(1, raw.strategy)),
    market:   Math.max(0, Math.min(1, raw.market)),
    risk:     Math.max(0, Math.min(1, raw.risk)),
    memory:   Math.max(0, Math.min(1, raw.memory)),
    learning: Math.max(0, Math.min(1, raw.learning)),
    identity: Math.max(0, Math.min(1, raw.identity)),
    research: Math.max(0, Math.min(1, raw.research)),
  };

  // Re-normalise so they always sum to 1.0
  const total = Object.values(clamped).reduce((a, b) => a + b, 0);
  if (total <= 0) return { ...DEFAULT_EAI_WEIGHTS };

  return {
    strategy: clamped.strategy / total,
    market:   clamped.market   / total,
    risk:     clamped.risk     / total,
    memory:   clamped.memory   / total,
    learning: clamped.learning / total,
    identity: clamped.identity / total,
    research: clamped.research / total,
  };
}

// ─── Apply weights to dimension scores ────────────────────────────────────────

export interface WeightedDimension {
  label: string;
  systemKey: keyof EaiWeights;
  rawScore: number;        // 0-100 (already inverted for risk)
  weight: number;
  weighted: number;
}

export function applyWeights(
  dimensions: Record<keyof EaiWeights, number>,
  weights: EaiWeights
): WeightedDimension[] {
  const labels: Record<keyof EaiWeights, string> = {
    strategy: "Strategy Intelligence",
    market:   "Market Intelligence",
    risk:     "Risk Intelligence (inverted)",
    memory:   "Memory Intelligence",
    learning: "Learning Intelligence",
    identity: "Trader Identity",
    research: "Research Intelligence (advisory)",
  };

  return (Object.keys(weights) as (keyof EaiWeights)[]).map(key => ({
    label:    labels[key],
    systemKey: key,
    rawScore:  dimensions[key],
    weight:    weights[key],
    weighted:  dimensions[key] * weights[key],
  }));
}

// ─── Compute composite score ──────────────────────────────────────────────────

export function computeComposite(dims: WeightedDimension[]): number {
  const total = dims.reduce((s, d) => s + d.weighted, 0);
  return Math.max(0, Math.min(100, total));
}

// ─── Log weights in a transparent record ─────────────────────────────────────

export function describeWeights(weights: EaiWeights): string[] {
  return [
    `Strategy Intelligence: ${(weights.strategy * 100).toFixed(0)}% — primary driver of trade decisions`,
    `Risk Intelligence: ${(weights.risk * 100).toFixed(0)}% — applied as safety score (100 - ERB risk)`,
    `Market Intelligence: ${(weights.market * 100).toFixed(0)}% — external market conditions`,
    `Memory Intelligence: ${(weights.memory * 100).toFixed(0)}% — historical similarity and lessons`,
    `Learning Intelligence: ${(weights.learning * 100).toFixed(0)}% — adaptive performance tracking`,
    `Trader Identity: ${(weights.identity * 100).toFixed(0)}% — style and preference alignment`,
    `Research Intelligence: ${(weights.research * 100).toFixed(0)}% — advisory only, minimal weight`,
    `Weights Version: ${WEIGHTS_VERSION}`,
  ];
}
