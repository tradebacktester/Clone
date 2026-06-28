// ─── Decision Intelligence Engine — Types ─────────────────────────────────────
// Advisory only. No trade execution. No strategy modification.
// All recommendations are evidence-backed and fully explainable.

// ─── Current Setup Input ──────────────────────────────────────────────────────
// Snapshot of the setup being evaluated.

export interface CurrentSetup {
  setupId?: string;
  pair: string;
  session: string;
  regime: string;
  trend: string;
  supplyQuality: number;      // 0–100
  demandQuality: number;      // 0–100
  liquidityScore: number;     // 0–100
  amdScore: number;           // 0–100
  confirmationQuality: number; // 0–100
  setupScore: number;         // 0–100
  tqi: number;                // 0–100
  rrPlanned: number;
  spreadPips: number;
  volatility: "low" | "medium" | "high";
  direction?: "buy" | "sell";
  evaluatedAt?: Date;
}

// ─── TIS Components ───────────────────────────────────────────────────────────
// 15 components, each scored 0–100. Weights sum to 1.0.

export interface TisComponent {
  name: string;
  key: TisComponentKey;
  score: number;         // 0–100
  weight: number;        // 0–1
  weightedScore: number; // score × weight × 100
  explanation: string;
  isInsufficient: boolean;
  evidenceCount: number;
}

export type TisComponentKey =
  | "patternPerformance"
  | "historicalWinRate"
  | "sampleSize"
  | "featureImportance"
  | "confidenceScore"
  | "marketRegimeMatch"
  | "sessionPerformance"
  | "pairPerformance"
  | "zoneQuality"
  | "liquidityQuality"
  | "amdQuality"
  | "confirmationQuality"
  | "volatility"
  | "spread"
  | "dataQuality";

export const TIS_WEIGHTS: Record<TisComponentKey, number> = {
  patternPerformance:  0.10,
  historicalWinRate:   0.10,
  sampleSize:          0.05,
  featureImportance:   0.10,
  confidenceScore:     0.08,
  marketRegimeMatch:   0.08,
  sessionPerformance:  0.07,
  pairPerformance:     0.06,
  zoneQuality:         0.08,
  liquidityQuality:    0.06,
  amdQuality:          0.06,
  confirmationQuality: 0.05,
  volatility:          0.04,
  spread:              0.03,
  dataQuality:         0.04,
};

// Verify weights sum to 1.0
// 0.10+0.10+0.05+0.10+0.08+0.08+0.07+0.06+0.08+0.06+0.06+0.05+0.04+0.03+0.04 = 1.00 ✓

// ─── Recommendation Levels ────────────────────────────────────────────────────

export type RecommendationLevel =
  | "exceptional"
  | "high_quality"
  | "good_opportunity"
  | "neutral"
  | "low_quality"
  | "avoid";

export const RECOMMENDATION_LEVELS: Record<RecommendationLevel, { label: string; minTis: number; maxTis: number; color: string }> = {
  exceptional:      { label: "Exceptional Opportunity", minTis: 80, maxTis: 100, color: "#22c55e" },
  high_quality:     { label: "High Quality",            minTis: 65, maxTis: 80,  color: "#3b82f6" },
  good_opportunity: { label: "Good Opportunity",        minTis: 50, maxTis: 65,  color: "#a78bfa" },
  neutral:          { label: "Neutral",                 minTis: 35, maxTis: 50,  color: "#f59e0b" },
  low_quality:      { label: "Low Quality",             minTis: 20, maxTis: 35,  color: "#f97316" },
  avoid:            { label: "Avoid",                   minTis: 0,  maxTis: 20,  color: "#ef4444" },
};

export function tisToLevel(tis: number): RecommendationLevel {
  if (tis >= 80) return "exceptional";
  if (tis >= 65) return "high_quality";
  if (tis >= 50) return "good_opportunity";
  if (tis >= 35) return "neutral";
  if (tis >= 20) return "low_quality";
  return "avoid";
}

// ─── Factors ──────────────────────────────────────────────────────────────────

export interface EvidenceFactor {
  name: string;
  impact: number;        // positive = bullish, negative = bearish. -100 to +100
  explanation: string;
  category: "zone" | "execution" | "context" | "risk" | "statistical" | "pattern";
  confidence: number;    // 0–100
}

// ─── Similar Experience ───────────────────────────────────────────────────────
// Designed for future vector similarity — stores feature vector now.

export interface SimilarExperience {
  tradeId: string;
  similarityScore: number;   // 0–1
  isWin: boolean;
  outcome: string;
  historicalRR: number;
  historicalPnl: number;
  historicalConf: number;
  pair: string;
  session: string;
  regime: string;
  similarityReason: string;
  featureVector: number[];   // normalized 0–1 feature values for future vector search
}

// ─── Uncertainty Level ────────────────────────────────────────────────────────

export type UncertaintyLevel = "very_low" | "low" | "moderate" | "high" | "very_high";

export function computeUncertaintyLevel(
  confidence: number,
  evidenceCount: number,
  hasConflict: boolean,
): UncertaintyLevel {
  if (hasConflict || confidence < 25) return "very_high";
  if (evidenceCount < 5 || confidence < 40) return "high";
  if (confidence < 55) return "moderate";
  if (confidence < 75) return "low";
  return "very_low";
}

// ─── Reliability Rating ───────────────────────────────────────────────────────

export type DiReliabilityRating = "institutional" | "strong" | "moderate" | "weak" | "insufficient";

export function computeReliabilityRating(confidence: number, evidence: number): DiReliabilityRating {
  if (evidence < 5) return "insufficient";
  if (confidence >= 75 && evidence >= 30) return "institutional";
  if (confidence >= 60 && evidence >= 15) return "strong";
  if (confidence >= 40 && evidence >= 5) return "moderate";
  if (confidence >= 25) return "weak";
  return "insufficient";
}

// ─── Trade Intelligence Report ────────────────────────────────────────────────

export interface TradeIntelligenceReport {
  recommendationId: string;
  version: string;
  evaluatedAt: Date;

  setup: CurrentSetup;

  // Core outputs
  tisScore: number;                        // 0–100
  tisComponents: TisComponent[];
  recommendationLevel: RecommendationLevel;
  recommendationLabel: string;
  confidenceScore: number;                 // 0–100
  uncertaintyLevel: UncertaintyLevel;
  reliabilityRating: DiReliabilityRating;
  isLowConfidence: boolean;
  hasConflictingEvidence: boolean;
  reasoning: string;

  // Evidence
  historicalEvidenceCount: number;
  similarWinCount: number;
  similarLossCount: number;
  historicalWinRate: number;
  statisticalExpectancy: number;

  // Factors
  positiveFactors: EvidenceFactor[];
  negativeFactors: EvidenceFactor[];

  // Historical comparison
  similarWinningExperiences: SimilarExperience[];
  similarLosingExperiences: SimilarExperience[];

  // Validation flags
  validationFlags: ValidationFlag[];
  isAdvisoryOnly: true;
}

export interface ValidationFlag {
  type: "insufficient_evidence" | "low_confidence" | "conflicting_evidence" | "unstable_features" | "high_uncertainty";
  message: string;
  severity: "warning" | "error" | "info";
}

// ─── Engine Constants ─────────────────────────────────────────────────────────

export const DI_ENGINE_VERSION = "1.0.0";
export const MIN_EVIDENCE_FOR_RECOMMENDATION = 3;
export const MAX_SIMILAR_EXPERIENCES = 5;
export const LOW_CONFIDENCE_THRESHOLD = 40;
export const SIMILARITY_THRESHOLD = 0.5;    // cosine similarity floor for "similar"
