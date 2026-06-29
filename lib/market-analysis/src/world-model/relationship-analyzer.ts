// ─── Relationship Analyzer ────────────────────────────────────────────────────
// Discovers statistically significant relationships between world model
// components from historical feature data.
// Observational only — no trade execution, no strategy modification.

import type {
  WorldModelComponent,
  ComponentRelationship,
  RelationshipType,
  WorldModelFeatureRow,
  EvidenceDataPoint,
} from "./types.js";
import { ALL_COMPONENTS, WORLD_MODEL_VERSION } from "./types.js";

export const MIN_RELATIONSHIP_SAMPLE = 20;
export const MIN_CONFIDENCE_THRESHOLD = 55; // percent
export const CAUSAL_CONFIDENCE_THRESHOLD = 75;
export const CAUSAL_SAMPLE_THRESHOLD = 50;

// ─── Feature Extraction ────────────────────────────────────────────────────────

interface ComponentValues {
  regime: number;
  trend: number;
  volatility: number;
  liquidity: number;
  correlation: number;
  news: number;
  session: number;
  spread: number;
  market_structure: number;
  supply_demand: number;
  liquidity_sweeps: number;
  amd_completion: number;
  confirmation_quality: number;
}

function encodeRegime(regime: string): number {
  const map: Record<string, number> = {
    trending: 1, ranging: 0.3, volatile: 0.7, low_volatility: 0.1, unknown: 0.5,
  };
  return map[regime] ?? 0.5;
}

function encodeTrend(trend: string): number {
  const map: Record<string, number> = {
    bullish: 1, bearish: -1, sideways: 0, neutral: 0, unknown: 0,
    strong_bullish: 1.0, weak_bullish: 0.5, strong_bearish: -1.0, weak_bearish: -0.5,
  };
  return map[trend] ?? 0;
}

function encodeVolatility(vol: string): number {
  const map: Record<string, number> = { low: 0.2, medium: 0.5, high: 0.9 };
  return map[vol] ?? 0.5;
}

function encodeSession(session: string): number {
  const map: Record<string, number> = {
    london: 0.9, new_york: 0.85, overlap: 1.0, asian: 0.4, sydney: 0.3, off: 0.1,
  };
  return map[session.toLowerCase()] ?? 0.5;
}

function extractComponentValues(row: WorldModelFeatureRow): ComponentValues {
  return {
    regime: encodeRegime(row.marketRegime),
    trend: encodeTrend(row.trend),
    volatility: encodeVolatility(row.volatility),
    liquidity: row.liquidityScore / 100,
    correlation: 0.5, // not in feature rows; default neutral
    news: 0.5,         // not in feature rows; default neutral
    session: encodeSession(row.session),
    spread: Math.min(row.spreadPips / 30, 1), // normalise
    market_structure: 0.5, // derived from trend/regime
    supply_demand: (row.supplyQuality + row.demandQuality) / 200,
    liquidity_sweeps: row.liquidityScore > 70 ? 0.8 : 0.3,
    amd_completion: row.amdScore / 100,
    confirmation_quality: row.confirmationQuality / 100,
  };
}

// ─── Pearson Correlation ───────────────────────────────────────────────────────

function pearsonCorrelation(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 2) return 0;
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, denomX = 0, denomY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    num += dx * dy;
    denomX += dx * dx;
    denomY += dy * dy;
  }
  const denom = Math.sqrt(denomX * denomY);
  return denom === 0 ? 0 : num / denom;
}

// Two-tailed p-value approximation using t-distribution (large-n approximation)
function approximatePValue(r: number, n: number): number {
  if (n < 3) return 1;
  const t = (r * Math.sqrt(n - 2)) / Math.sqrt(1 - r * r + 1e-10);
  const absT = Math.abs(t);
  // Normal approximation for large n
  const z = absT / Math.sqrt(2);
  const pHalf = 0.5 * Math.exp(-z * z);
  return Math.min(1, 2 * pHalf);
}

// ─── Lag Correlation ──────────────────────────────────────────────────────────

function laggedCorrelation(
  source: number[],
  target: number[],
  lag: number,
): number {
  if (lag >= source.length) return 0;
  const s = source.slice(0, source.length - lag);
  const t = target.slice(lag);
  return pearsonCorrelation(s, t);
}

// ─── Relationship Type Inference ───────────────────────────────────────────────

function inferRelationshipType(
  r: number,
  lag: number,
  sourceComp: WorldModelComponent,
  targetComp: WorldModelComponent,
): RelationshipType {
  if (lag > 0) return "leads_to";
  if (r > 0.4) return "amplifies";
  if (r < -0.4) return "suppresses";
  return "correlates_with";
}

// ─── Evidence Summary Builder ─────────────────────────────────────────────────

