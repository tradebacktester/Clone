// ─── Strategy Reasoning Engine — Types & Constants ────────────────────────────
// All scoring models, thresholds, weights, and data structures for the
// Strategy Reasoning Engine. Advisory only — no trade execution, no strategy
// modification.

import type { ExtractedFeature } from "../learning-core/types.js";

export const SR_ENGINE_VERSION = "1.0.0";

// ─── Recommendation Levels ────────────────────────────────────────────────────

export type ReasoningRecommendation =
  | "exceptional"
  | "very_strong"
  | "strong"
  | "average"
  | "weak"
  | "avoid";

export const REASONING_RECOMMENDATION_LABELS: Record<ReasoningRecommendation, string> = {
  exceptional:  "Exceptional Opportunity",
  very_strong:  "Very Strong Setup",
  strong:       "Strong Setup",
  average:      "Average Setup",
  weak:         "Weak Setup",
  avoid:        "Avoid — Low Quality",
};

export const REASONING_RECOMMENDATION_THRESHOLDS: Array<[number, ReasoningRecommendation]> = [
  [90, "exceptional"],
  [75, "very_strong"],
  [60, "strong"],
  [45, "average"],
  [25, "weak"],
  [0,  "avoid"],
];

export function strengthToRecommendation(score: number): ReasoningRecommendation {
  for (const [threshold, level] of REASONING_RECOMMENDATION_THRESHOLDS) {
    if (score >= threshold) return level;
  }
  return "avoid";
}

// ─── Strategy Setup Input ─────────────────────────────────────────────────────

export interface StrategySetup {
  setupId?:             string;
  pair:                 string;
  session:              string;
  regime:               string;
  trend:                string;
  volatility:           string;

  // Pattern quality scores (0–100)
  supplyQuality:        number;
  demandQuality:        number;
  liquidityScore:       number;
  amdScore:             number;
  confirmationQuality:  number;
  setupScore:           number;
  tqi:                  number;

  // Execution parameters
  rrPlanned:            number;
  spreadPips:           number;

  // Market support context (0–100 scores, optional — fall back to neutral)
  trendStrength?:       number;   // 0–100 directional conviction
  correlationScore?:    number;   // 0–100 correlation favourability
  stabilityScore?:      number;   // 0–100 market stability
  opportunityScore?:    number;   // 0–100 unified opportunity
  marketHealthScore?:   number;   // 0–100 unified market health
  newsContext?:         "positive" | "neutral" | "negative";

  evaluatedAt?:         Date;
}

// ─── Rule Evaluation ──────────────────────────────────────────────────────────

export type RuleStatus = "failed" | "barely_passed" | "passed" | "exceptional";

export interface RuleResult {
  name:        string;
  value:       number;
  threshold:   number;
  exceptional: number;
  status:      RuleStatus;
  score:       number;         // 0–100 quality contribution
  explanation: string;
}

export interface RuleEvaluationResult {
  rules:         RuleResult[];
  ruleQualityScore: number;    // 0–100 weighted composite
  passingRules:  number;
  totalRules:    number;
  failedRules:   number;
  barelyPassed:  number;
  exceptionalRules: number;
  explanation:   string;
}

// ─── Historical Evidence ──────────────────────────────────────────────────────

export interface SimilarTrade {
  tradeId:         string;
  pair:            string;
  session:         string;
  regime:          string;
  outcome:         "win" | "loss";
  rrActual:        number;
  similarity:      number;     // 0–1 cosine similarity
  setupScore:      number;
  tqi:             number;
  openedAt:        Date;
}

export interface HistoricalEvidenceResult {
  similarTrades:       SimilarTrade[];
  evidenceCount:       number;
  winCount:            number;
  lossCount:           number;
  winRate:             number;   // 0–1
  averageRR:           number;
  profitFactor:        number;
  avgSimilarity:       number;
  wilsonLowerBound:    number;
  evidenceScore:       number;   // 0–100
  explanation:         string;
  sampleReliability:   string;   // "insufficient" | "low" | "moderate" | "high"
}

