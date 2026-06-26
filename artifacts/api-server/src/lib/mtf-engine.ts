import type { Pair, StructureLabel } from "@workspace/market-analysis";
import { getCachedAnalysis } from "./analyzer.js";

export type MtfRole = "macro" | "structure" | "bias" | "execution";

export interface MtfTimeframeResult {
  timeframe: "1d" | "4h" | "1h" | "15m";
  role: MtfRole;
  available: boolean;
  trend: "bullish" | "bearish" | "neutral" | null;
  regime: string | null;
  regimeConfidence: number | null;
  structure: "HH/HL" | "LH/LL" | "mixed" | null;
  bullishBias: boolean;
  bearishBias: boolean;
}

export interface MtfAlignment {
  pair: Pair;
  aligned: boolean;
  direction: "buy" | "sell" | null;
  score: number;
  timeframes: MtfTimeframeResult[];
  alignedCount: number;
  totalCount: number;
}

const BULLISH_LABELS: StructureLabel[] = ["HH", "HL", "BOS_UP"];
const BEARISH_LABELS: StructureLabel[] = ["LH", "LL", "BOS_DOWN"];

export function getMtfAlignment(pair: Pair, signalDirection?: "buy" | "sell"): MtfAlignment {
  const TF_CONFIG = [
    { tf: "1d" as const, role: "macro" as const, weight: 0.35 },
    { tf: "4h" as const, role: "structure" as const, weight: 0.30 },
    { tf: "1h" as const, role: "bias" as const, weight: 0.20 },
    { tf: "15m" as const, role: "execution" as const, weight: 0.15 },
  ];

  const results: MtfTimeframeResult[] = [];
  let weightedBull = 0;
  let weightedBear = 0;
  let totalWeight = 0;

  for (const { tf, role, weight } of TF_CONFIG) {
    const analysis = getCachedAnalysis(pair, tf);
    if (!analysis) {
      results.push({
        timeframe: tf, role, available: false,
        trend: null, regime: null, regimeConfidence: null,
        structure: null, bullishBias: false, bearishBias: false,
      });
      continue;
    }

    totalWeight += weight;
    const trend = analysis.regime.trend;
    const bullishBias = trend === "bullish";
    const bearishBias = trend === "bearish";

    if (bullishBias) weightedBull += weight;
    if (bearishBias) weightedBear += weight;

    const recent = analysis.structure.slice(-6);
    const bullStr = recent.filter(s => BULLISH_LABELS.includes(s.label)).length;
    const bearStr = recent.filter(s => BEARISH_LABELS.includes(s.label)).length;
    const structure = bullStr > bearStr ? "HH/HL" : bearStr > bullStr ? "LH/LL" : "mixed";

    results.push({
      timeframe: tf, role, available: true,
      trend, regime: analysis.regime.regime,
      regimeConfidence: analysis.regime.regimeConfidence,
      structure, bullishBias, bearishBias,
    });
  }

  if (totalWeight === 0) {
    return { pair, aligned: false, direction: null, score: 0, timeframes: results, alignedCount: 0, totalCount: 0 };
  }

  const bullScore = (weightedBull / totalWeight) * 100;
  const bearScore = (weightedBear / totalWeight) * 100;
  const ALIGN_THRESHOLD = 65;

  const bullishAligned = bullScore >= ALIGN_THRESHOLD;
  const bearishAligned = bearScore >= ALIGN_THRESHOLD;
  const direction: "buy" | "sell" | null = bullishAligned ? "buy" : bearishAligned ? "sell" : null;

  const directionMatch = signalDirection ? direction === signalDirection : true;
  const rawScore = Math.round(Math.max(bullScore, bearScore));
  const score = directionMatch ? rawScore : 0;

  const availableCount = results.filter(r => r.available).length;
  const alignedCount = results.filter(r =>
    r.available && (
      (direction === "buy" && r.bullishBias) ||
      (direction === "sell" && r.bearishBias)
    )
  ).length;

  return {
    pair,
    aligned: (bullishAligned || bearishAligned) && directionMatch,
    direction,
    score,
    timeframes: results,
    alignedCount,
    totalCount: availableCount,
  };
}
