// ─── Strategy Quality Intelligence Engine — Types & Constants ─────────────────
// All scoring models, thresholds, weights, and data structures.
// Advisory only — no trade execution, no strategy modification.

import type { ExtractedFeature } from "../learning-core/types.js";

export const SQI_ENGINE_VERSION = "1.0.0";

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

// ─── Quality Setup Input ──────────────────────────────────────────────────────
// Superset of StrategySetup — every field from SR engine + additional granular
// sub-scores for structural / liquidity / AMD / confirmation dimensions.

export interface QualitySetup {
  setupId?:   string;
  pair:       string;
  session:    string;
  regime:     string;
  trend:      string;
  volatility: string;

  // ── Core pattern scores (0–100) — required ──────────────────────────────
  supplyQuality:       number;
  demandQuality:       number;
  liquidityScore:      number;
  amdScore:            number;
  confirmationQuality: number;
  setupScore:          number;
  tqi:                 number;
  rrPlanned:           number;
  spreadPips:          number;

  // ── Structural quality sub-scores (0–100, optional) ────────────────────
  htfAlignment?:              number;  // higher timeframe structure alignment
  srStrength?:                number;  // S/R level strength
  premiumDiscountBias?:       number;  // 100 = perfectly positioned in discount/premium
  zoneFreshness?:             number;  // 100 = untested/fresh zone
  zoneRespect?:               number;  // 100 = zone has been respected many times
  marketStructureCleanliness?: number; // 100 = clean MSB, no chop

  // ── Liquidity intelligence sub-scores (0–100, optional) ───────────────
  liquiditySweepSize?:   number;  // magnitude of the sweep
  liquiditySweepClarity?: number; // how clear/obvious the sweep was
  stopHuntQuality?:      number;  // quality of the stop-hunt event
  manipulationClarity?:  number;  // clarity of the manipulation phase
  distributionStrength?: number;  // strength of distribution phase

  // ── AMD sub-scores (0–100, optional) ──────────────────────────────────
  accumulationQuality?:  number;
  manipulationQuality?:  number;
  distributionQuality?:  number;
  amdCompleteness?:      number;  // how complete is the AMD sequence (0–100)
  amdConfidence?:        number;  // confidence in AMD identification

  // ── Confirmation intelligence sub-scores (0–100, optional) ────────────
  candleStrength?:   number;  // raw candle body/wick ratio quality
  momentum?:         number;  // price momentum at confirmation
  candleBodyRatio?:  number;  // body as % of total candle (0–100 normalized)
  breakStrength?:    number;  // strength of the structural break
  displacement?:     number;  // displacement score (0–100)
  followThroughProb?: number; // estimated follow-through probability

  // ── Market intelligence context (0–100, optional) ────────────────────
  marketHealthScore?:   number;
  marketContextScore?:  number;
  opportunityScore?:    number;
  marketStabilityScore?: number;
  trendStrength?:       number;
  volatilityQuality?:   number;
  liquidityQuality?:    number;
  correlationQuality?:  number;
  newsContext?:         "positive" | "neutral" | "negative";

  evaluatedAt?: Date;
}

// ─── Quality Classification ───────────────────────────────────────────────────

export type QualityClassification =
  | "institutional_grade"
  | "elite"
  | "excellent"
  | "strong"
  | "average"
  | "weak"
  | "reject";

export const QUALITY_CLASSIFICATION_LABELS: Record<QualityClassification, string> = {
  institutional_grade: "Institutional Grade",
  elite:               "Elite Setup",
  excellent:           "Excellent Quality",
  strong:              "Strong Setup",
  average:             "Average Quality",
  weak:                "Weak Setup",
  reject:              "Reject — Insufficient Quality",
};

export const QUALITY_CLASSIFICATION_THRESHOLDS: Array<[number, QualityClassification]> = [
  [90, "institutional_grade"],
  [80, "elite"],
  [70, "excellent"],
  [60, "strong"],
  [45, "average"],
  [25, "weak"],
  [0,  "reject"],
];