// ─── Market Support ───────────────────────────────────────────────────────────

export interface MarketSupportResult {
  trendScore:         number;
  regimeScore:        number;
  volatilityScore:    number;
  liquidityScore:     number;
  correlationScore:   number;
  newsScore:          number;
  stabilityScore:     number;
  marketSupportScore: number;   // 0–100 weighted composite
  explanations:       string[];
}

// ─── Pattern Strength ─────────────────────────────────────────────────────────

export interface PatternStrengthResult {
  supplyScore:        number;
  demandScore:        number;
  zoneScore:          number;    // best of supply/demand
  liquiditySweepScore:number;
  amdScore:           number;
  confirmationScore:  number;
  patternStrengthScore: number;  // 0–100 weighted composite
  explanations:       string[];
}

// ─── Context Strength ─────────────────────────────────────────────────────────

export interface ContextStrengthResult {
  sessionScore:        number;
  pairScore:           number;
  opportunityScore:    number;
  healthScore:         number;
  historicalContextScore: number;
  contextStrengthScore: number;  // 0–100 weighted composite
  explanations:        string[];
}

// ─── Strategy Strength ────────────────────────────────────────────────────────

export type StrengthTier = "exceptional" | "strong" | "moderate" | "weak" | "insufficient";

export interface StrengthComponent {
  name:        string;
  score:       number;
  weight:      number;
  contribution: number;  // score * weight
  tier:        StrengthTier;
}

export interface StrategyStrengthResult {
  components:          StrengthComponent[];
  strategyStrengthScore: number;   // 0–100
  confidenceScore:     number;     // 0–100
  recommendation:      ReasoningRecommendation;
  recommendationLabel: string;
  strengthTier:        StrengthTier;
  explanation:         string;
}

// ─── Full Reasoning Report ────────────────────────────────────────────────────

export interface SupportingFactor {
  name:       string;
  impact:     number;  // positive or negative contribution
  detail:     string;
}

export interface StrategyReasoningReport {
  reportId:             string;
  version:              string;
  setup:                StrategySetup;
  evaluatedAt:          Date;

  // Component scores
  ruleEvaluation:       RuleEvaluationResult;
  historicalEvidence:   HistoricalEvidenceResult;
  marketSupport:        MarketSupportResult;
  patternStrength:      PatternStrengthResult;
  contextStrength:      ContextStrengthResult;

  // Unified score
  strategyStrength:     StrategyStrengthResult;

  // Insights
  strongestFactors:     SupportingFactor[];
  weakestFactors:       SupportingFactor[];

  // Statistical expectancy
  statisticalExpectancy: number;   // expected RR adjusted for win rate
  riskAssessment:        string;
  potentialRisks:        string[];

  // Explainability narrative
  reasoning:             string;

  // Final recommendation (advisory only)
  recommendation:        ReasoningRecommendation;
  recommendationLabel:   string;
  recommendationRationale: string;

  // Validation
  isAdvisoryOnly:        true;
}

// ─── Scoring Weights ──────────────────────────────────────────────────────────

export const STRENGTH_WEIGHTS = {
  ruleQuality:        0.20,
  historicalEvidence: 0.25,
  marketSupport:      0.20,
  patternStrength:    0.20,
  contextStrength:    0.15,
} as const;

export const MARKET_SUPPORT_WEIGHTS = {
  trend:       0.25,
  regime:      0.20,
  volatility:  0.15,
  liquidity:   0.15,
  correlation: 0.10,
  news:        0.08,
  stability:   0.07,
} as const;

export const PATTERN_STRENGTH_WEIGHTS = {
  zone:         0.30,
  liquiditySweep: 0.25,
  amd:          0.25,
  confirmation: 0.20,
} as const;

