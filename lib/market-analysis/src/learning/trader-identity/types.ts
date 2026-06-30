// ─── Trader Identity & Strategy Consistency Engine — Types ───────────────────
// Advisory only. Never modifies trading behavior.

export const TI_ENGINE_VERSION = "1.0.0";

// ─── Constants ────────────────────────────────────────────────────────────────

export const MIN_SAMPLE_FOR_ADAPTIVE = 20;   // Trades required before Stage 2
export const MIN_PREFERENCE_SAMPLE   = 8;    // Minimum sample for a preference sub-group
export const MIN_PREFERENCE_CONFIDENCE = 0.65; // Cohen's effect threshold
export const PREFERENCE_LIFT_THRESHOLD = 0.05; // 5pp lift vs baseline required
export const DRIFT_WINDOW_SIZE         = 30;   // Trades per rolling window for drift
export const DRIFT_MIN_WINDOW          = 10;   // Minimum per window for drift comparison

// Similarity weights
export const SIMILARITY_WEIGHTS = {
  rule:        0.45,
  historical:  0.30,
  preference:  0.25,
} as const;

// Consistency thresholds
export const CONSISTENCY_THRESHOLDS = {
  fully_consistent:    85,
  mostly_consistent:   70,
  partially_consistent:55,
  weakly_consistent:   40,
} as const;

// ─── Identity Stage ────────────────────────────────────────────────────────────

export type IdentityStage = "rule_identity" | "adaptive_identity";

// ─── Consistency Levels ───────────────────────────────────────────────────────

export type ConsistencyLevel =
  | "fully_consistent"
  | "mostly_consistent"
  | "partially_consistent"
  | "weakly_consistent"
  | "inconsistent";

export const CONSISTENCY_LABELS: Record<ConsistencyLevel, string> = {
  fully_consistent:    "Fully Consistent",
  mostly_consistent:   "Mostly Consistent",
  partially_consistent:"Partially Consistent",
  weakly_consistent:   "Weakly Consistent",
  inconsistent:        "Inconsistent",
};

// ─── Preference Types ─────────────────────────────────────────────────────────

export type PreferenceType =
  | "pair"
  | "session"
  | "regime"
  | "volatility"
  | "trend"
  | "zone_quality"
  | "confirmation_quality"
  | "hold_duration"
  | "risk_profile"
  | "liquidity_sweep";

// ─── Drift Types ──────────────────────────────────────────────────────────────

export type DriftType =
  | "preference_drift"
  | "market_adaptation"
  | "consistency_drift"
  | "learning_drift";

export type DriftSeverity = "low" | "medium" | "high" | "critical";

// ─── Input Setup ──────────────────────────────────────────────────────────────

export interface IdentitySetup {
  setupId?:   string;
  pair:        string;
  session:     string;
  regime:      string;
  trend:       string;
  volatility:  "low" | "medium" | "high";
  direction?:  "buy" | "sell";

  supplyQuality:       number;
  demandQuality:       number;
  liquidityScore:      number;
  amdScore:            number;
  confirmationQuality: number;
  setupScore:          number;
  tqi:                 number;
  rrPlanned:           number;
  spreadPips:          number;

  // Optional enrichment
  liquiditySweepSize?:  number;
  htfAlignment?:        number;
  zoneQuality?:         number;
  trendStrength?:       number;
  holdDurationMinutes?: number;

  evaluatedAt?: Date;
}

// ─── Historical Feature (matches existing learningFeaturesTable shape) ────────

export interface IdentityFeature {
  tradeId:             string;
  pair:                string;
  session:             string;
  marketRegime:        string;
  trend:               string;
  volatility:          string;
  direction:           string;
  supplyQuality:       number;
  demandQuality:       number;
  liquidityScore:      number;
  amdScore:            number;
  confirmationQuality: number;
  setupScore:          number;
  tqi:                 number;
  rrPlanned:           number;
  rrActual:            number;
  spreadPips:          number;
  outcome:             string;
  pnl:                 number;
  holdDurationMinutes: number;
  openedAt:            Date;
}

// ─── Rule Evaluation ──────────────────────────────────────────────────────────

export interface RuleCheck {
  name:    string;
  score:   number;     // 0–100
  passed:  boolean;
  weight:  number;
  detail:  string;
}

export interface RuleIdentityResult {
  ruleBaselineScore:  number;
  passingRules:       number;
  totalRules:         number;
  checks:             RuleCheck[];
  summary:            string;
}

// ─── Preference Discovery ─────────────────────────────────────────────────────

export interface PreferenceGroup {
  type:          PreferenceType;
  value:         string;
  label:         string;
  sampleSize:    number;
  winRate:       number;
  avgRr:         number;
  profitFactor:  number;
  confidence:    number;
  effect:        "positive" | "negative" | "neutral";
  effectSize:    number;
  baselineWinRate: number;
  liftVsBaseline:  number;
  isSignificant: boolean;
  explanation:   string;
}

