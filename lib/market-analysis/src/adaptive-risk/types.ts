// ─── Adaptive Risk Intelligence Engine — Types ────────────────────────────────
// Advisory only. Risk management adaptation ONLY.

export const ARI_ENGINE_VERSION = "1.0.0";

// ─── Risk Profiles ────────────────────────────────────────────────────────────

export type RiskProfile =
  | "conservative"
  | "balanced"
  | "aggressive"
  | "observation"
  | "recovery"
  | "emergency";

export const RISK_PROFILE_LABELS: Record<RiskProfile, string> = {
  conservative: "Conservative",
  balanced:     "Balanced",
  aggressive:   "Aggressive",
  observation:  "Observation Mode",
  recovery:     "Recovery Mode",
  emergency:    "Emergency Mode",
};

export const RISK_PROFILE_ORDER: RiskProfile[] = [
  "emergency", "observation", "recovery", "conservative", "balanced", "aggressive",
];

// ─── Environment Dimensions ───────────────────────────────────────────────────

export type MarketRegimeEnv = "trending" | "ranging" | "volatile" | "low_volatility" | "transition" | "expansion" | "compression";
export type VolatilityLevel = "low" | "normal" | "high" | "extreme";
export type LiquidityLevel  = "high" | "medium" | "low";
export type SessionEnv      = "london" | "new_york" | "asian" | "overlap" | "off_hours";
export type MarketCondition = "trending_high_momentum" | "trending_low_momentum" | "ranging_stable" | "ranging_unstable" | "news_driven" | "normal";

// ─── Performance Stats for an Environment ────────────────────────────────────

export interface EnvironmentStats {
  environment:    string;
  environmentKey: string;
  sampleSize:     number;
  winRate:        number;     // 0-1
  expectancy:     number;     // in R
  avgRR:          number;
  avgPnl:         number;
  totalPnl:       number;
  maxDrawdown:    number;     // %
  sharpeProxy:    number;
  profitFactor:   number;
  volatilityScore: number;   // coefficient of variation
  confidenceScore: number;   // 0-100
  riskRating:     "favorable" | "neutral" | "unfavorable" | "avoid";
  riskScore:      number;    // 0-100 (higher = safer)
  breakdown:      Record<string, number>;
}

// ─── Trade Record (input for learning) ───────────────────────────────────────

export interface TradeRecord {
  id:          string | number;
  pair:        string;
  direction:   "buy" | "sell";
  pnl:         number;
  riskPercent: number;
  riskRewardRatio: number;
  session:     string;
  regime:      string;
  openedAt:    Date | string;
  closedAt:    Date | string;
  pips?:       number;
  lotSize?:    number;
  amdPhase?:   string;
}

// ─── Market Context (current state) ──────────────────────────────────────────

export interface MarketContext {
  pair:            string;
  session:         SessionEnv;
  regime:          MarketRegimeEnv;
  volatilityLevel: VolatilityLevel;
  liquidityLevel:  LiquidityLevel;
  condition:       MarketCondition;
  volatilityScore: number;    // 0-100
  liquidityScore:  number;    // 0-100
  trendStrength:   number;    // 0-100
  newsRisk:        number;    // 0-100
}

// ─── Dynamic Risk Parameters ──────────────────────────────────────────────────

export interface RiskParameters {
  maxRiskPerTrade:        number;  // %
  maxOpenTrades:          number;
  maxPairExposure:        number;  // %
  maxCorrelationExposure: number;  // %
  dailyRiskBudget:        number;  // %
  weeklyRiskBudget:       number;  // %
  positionSizeMultiplier: number;  // multiplier on base size
  exposureMultiplier:     number;  // multiplier on base exposure
}

// Profile parameter presets
export const PROFILE_PARAMS: Record<RiskProfile, RiskParameters> = {
  conservative: {
    maxRiskPerTrade: 0.5, maxOpenTrades: 2, maxPairExposure: 1.0,
    maxCorrelationExposure: 2.0, dailyRiskBudget: 1.5, weeklyRiskBudget: 4.0,
    positionSizeMultiplier: 0.5, exposureMultiplier: 0.5,
  },
  balanced: {
    maxRiskPerTrade: 1.0, maxOpenTrades: 3, maxPairExposure: 2.0,
    maxCorrelationExposure: 4.0, dailyRiskBudget: 3.0, weeklyRiskBudget: 7.0,
    positionSizeMultiplier: 1.0, exposureMultiplier: 1.0,
  },
  aggressive: {
    maxRiskPerTrade: 1.5, maxOpenTrades: 4, maxPairExposure: 3.0,
    maxCorrelationExposure: 6.0, dailyRiskBudget: 4.5, weeklyRiskBudget: 10.0,
    positionSizeMultiplier: 1.3, exposureMultiplier: 1.3,
  },
  observation: {
    maxRiskPerTrade: 0.25, maxOpenTrades: 1, maxPairExposure: 0.5,
    maxCorrelationExposure: 1.0, dailyRiskBudget: 0.5, weeklyRiskBudget: 1.5,
    positionSizeMultiplier: 0.25, exposureMultiplier: 0.25,
  },
  recovery: {
    maxRiskPerTrade: 0.35, maxOpenTrades: 1, maxPairExposure: 0.75,
    maxCorrelationExposure: 1.5, dailyRiskBudget: 1.0, weeklyRiskBudget: 2.5,
    positionSizeMultiplier: 0.35, exposureMultiplier: 0.35,
  },
  emergency: {
    maxRiskPerTrade: 0.1, maxOpenTrades: 0, maxPairExposure: 0.25,
    maxCorrelationExposure: 0.5, dailyRiskBudget: 0.2, weeklyRiskBudget: 0.5,
    positionSizeMultiplier: 0.1, exposureMultiplier: 0.1,
  },
};