function buildEvidenceSummary(
  sourceComp: WorldModelComponent,
  targetComp: WorldModelComponent,
  r: number,
  lag: number,
  n: number,
  relType: RelationshipType,
): string {
  const direction = r > 0 ? "positively" : "negatively";
  const strength = Math.abs(r) > 0.6 ? "strongly" : Math.abs(r) > 0.35 ? "moderately" : "weakly";
  const lagNote = lag > 0 ? ` with a ${lag}-bar lag` : "";
  return (
    `${sourceComp} ${strength} ${direction} ${relType.replace("_", " ")} ${targetComp}${lagNote}. ` +
    `Based on ${n} observations (r=${r.toFixed(3)}).`
  );
}

// ─── Main Analyzer ────────────────────────────────────────────────────────────

export function analyzeRelationships(
  features: WorldModelFeatureRow[],
): ComponentRelationship[] {
  if (features.length < MIN_RELATIONSHIP_SAMPLE) return [];

  const now = new Date();
  const results: ComponentRelationship[] = [];

  // Extract component value arrays once
  const componentArrays: Record<WorldModelComponent, number[]> = {} as Record<WorldModelComponent, number[]>;
  for (const comp of ALL_COMPONENTS) {
    componentArrays[comp] = features.map(f => extractComponentValues(f)[comp]);
  }

  // Evaluate all directed pairs at lags 0, 1, 3
  const LAGS = [0, 1, 3];

  for (const source of ALL_COMPONENTS) {
    for (const target of ALL_COMPONENTS) {
      if (source === target) continue;

      let bestR = 0;
      let bestLag = 0;

      for (const lag of LAGS) {
        const r = laggedCorrelation(componentArrays[source], componentArrays[target], lag);
        if (Math.abs(r) > Math.abs(bestR)) {
          bestR = r;
          bestLag = lag;
        }
      }

      const n = features.length - bestLag;
      const pValue = approximatePValue(bestR, n);

      // Only keep relationships with statistical significance and minimum strength
      if (Math.abs(bestR) < 0.15 || pValue > 0.1 || n < MIN_RELATIONSHIP_SAMPLE) continue;

      const relType = inferRelationshipType(bestR, bestLag, source, target);
      const confidence = Math.min(100, (1 - pValue) * 100 * (Math.abs(bestR) / 0.8));
      const reliabilityScore = Math.min(100, (n / 200) * 50 + confidence * 0.5);
      const isCausal = (
        bestLag > 0 &&
        confidence >= CAUSAL_CONFIDENCE_THRESHOLD &&
        n >= CAUSAL_SAMPLE_THRESHOLD
      );

      // Build evidence points (sample up to 10)
      const step = Math.max(1, Math.floor(features.length / 10));
      const evidencePoints: EvidenceDataPoint[] = features
        .filter((_, i) => i % step === 0)
        .slice(0, 10)
        .map(f => {
          const vals = extractComponentValues(f);
          return {
            pair: f.pair,
            session: f.session,
            regime: f.marketRegime,
            sourceValue: vals[source],
            targetValue: vals[target],
            lag: bestLag,
            weight: 1,
          };
        });

      results.push({
        sourceComponent: source,
        targetComponent: target,
        relationshipType: relType,
        strength: parseFloat(bestR.toFixed(4)),
        confidence: parseFloat(confidence.toFixed(2)),
        sampleSize: n,
        reliabilityScore: parseFloat(reliabilityScore.toFixed(2)),
        lagBars: bestLag,
        pValue: parseFloat(pValue.toFixed(6)),
        isCausal,
        evidenceSummary: buildEvidenceSummary(source, target, bestR, bestLag, n, relType),
        historicalEvidence: evidencePoints,
        computedAt: now,
      });
    }
  }

  // Sort by absolute strength descending
  results.sort((a, b) => Math.abs(b.strength) - Math.abs(a.strength));
  return results;
}

// ─── Filter helpers ────────────────────────────────────────────────────────────

export function filterSignificantRelationships(
  relationships: ComponentRelationship[],
  minConfidence = MIN_CONFIDENCE_THRESHOLD,
  minSample = MIN_RELATIONSHIP_SAMPLE,
): ComponentRelationship[] {
  return relationships.filter(
    r => r.confidence >= minConfidence && r.sampleSize >= minSample,
  );
}

export function getRelationshipsFor(
  component: WorldModelComponent,
  relationships: ComponentRelationship[],
  role: "source" | "target" | "both" = "both",
): ComponentRelationship[] {
  return relationships.filter(r => {
    if (role === "source") return r.sourceComponent === component;
    if (role === "target") return r.targetComponent === component;
    return r.sourceComponent === component || r.targetComponent === component;
  });
}