export function sqsToClassification(sqs: number): QualityClassification {
  for (const [threshold, cls] of QUALITY_CLASSIFICATION_THRESHOLDS) {
    if (sqs >= threshold) return cls;
  }
  return "reject";
}

// ─── SQS Component Weights ────────────────────────────────────────────────────
// Sum = 1.00

export const SQS_WEIGHTS = {
  ruleIntegrity:            0.15,
  structuralQuality:        0.18,
  liquidityIntelligence:    0.15,
  amdIntelligence:          0.15,
  confirmationIntelligence: 0.12,
  marketIntelligence:       0.15,
  historicalIntelligence:   0.10,
} as const;

// Sub-component weights

export const STRUCTURAL_WEIGHTS = {
  htfAlignment:    0.20,
  srStrength:      0.15,
  premiumDiscount: 0.15,
  supplyDemand:    0.20,
  zoneFreshness:   0.15,
  zoneRespect:     0.10,
  cleanliness:     0.05,
} as const;

export const LIQUIDITY_INTEL_WEIGHTS = {
  sweepSize:    0.20,
  sweepClarity: 0.25,
  stopHunt:     0.20,
  manipulation: 0.20,
  distribution: 0.15,
} as const;

export const AMD_INTEL_WEIGHTS = {
  accumulation:  0.20,
  manipulation:  0.20,
  distribution:  0.20,
  completeness:  0.25,
  confidence:    0.15,
} as const;

export const CONFIRMATION_INTEL_WEIGHTS = {
  candleStrength: 0.20,
  momentum:       0.18,
  bodyRatio:      0.15,
  breakStrength:  0.20,
  displacement:   0.17,
  followThrough:  0.10,
} as const;

export const MARKET_INTEL_WEIGHTS = {
  health:             0.18,
  context:            0.15,
  opportunity:        0.18,
  stability:          0.12,
  trendQuality:       0.15,
  volatilityQuality:  0.10,
  liquidityQuality:   0.07,
  correlationQuality: 0.05,
} as const;

// ─── Tier ─────────────────────────────────────────────────────────────────────

export type QualityTier =
  | "elite" | "excellent" | "strong" | "moderate" | "weak" | "insufficient";

export function scoreToQualityTier(score: number): QualityTier {
  if (score >= 85) return "elite";
  if (score >= 70) return "excellent";
  if (score >= 55) return "strong";
  if (score >= 40) return "moderate";
  if (score >= 20) return "weak";
  return "insufficient";
}

// ─── Component Results ────────────────────────────────────────────────────────

export interface RuleIntegrityResult {
  completenessScore: number;   // all key rule fields populated
  strictnessScore:   number;   // exceptional vs barely-passed ratio
  alignmentScore:    number;   // rules aligned with market conditions
  confidenceScore:   number;   // confidence in rule evaluation
  ruleIntegrityScore: number;  // 0–100 weighted composite
  passingRules:      number;
  totalRules:        number;
  explanations:      string[];
}

export interface StructuralQualityResult {
  htfAlignmentScore:   number;
  srStrengthScore:     number;
  premiumDiscountScore: number;
  supplyDemandScore:   number;
  zoneFreshnessScore:  number;
  zoneRespectScore:    number;
  cleanlinessScore:    number;
  structuralQualityScore: number;  // 0–100
  explanations:        string[];
}

export interface LiquidityIntelligenceResult {
  sweepSizeScore:           number;
  sweepClarityScore:        number;
  stopHuntScore:            number;
  manipulationScore:        number;
  distributionScore:        number;
  liquidityIntelligenceScore: number;  // 0–100
  explanations:             string[];
}

export interface AmdIntelligenceResult {
  accumulationScore:   number;
  manipulationScore:   number;
  distributionScore:   number;
  completenessScore:   number;
  amdConfidenceScore:  number;
  amdIntelligenceScore: number;  // 0–100
  explanations:        string[];
}

