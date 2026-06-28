// ─── Feature Importance Engine Types ──────────────────────────────────────────
// Advisory only — no trade execution, no strategy modification.
// All conclusions are evidence-backed and reproducible.

// ─── Feature Definitions ──────────────────────────────────────────────────────

export type FeatureId =
  | "supply_zone_quality"
  | "demand_zone_quality"
  | "premium_discount_position"
  | "liquidity_sweep_strength"
  | "amd_quality"
  | "confirmation_candle_quality"
  | "htf_alignment"
  | "trend_direction"
  | "market_regime"
  | "session"
  | "volatility"
  | "spread"
  | "news_distance"
  | "risk_reward_ratio"
  | "trade_duration"
  | "position_size"
  | "correlation_exposure";

export type FeatureCategory = "zone" | "execution" | "context" | "risk";
export type FeatureDataType = "numeric" | "categorical";
export type ConfidenceTier = "insufficient" | "low" | "moderate" | "high" | "very_high";
export type ReliabilityRating = "institutional" | "strong" | "moderate" | "weak" | "insufficient";
export type ConfidenceTrendDirection = "improving" | "stable" | "declining" | "unknown";
export type OverfittingRisk = "none" | "low" | "medium" | "high";

// ─── Feature Metadata ─────────────────────────────────────────────────────────

export interface FeatureDefinition {
  id: FeatureId;
  displayName: string;
  category: FeatureCategory;
  description: string;
  dataType: FeatureDataType;
  /** For numeric features: bucket thresholds [low_max, medium_max] */
  thresholds?: [number, number];
  /** For categorical features: expected value labels */
  categories?: string[];
}

export const FEATURE_DEFINITIONS: FeatureDefinition[] = [
  {
    id: "supply_zone_quality",
    displayName: "Supply Zone Quality",
    category: "zone",
    description: "Quality score of the supply zone at trade entry (0–100)",
    dataType: "numeric",
    thresholds: [40, 70],
  },
  {
    id: "demand_zone_quality",
    displayName: "Demand Zone Quality",
    category: "zone",
    description: "Quality score of the demand zone at trade entry (0–100)",
    dataType: "numeric",
    thresholds: [40, 70],
  },
  {
    id: "premium_discount_position",
    displayName: "Premium / Discount Position",
    category: "zone",
    description: "Whether price is in premium (above 50% range) or discount (below 50% range)",
    dataType: "categorical",
    categories: ["premium", "discount", "equilibrium"],
  },
  {
    id: "liquidity_sweep_strength",
    displayName: "Liquidity Sweep Strength",
    category: "execution",
    description: "Strength of the liquidity sweep before the entry (0–100)",
    dataType: "numeric",
    thresholds: [35, 65],
  },
  {
    id: "amd_quality",
    displayName: "AMD Quality",
    category: "execution",
    description: "Accumulation/Manipulation/Distribution pattern quality score (0–100)",
    dataType: "numeric",
    thresholds: [40, 70],
  },
  {
    id: "confirmation_candle_quality",
    displayName: "Confirmation Candle Quality",
    category: "execution",
    description: "Quality of the confirmation candle at entry (0–100)",
    dataType: "numeric",
    thresholds: [40, 70],
  },
  {
    id: "htf_alignment",
    displayName: "Higher Timeframe Alignment",
    category: "context",
    description: "Multi-timeframe confluence score (0–100)",
    dataType: "numeric",
    thresholds: [40, 70],
  },
  {
    id: "trend_direction",
    displayName: "Trend Direction",
    category: "context",
    description: "Direction of the prevailing trend at trade time",
    dataType: "categorical",
    categories: ["bullish", "bearish", "ranging"],
  },
  {
    id: "market_regime",
    displayName: "Market Regime",
    category: "context",
    description: "Market regime classification at trade time",
    dataType: "categorical",
    categories: ["trending", "ranging", "volatile", "low_volatility"],
  },
  {
    id: "session",
    displayName: "Session",
    category: "context",
    description: "Trading session at trade open",
    dataType: "categorical",
    categories: ["london", "new_york", "asian", "unknown"],
  },
  {
    id: "volatility",
    displayName: "Volatility",
    category: "context",
    description: "Volatility level at trade time",
    dataType: "categorical",
    categories: ["low", "medium", "high"],
  },
  {
    id: "spread",
    displayName: "Spread",
    category: "execution",
    description: "Bid-ask spread in pips at entry",
    dataType: "numeric",
    thresholds: [1, 2.5],
  },
  {
    id: "news_distance",
    displayName: "News Distance",
    category: "context",
    description: "Hours to nearest high-impact news event (derived from news calendar)",
    dataType: "numeric",
    thresholds: [1, 4],
  },
  {
    id: "risk_reward_ratio",
    displayName: "Risk:Reward Ratio",
    category: "risk",
    description: "Planned risk-to-reward ratio at entry",
    dataType: "numeric",
    thresholds: [1.5, 3],
  },
  {
    id: "trade_duration",
    displayName: "Trade Duration",
    category: "execution",
    description: "Time in trade (minutes)",
    dataType: "numeric",
    thresholds: [30, 240],
  },
  {
    id: "position_size",
    displayName: "Position Size",
    category: "risk",
    description: "Risk percentage of account at entry",
    dataType: "numeric",
    thresholds: [0.5, 1.5],
  },
  {
    id: "correlation_exposure",
    displayName: "Correlation Exposure",
    category: "risk",
    description: "Degree of correlated open positions at entry (TQI proxy)",
    dataType: "numeric",
    thresholds: [30, 60],
  },
];

