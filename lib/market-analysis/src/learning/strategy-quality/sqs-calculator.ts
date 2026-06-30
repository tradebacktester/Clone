// ─── SQS Calculator ───────────────────────────────────────────────────────────
// Combines 7 component scores into the unified Strategy Quality Score (0–100).
// Advisory only.

import { clamp, SQS_WEIGHTS, scoreToQualityTier } from "./types.js";
import type {
  RuleIntegrityResult,
  StructuralQualityResult,
  LiquidityIntelligenceResult,
  AmdIntelligenceResult,
  ConfirmationIntelligenceResult,
  MarketIntelligenceResult,
  HistoricalIntelligenceResult,
  SqsComponent,
} from "./types.js";

export interface SqsResult {
  components:           SqsComponent[];
  strategyQualityScore: number;   // 0–100
  strongestComponents:  string[];
  weakestComponents:    string[];
}

export function calculateSqs(
  ruleIntegrity:            RuleIntegrityResult,
  structuralQuality:        StructuralQualityResult,
  liquidityIntelligence:    LiquidityIntelligenceResult,
  amdIntelligence:          AmdIntelligenceResult,
  confirmationIntelligence: ConfirmationIntelligenceResult,
  marketIntelligence:       MarketIntelligenceResult,
  historicalIntelligence:   HistoricalIntelligenceResult,
): SqsResult {

  const raw: Array<{ name: string; score: number; weight: number }> = [
    { name: "Rule Integrity",            score: ruleIntegrity.ruleIntegrityScore,                    weight: SQS_WEIGHTS.ruleIntegrity },
    { name: "Structural Quality",        score: structuralQuality.structuralQualityScore,            weight: SQS_WEIGHTS.structuralQuality },
    { name: "Liquidity Intelligence",    score: liquidityIntelligence.liquidityIntelligenceScore,    weight: SQS_WEIGHTS.liquidityIntelligence },
    { name: "AMD Intelligence",          score: amdIntelligence.amdIntelligenceScore,                weight: SQS_WEIGHTS.amdIntelligence },
    { name: "Confirmation Intelligence", score: confirmationIntelligence.confirmationIntelligenceScore, weight: SQS_WEIGHTS.confirmationIntelligence },
    { name: "Market Intelligence",       score: marketIntelligence.marketIntelligenceScore,          weight: SQS_WEIGHTS.marketIntelligence },
    { name: "Historical Intelligence",   score: historicalIntelligence.historicalIntelligenceScore,  weight: SQS_WEIGHTS.historicalIntelligence },
  ];

  const components: SqsComponent[] = raw.map(c => ({
    name:          c.name,
    score:         clamp(c.score, 0, 100),
    weight:        c.weight,
    weightedScore: clamp(c.score, 0, 100) * c.weight,
    tier:          scoreToQualityTier(c.score),
  }));

  const strategyQualityScore = clamp(
    components.reduce((sum, c) => sum + c.weightedScore, 0),
    0, 100,
  );

  // Top 2 strongest, bottom 2 weakest by score
  const sorted = [...components].sort((a, b) => b.score - a.score);
  const strongestComponents = sorted.slice(0, 2).map(c => c.name);
  const weakestComponents   = sorted.slice(-2).map(c => c.name);

  return { components, strategyQualityScore, strongestComponents, weakestComponents };
}