export interface AdaptiveIdentityResult {
  stage:                IdentityStage;
  sampleSize:           number;
  confidenceScore:      number;
  preferredPairs:       string[];
  preferredSessions:    string[];
  preferredRegimes:     string[];
  preferredVolatility:  string | null;
  preferredTrend:       string | null;
  avgSetupScore:        number;
  avgTqi:               number;
  avgRrPlanned:         number;
  avgHoldDuration:      number;
  overallWinRate:       number;
  overallPf:            number;
  overallAvgRr:         number;
  discoveries:          PreferenceGroup[];
}

// ─── Similarity Scores ────────────────────────────────────────────────────────

export interface SimilarHistoricalTrade {
  tradeId:    string;
  pair:       string;
  session:    string;
  regime:     string;
  outcome:    string;
  rrActual:   number;
  similarity: number;
  openedAt:   Date;
}

export interface RuleSimilarityResult {
  score:   number;
  details: RuleCheck[];
  summary: string;
}

export interface HistoricalSimilarityResult {
  score:         number;
  sampleSize:    number;
  similarTrades: SimilarHistoricalTrade[];
  summary:       string;
}

export interface PreferenceAlignmentResult {
  score:   number;
  aligned: string[];
  misaligned: string[];
  neutral: string[];
  details: Array<{ dimension: string; score: number; reason: string }>;
  summary: string;
}

export interface IdentitySimilarityScore {
  ruleSimilarityScore:       number;
  historicalSimilarityScore: number;
  preferenceAlignmentScore:  number;
  identitySimilarityScore:   number;
  statisticalConfidence:     number;
  historicalSampleSize:      number;
}

// ─── Consistency Result ───────────────────────────────────────────────────────

export interface ConsistencyResult {
  level:   ConsistencyLevel;
  label:   string;
  reason:  string;
  evidence: string[];
}

// ─── Drift Detection ──────────────────────────────────────────────────────────

export interface DriftEvent {
  eventId:       string;
  driftType:     DriftType;
  driftSeverity: DriftSeverity;
  driftScore:    number;
  dimension:     string;
  previousValue: string;
  currentValue:  string;
  changePercent: number;
  sampleSizeBefore: number;
  sampleSizeAfter:  number;
  isStatisticallySignificant: boolean;
  description:   string;
}

export interface DriftReport {
  hasActiveDrift:   boolean;
  driftEvents:      DriftEvent[];
  overallDriftScore: number;
  driftSummary:     string;
  detectedAt:       Date;
}

// ─── Identity Profile ─────────────────────────────────────────────────────────

export interface IdentityProfile {
  profileId:    string;
  version:      string;
  stage:        IdentityStage;
  sampleSize:   number;
  confidenceScore: number;
  ruleIdentity: RuleIdentityResult;
  adaptiveIdentity: AdaptiveIdentityResult | null;
  isAdvisoryOnly: true;
  createdAt:    Date;
}

// ─── Full Trader Identity Report ──────────────────────────────────────────────

export interface TraderIdentityReport {
  reportId:   string;
  version:    string;
  profileId:  string;
  setup:      IdentitySetup;

  // Stage info
  identityStage:  IdentityStage;
  stageLabel:     string;

  // Similarity scores
  similarity:     IdentitySimilarityScore;

  // Consistency verdict
  consistency:    ConsistencyResult;

  // Evidence
  ruleEvaluation:       RuleSimilarityResult;
  historicalSimilarity: HistoricalSimilarityResult;
  preferenceAlignment:  PreferenceAlignmentResult;

  // Narrative
  identityNarrative: string;

  isAdvisoryOnly: true;
  evaluatedAt:    Date;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function clamp(v: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, v));
}

export function consistencyFromScore(score: number): ConsistencyLevel {
  if (score >= CONSISTENCY_THRESHOLDS.fully_consistent)    return "fully_consistent";
  if (score >= CONSISTENCY_THRESHOLDS.mostly_consistent)   return "mostly_consistent";
  if (score >= CONSISTENCY_THRESHOLDS.partially_consistent) return "partially_consistent";
  if (score >= CONSISTENCY_THRESHOLDS.weakly_consistent)   return "weakly_consistent";
  return "inconsistent";
}

export function driftSeverityFromScore(score: number): DriftSeverity {
  if (score >= 75) return "critical";
  if (score >= 55) return "high";
  if (score >= 35) return "medium";
  return "low";
}

export function cosineSimilarity(a: number[], b: number[]): number {
  const dot  = a.reduce((s, v, i) => s + v * (b[i] ?? 0), 0);
  const magA = Math.sqrt(a.reduce((s, v) => s + v * v, 0));
  const magB = Math.sqrt(b.reduce((s, v) => s + v * v, 0));
  if (magA === 0 || magB === 0) return 0;
  return clamp((dot / (magA * magB)) * 100, 0, 100);
}

export function featureVector(
  supplyQuality: number, demandQuality: number, liquidityScore: number,
  amdScore: number, confirmationQuality: number, setupScore: number, tqi: number,
): number[] {
  return [supplyQuality, demandQuality, liquidityScore, amdScore, confirmationQuality, setupScore, tqi];
}