// Safety upper limits that can never be exceeded regardless of profile
export const ABSOLUTE_SAFETY_LIMITS: RiskParameters = {
  maxRiskPerTrade: 2.0, maxOpenTrades: 5, maxPairExposure: 4.0,
  maxCorrelationExposure: 8.0, dailyRiskBudget: 6.0, weeklyRiskBudget: 12.0,
  positionSizeMultiplier: 2.0, exposureMultiplier: 2.0,
};

// Minimum sample required before issuing a confident recommendation
export const MIN_SAMPLE_SIZE = 10;
export const MIN_CONFIDENT_SAMPLE = 30;

// ─── Confidence Result ────────────────────────────────────────────────────────

export interface ConfidenceResult {
  score:                  number;   // 0-100
  label:                  "very_high" | "high" | "moderate" | "low" | "very_low" | "insufficient";
  sampleSize:             number;
  statisticalSignificance: number;  // 0-1
  reliabilityRating:      "institutional" | "strong" | "moderate" | "weak" | "insufficient";
  hasMinimumEvidence:     boolean;
}

// ─── Evidence Item ────────────────────────────────────────────────────────────

export interface EvidenceItem {
  dimension:    string;       // "regime" | "volatility" | "session" | "pair" | "condition"
  key:          string;
  stat:         string;       // human-readable stat
  value:        number;
  riskRating:   string;
  sampleSize:   number;
  weight:       number;       // 0-1
}

// ─── Profile Recommendation ───────────────────────────────────────────────────

export interface ProfileRecommendation {
  recommendedProfile:      RiskProfile;
  recommendedProfileLabel: string;
  previousProfile:         RiskProfile | null;
  profileChanged:          boolean;

  parameters:    RiskParameters;
  confidence:    ConfidenceResult;

  primaryReason:     string;
  supportingReasons: string[];
  riskFactors:       string[];
  expectedBenefits:  string[];
  potentialRisks:    string[];

  marketContext:     MarketContext;
  evidence:          EvidenceItem[];
  explainability:    ProfileExplainability;
  historicalEvidence: EnvironmentStats[];
}

// ─── Explainability ───────────────────────────────────────────────────────────

export interface ProfileExplainability {
  whyThisProfile:      string;
  historicalSupport:   string;
  marketInfluences:    string[];
  expectedBenefits:    string;
  potentialRisks:      string;
  safetyMechanisms:    string[];
  reviewedAt:          string;
  engineVersion:       string;
}

// ─── Adaptation Event ─────────────────────────────────────────────────────────

export interface AdaptationEvent {
  eventId:      string;
  occurredAt:   string;
  fromProfile:  RiskProfile | null;
  toProfile:    RiskProfile;
  changeReason: string;
  changeType:   "escalation" | "de-escalation" | "maintenance" | "initial";
  marketContext: MarketContext;
  confidenceScore: number;
  sampleSize:   number;
  supportingEvidence: EvidenceItem[];
}

// ─── Market Analysis Result ───────────────────────────────────────────────────

export interface MarketAnalysisResult {
  currentContext:      MarketContext;
  regimeStats:         EnvironmentStats | null;
  volatilityStats:     EnvironmentStats | null;
  sessionStats:        EnvironmentStats | null;
  liquidityStats:      EnvironmentStats | null;
  conditionStats:      EnvironmentStats | null;
  pairStats:           EnvironmentStats | null;

  overallRiskScore:    number;    // 0-100 (higher = safer)
  favorabilityLabel:   string;
  topRiskFactors:      string[];
  topOpportunities:    string[];
}

// ─── Full Adaptive Risk Report ────────────────────────────────────────────────

export interface AdaptiveRiskReport {
  reportId:      string;
  engineVersion: string;
  generatedAt:   string;
  isAdvisoryOnly: true;

  recommendation:  ProfileRecommendation;
  marketAnalysis:  MarketAnalysisResult;
  allEnvironmentStats: EnvironmentStats[];

  summary: {
    profileName:       string;
    confidence:        number;
    sampleSize:        number;
    topReason:         string;
    safeToTrade:       boolean;
    reduceExposure:    boolean;
    observationMode:   boolean;
  };
}

// ─── Run input ────────────────────────────────────────────────────────────────

export interface RunAriInput {
  trades:        TradeRecord[];
  context:       MarketContext;
  currentProfile?: RiskProfile;
  userSafetyLimits?: Partial<RiskParameters>;
}