export interface ConfirmationIntelligenceResult {
  candleStrengthScore:      number;
  momentumScore:            number;
  bodyRatioScore:           number;
  breakStrengthScore:       number;
  displacementScore:        number;
  followThroughScore:       number;
  confirmationIntelligenceScore: number;  // 0–100
  explanations:             string[];
}

export interface MarketIntelligenceResult {
  healthScore:            number;
  contextScore:           number;
  opportunityScore:       number;
  stabilityScore:         number;
  trendQualityScore:      number;
  volatilityQualityScore: number;
  liquidityQualityScore:  number;
  correlationQualityScore: number;
  marketIntelligenceScore: number;  // 0–100
  explanations:           string[];
}

export interface HistoricalIntelligenceResult {
  similarityScore:         number;
  winRateScore:            number;
  rrScore:                 number;
  patternRankScore:        number;
  featureImportanceScore:  number;
  evidenceVolumeScore:     number;
  historicalIntelligenceScore: number;  // 0–100
  evidenceCount:           number;
  winRate:                 number;
  averageRR:               number;
  wilsonLowerBound:        number;
  sampleReliability:       string;
  explanations:            string[];
}

// ─── SQS Component summary ────────────────────────────────────────────────────

export interface SqsComponent {
  name:           string;
  score:          number;
  weight:         number;
  weightedScore:  number;
  tier:           QualityTier;
}

// ─── Classification Result ────────────────────────────────────────────────────

export interface QualityClassificationResult {
  classification:    QualityClassification;
  classificationLabel: string;
  sqs:               number;
  justification:     string;
  measurableReasons: string[];
  thresholdMet:      number;
  nextThreshold:     number | null;
  gapToNext:         number | null;
}

// ─── Full Quality Report ──────────────────────────────────────────────────────

export interface StrategyQualityReport {
  reportId:    string;
  version:     string;
  setup:       QualitySetup;
  evaluatedAt: Date;

  // Component scores
  ruleIntegrity:             RuleIntegrityResult;
  structuralQuality:         StructuralQualityResult;
  liquidityIntelligence:     LiquidityIntelligenceResult;
  amdIntelligence:           AmdIntelligenceResult;
  confirmationIntelligence:  ConfirmationIntelligenceResult;
  marketIntelligence:        MarketIntelligenceResult;
  historicalIntelligence:    HistoricalIntelligenceResult;

  // Unified SQS
  components:            SqsComponent[];
  strategyQualityScore:  number;   // 0–100
  classification:        QualityClassificationResult;

  // Insights
  strongestComponents: string[];
  weakestComponents:   string[];
  qualityNarrative:    string;

  // Advisory enforcement
  isAdvisoryOnly: true;
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const MIN_EVIDENCE_FOR_QUALITY = 5;
export const HIGH_CONFIDENCE_EVIDENCE  = 20;
export const QUALITY_SIMILARITY_THRESHOLD = 0.70;
export const MAX_SIMILAR_QUALITY_TRADES   = 30;

export const SESSION_QUALITY: Record<string, number> = {
  overlap:   95, london:   85, new_york:  80, asian: 55, off_hours: 30,
};
export const REGIME_QUALITY: Record<string, number> = {
  trending: 90, ranging: 65, volatile: 50, low_volatility: 40,
};
export const VOLATILITY_QUALITY: Record<string, number> = {
  high: 60, medium: 85, low: 55, extreme: 30,
};
export const PAIR_QUALITY: Record<string, number> = {
  EURUSD: 95, GBPUSD: 90, USDJPY: 90, USDCHF: 80,
  AUDUSD: 80, USDCAD: 80, NZDUSD: 75, EURJPY: 85,
  GBPJPY: 80, EURGBP: 75, AUDJPY: 70, XAUUSD: 85,
};
export function getPairQuality(pair: string): number {
  return PAIR_QUALITY[pair.toUpperCase()] ?? 65;
}

export { type ExtractedFeature };