export const CONTEXT_STRENGTH_WEIGHTS = {
  session:     0.25,
  pair:        0.15,
  opportunity: 0.25,
  health:      0.20,
  historical:  0.15,
} as const;

// ─── Rule Thresholds ──────────────────────────────────────────────────────────

export interface RuleDefinition {
  name:        string;
  key:         keyof StrategySetup;
  threshold:   number;
  exceptional: number;
  inverted:    boolean;   // true = lower is better (e.g. spread)
  weight:      number;
}

export const STRATEGY_RULES: RuleDefinition[] = [
  { name: "Zone Quality (Supply)",    key: "supplyQuality",       threshold: 60,  exceptional: 80,  inverted: false, weight: 0.12 },
  { name: "Zone Quality (Demand)",    key: "demandQuality",       threshold: 60,  exceptional: 80,  inverted: false, weight: 0.12 },
  { name: "Liquidity Score",          key: "liquidityScore",      threshold: 55,  exceptional: 75,  inverted: false, weight: 0.12 },
  { name: "AMD Quality",              key: "amdScore",            threshold: 55,  exceptional: 75,  inverted: false, weight: 0.12 },
  { name: "Confirmation Quality",     key: "confirmationQuality", threshold: 60,  exceptional: 80,  inverted: false, weight: 0.12 },
  { name: "Setup Score",              key: "setupScore",          threshold: 60,  exceptional: 80,  inverted: false, weight: 0.12 },
  { name: "TQI",                      key: "tqi",                 threshold: 55,  exceptional: 75,  inverted: false, weight: 0.12 },
  { name: "Risk/Reward Ratio",        key: "rrPlanned",           threshold: 1.5, exceptional: 3.0, inverted: false, weight: 0.10 },
  { name: "Spread (pips)",            key: "spreadPips",          threshold: 3.0, exceptional: 1.0, inverted: true,  weight: 0.06 },
];

export const MIN_EVIDENCE_FOR_REASONING = 5;
export const HIGH_CONFIDENCE_EVIDENCE   = 20;
export const STRONG_WIN_RATE            = 0.60;
export const EXCELLENT_WIN_RATE         = 0.70;

// ─── Reliability rating ───────────────────────────────────────────────────────

export function evidenceToReliability(n: number): string {
  if (n < MIN_EVIDENCE_FOR_REASONING) return "insufficient";
  if (n < 10) return "low";
  if (n < HIGH_CONFIDENCE_EVIDENCE) return "moderate";
  return "high";
}

export function scoreToTier(score: number): StrengthTier {
  if (score >= 85) return "exceptional";
  if (score >= 65) return "strong";
  if (score >= 45) return "moderate";
  if (score >= 25) return "weak";
  return "insufficient";
}

// ─── Session & regime favourability ──────────────────────────────────────────

export const SESSION_SCORES: Record<string, number> = {
  overlap:   95,
  london:    85,
  new_york:  80,
  asian:     55,
  off_hours: 30,
};

export const REGIME_SCORES: Record<string, number> = {
  trending:        90,
  ranging:         65,
  volatile:        50,
  low_volatility:  40,
};

export const VOLATILITY_SCORES: Record<string, number> = {
  high:    60,
  medium:  85,
  low:     55,
  extreme: 30,
};

// ─── Pair tier scoring ────────────────────────────────────────────────────────

export const PAIR_TIER_SCORES: Record<string, number> = {
  EURUSD: 95, GBPUSD: 90, USDJPY: 90, USDCHF: 80,
  AUDUSD: 80, USDCAD: 80, NZDUSD: 75, EURJPY: 85,
  GBPJPY: 80, EURGBP: 75, AUDJPY: 70, XAUUSD: 85,
};

export function getPairScore(pair: string): number {
  return PAIR_TIER_SCORES[pair.toUpperCase()] ?? 65;
}

export { type ExtractedFeature };
