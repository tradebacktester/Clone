export type EnvironmentClass = "excellent" | "good" | "neutral" | "difficult" | "dangerous";
export type StabilityLabel = "very_stable" | "stable" | "unstable" | "very_unstable";
export type OutcomeLabel = "profitable" | "losing" | "neutral" | "unknown";

export interface ConditionStats {
  dimension: string;
  condition: string;
  sampleSize: number;
  winRate: number;
  lossRate: number;
  avgRR: number;
  profitFactor: number;
  expectancy: number;
  maxDrawdown: number;
  confidenceScore: number;
}

export interface MCSComponent {
  name: string;
  dimension: string;
  condition: string;
  score: number;
  weight: number;
  weightedScore: number;
  evidence: string;
  sampleSize: number;
  confidence: number;
}

export interface MarketContextScore {
  score: number;
  label: EnvironmentClass;
  components: MCSComponent[];
  totalWeightedScore: number;
  confidence: number;
  sampleSize: number;
  timestamp: string;
  evidence: string[];
}

export interface HistoricalMatch {
  id: string;
  date: string;
  pair: string;
  regime: string;
  trendDirection: string;
  volatilityClassification: string;
  session: string;
  similarityScore: number;
  outcome: OutcomeLabel;
  confidence: number;
}

export interface StabilityMeasure {
  name: string;
  score: number;
  trend: "improving" | "deteriorating" | "stable";
  warning: boolean;
  detail: string;
}

export interface StabilityAnalysis {
  overallStability: number;
  label: StabilityLabel;
  regime: StabilityMeasure;
  trend: StabilityMeasure;
  volatility: StabilityMeasure;
  liquidity: StabilityMeasure;
  warnings: string[];
  timestamp: string;
}

export interface ContextHistory {
  timestamp: string;
  pair: string;
  score: number;
  label: EnvironmentClass;
  regime: string;
  trendDirection: string;
  volatilityClassification: string;
  session: string;
}

export interface MarketContextAnalysis {
  pair: string;
  timestamp: string;
  mcs: MarketContextScore;
  stability: StabilityAnalysis;
  classification: EnvironmentClass;
  classificationEvidence: string[];
  performanceByDimension: ConditionStats[];
  summary: string;
}

export interface TradeRecord {
  id: number;
  pair: string;
  direction: string;
  session: string;
  regime: string | null;
  newsStatus: string | null;
  spreadPips: number;
  pnl: number;
  riskRewardRatio: number;
  isWin: boolean;
  isLoss: boolean;
  openedAt: Date;
  closedAt: Date | null;
  trendDirection?: string | null;
  volatilityClass?: string | null;
  liquidityQuality?: string | null;
  correlationRisk?: string | null;
}

export interface SnapshotRecord {
  id: string;
  pair: string;
  session: string;
  trendDirection: string;
  trendStrength: number;
  regime: string;
  regimeConfidence: number;
  volatilityClassification: string;
  volatilityPercentile: number;
  liquidityQuality: string;
  liquidityScore: number;
  correlationRisk: string;
  newsEnvironment: string;
  confidenceScore: number;
  createdAt: Date | null;
}

export const MCS_WEIGHTS = {
  regime: 0.20,
  session: 0.15,
  trend: 0.15,
  volatility: 0.15,
  liquidity: 0.10,
  correlation: 0.10,
  news: 0.10,
  historicalConfidence: 0.05,
} as const;

export const ENVIRONMENT_THRESHOLDS = {
  excellent: 80,
  good: 65,
  neutral: 45,
  difficult: 30,
} as const;

export const MIN_SAMPLE_FOR_SCORE = 5;
export const MIN_SAMPLE_FOR_CONFIDENCE = 20;
export const STABILITY_WINDOW = 20;