// ─── Bucket Stats ─────────────────────────────────────────────────────────────

export interface BucketStats {
  label: string;
  sampleSize: number;
  wins: number;
  losses: number;
  breakEvens: number;
  winRate: number;           // 0–1
  lossRate: number;          // 0–1
  avgRR: number;
  avgProfit: number;
  avgLoss: number;
  totalPnl: number;
}

// ─── Feature Importance Result ────────────────────────────────────────────────

export interface FeatureImportanceResult {
  featureId: FeatureId;
  displayName: string;
  category: FeatureCategory;
  description: string;
  dataType: FeatureDataType;

  // Core stats (aggregate across all values)
  sampleSize: number;
  wins: number;
  losses: number;
  breakEvens: number;
  winRate: number;           // 0–1
  lossRate: number;          // 0–1
  avgRR: number;
  avgProfit: number;
  avgLoss: number;

  // Statistical
  statisticalSignificance: number;   // 0–1
  pValue: number;
  correlationCoeff: number;          // point-biserial or Cramér's V

  // Derived scores (0–100)
  predictiveValue: number;
  reliabilityScore: number;
  confidenceScore: number;

  // Evidence quality
  isInsufficient: boolean;
  insufficientReason?: string;
  hasContradiction: boolean;
  contradictionNote?: string;
  isUnstable: boolean;
  instabilityNote?: string;
  overfittingRisk: OverfittingRisk;

  // Explainability
  confidenceExplanation: string;
  confidenceTrend: ConfidenceTrendDirection;
  reliabilityRating: ReliabilityRating;
  confidenceTier: ConfidenceTier;

  // Breakdown by bucket/category
  bucketBreakdown: BucketStats[];
  supportingTradeIds: string[];
}

// ─── Feature Interaction ──────────────────────────────────────────────────────

export interface InteractionDefinition {
  featureA: FeatureId;
  featureB: FeatureId;
  displayName: string;
  description: string;
  /** Value to match for featureA to be "active" */
  conditionA: FeatureCondition;
  conditionB: FeatureCondition;
}

export interface FeatureCondition {
  type: "bucket" | "category";
  /** For bucket: "high" | "medium" | "low"; for category: the value string */
  value: string;
}

export interface InteractionResult {
  interactionId: string;                     // "featureA::featureB"
  featureA: FeatureId;
  featureB: FeatureId;
  displayName: string;
  description: string;

  sampleSize: number;
  wins: number;
  losses: number;
  winRate: number;
  avgRR: number;
  avgProfit: number;

  // Individual baselines for comparison
  baselineWinRateA: number;
  baselineWinRateB: number;
  combinedBaseline: number;                  // geometric mean

  liftVsFeatureA: number;                    // ratio: interaction / featureA alone
  liftVsFeatureB: number;
  synergyScore: number;                      // 0–100
  isSynergistic: boolean;

  statisticalSignificance: number;
  isInsufficient: boolean;
  insufficientReason?: string;

  breakdown: BucketStats[];
}

// ─── Confidence Learning ──────────────────────────────────────────────────────

export interface FeatureConfidenceState {
  featureId: FeatureId;
  cycleId: string;
  snapshotDate: Date;
  confidenceScore: number;     // 0–100
  reliabilityScore: number;    // 0–100
  predictiveValue: number;     // 0–100
  sampleSize: number;
  winRate: number;
  trendDirection: ConfidenceTrendDirection;
  isInsufficient: boolean;
}

// ─── Validation Flags ─────────────────────────────────────────────────────────

export interface ValidationFlags {
  isInsufficient: boolean;
  insufficientReason?: string;
  hasContradiction: boolean;
  contradictionNote?: string;
  isUnstable: boolean;
  instabilityNote?: string;
  overfittingRisk: OverfittingRisk;
}

// ─── Analysis Cycle ───────────────────────────────────────────────────────────

export interface FiAnalysisCycle {
  cycleId: string;
  version: string;
  status: "running" | "complete" | "failed";
  triggeredBy: "manual" | "scheduled";
  startedAt: Date;
  completedAt: Date | null;
  durationMs: number | null;
  sampleSize: number;
  features: FeatureImportanceResult[];
  interactions: InteractionResult[];
  rankings: FeatureRanking[];
  overallConfidence: number;
  validationPassed: boolean;
  validationNotes: string[];
  errorMessage: string | null;
}

// ─── Feature Rankings ─────────────────────────────────────────────────────────

export interface FeatureRanking {
  rank: number;
  featureId: FeatureId;
  displayName: string;
  category: FeatureCategory;
  predictiveValue: number;
  confidenceScore: number;
  reliabilityScore: number;
  sampleSize: number;
  winRate: number;
  isInsufficient: boolean;
  reliabilityRating: ReliabilityRating;
}

// ─── Report Output ─────────────────────────────────────────────────────────────

export interface FeatureImportanceReport {
  generatedAt: Date;
  version: string;
  sampleSize: number;
  totalFeaturesAnalyzed: number;
  sufficientFeatures: number;
  markdownContent: string;
  topFeatures: FeatureRanking[];
  weakestFeatures: FeatureRanking[];
  bestInteractions: InteractionResult[];
  overallConfidence: number;
  methodology: string;
}

// ─── Engine Constants ─────────────────────────────────────────────────────────

export const FI_ENGINE_VERSION = "1.0.0";
export const MIN_SAMPLE_SIZE = 5;
export const SUFFICIENT_SAMPLE_SIZE = 30;
export const SYNERGY_THRESHOLD = 1.1;          // 10% lift = synergistic
export const MIN_INTERACTION_SAMPLE = 3;
