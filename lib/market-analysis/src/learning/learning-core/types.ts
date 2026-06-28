// ─── Learning Engine Types ─────────────────────────────────────────────────
// All shared type definitions for the Learning Engine.
// Advisory only — no trade execution, no strategy modification.

export type Pair = "EURUSD" | "GBPUSD" | "USDJPY";
export type Session = "london" | "new_york" | "asian" | "unknown";
export type MarketRegime = "trending" | "ranging" | "volatile" | "low_volatility" | "unknown";
export type TradeOutcome = "win" | "loss" | "break_even";
export type ZoneType = "supply" | "demand" | "unknown";
export type AmdPattern = "accumulation" | "manipulation" | "distribution" | "unknown";
export type VolatilityLevel = "low" | "medium" | "high";
export type TrendDirection = "bullish" | "bearish" | "ranging";
export type CertificationLevel = "none" | "development" | "staging" | "production";

// ─── Raw Learning Input ────────────────────────────────────────────────────
// Minimal shape the pipeline needs from each memory source.
// Collected before feature extraction.

export interface RawTradeRecord {
  id: number | string;
  pair: string;
  direction: string;
  session: string;
  regime?: string | null;
  regimeConfidence?: number | null;
  zoneScore?: number | null;
  liquidityScore?: number | null;
  amdScore?: number | null;
  confirmationScore?: number | null;
  finalScore?: number | null;
  confidence?: number | null;
  zoneType?: string | null;
  amdPattern?: string | null;
  riskRewardPlanned?: number | null;
  riskRewardActual?: number | null;
  slippagePips?: number | null;
  outcome?: string | null;
  pnl?: number | null;
  pnlPercent?: number | null;
  timeInTradeMins?: number | null;
  openedAt: Date | string;
  closedAt?: Date | string | null;
  spreadPips?: number | null;
  setupScore?: number | null;
  tqi?: number | null;
}

export interface RawSkippedSetup {
  id: number | string;
  pair: string;
  session: string;
  regime?: string | null;
  zoneScore?: number | null;
  liquidityScore?: number | null;
  amdScore?: number | null;
  confirmationScore?: number | null;
  rejectingRule?: string | null;
  rejectionReason?: string | null;
  createdAt: Date | string;
}

export interface RawManualReview {
  id: number | string;
  tradeId?: number | null;
  rating?: number | null;
  notes?: string | null;
  followedRules?: boolean | null;
  reviewedAt?: Date | string | null;
}

// ─── Extracted Feature ─────────────────────────────────────────────────────
// Normalised, typed feature set per trade — stored separately for future ML.

export interface ExtractedFeature {
  tradeId: string;                   // string(id) for uniform keying
  pair: Pair;
  session: Session;
  trend: TrendDirection;
  marketRegime: MarketRegime;
  supplyQuality: number;             // 0–100 (zone score when direction=sell)
  demandQuality: number;             // 0–100 (zone score when direction=buy)
  liquidityScore: number;            // 0–100
  amdScore: number;                  // 0–100
  confirmationQuality: number;       // 0–100
  tradeDurationMins: number;
  spreadPips: number;
  volatility: VolatilityLevel;       // derived from regime + regimeConfidence
  riskPct: number;                   // dynamic risk % (0 if unknown)
  rrPlanned: number;
  rrActual: number;
  outcome: TradeOutcome;
  pnl: number;
  pnlPercent: number;
  setupScore: number;                // finalScore 0–100
  confidence: number;                // model confidence 0–100
  tqi: number;                       // Trade Quality Index 0–100
  openedAt: Date;
  closedAt: Date | null;
}

// ─── Validation ────────────────────────────────────────────────────────────

export interface ValidationIssue {
  field: string;
  message: string;
  severity: "error" | "warning" | "info";
}

export interface DataValidationResult {
  isValid: boolean;
  totalRecords: number;
  usableRecords: number;
  rejectedRecords: number;
  completenessScore: number;          // 0–100
  issues: ValidationIssue[];
  qualityNotes: string[];
}

// ─── Learning Metrics ──────────────────────────────────────────────────────

export interface SegmentMetrics {
  label: string;
  totalTrades: number;
  wins: number;
  losses: number;
  breakEvens: number;
  winRate: number;                    // 0–1
  lossRate: number;                   // 0–1
  avgRR: number;
  avgDurationMins: number;
  profitFactor: number;
  expectancy: number;                 // in pips or pnl units
  totalPnl: number;
}

export interface LearningMetrics {
  // Aggregate
  totalTrades: number;
  wins: number;
  losses: number;
  breakEvens: number;
  winRate: number;                    // 0–1
  lossRate: number;                   // 0–1
  avgRR: number;
  avgWin: number;                     // avg winning pnl
  avgLoss: number;                    // avg losing pnl (positive magnitude)
  avgDurationMins: number;
  profitFactor: number;
  expectancy: number;
  maxDrawdownPct: number;             // peak-to-trough %
  recoveryFactor: number;             // totalPnl / |maxDrawdown|
  sharpeRatio: number;
  sortinoRatio: number;
  totalPnl: number;
  grossProfit: number;
  grossLoss: number;                  // positive magnitude

  // Dimensional breakdowns
  byPair: Record<string, SegmentMetrics>;
  bySession: Record<string, SegmentMetrics>;
  byRegime: Record<string, SegmentMetrics>;
  byZoneQuality: Record<string, SegmentMetrics>;    // "low"|"medium"|"high"
  byLiquidity: Record<string, SegmentMetrics>;
  byAmd: Record<string, SegmentMetrics>;
  byConfirmation: Record<string, SegmentMetrics>;
  byVolatility: Record<string, SegmentMetrics>;

  // Distributions
  confidenceDistribution: HistogramBin[];           // confidence 0–100
  rrDistribution: HistogramBin[];
  durationDistribution: HistogramBin[];
}

export interface HistogramBin {
  label: string;
  min: number;
  max: number;
  count: number;
  winRate: number;
}

// ─── Statistical Analysis ──────────────────────────────────────────────────

export interface CorrelationResult {
  featureA: string;
  featureB: string;
  pearsonR: number;                   // –1 to +1
  sampleSize: number;
  significant: boolean;               // |r| > 0.3 && n >= 10
}

export interface DistributionStats {
  feature: string;
  count: number;
  mean: number;
  median: number;
  stdDev: number;
  min: number;
  max: number;
  p25: number;
  p75: number;
  skewness: number;
}

export interface StatisticalAnalysis {
  distributions: DistributionStats[];
  correlations: CorrelationResult[];
  skippedSetupInsights: SkippedSetupInsight;
  reviewInsights: ReviewInsight;
}

export interface SkippedSetupInsight {
  totalSkipped: number;
  byRejectingRule: Record<string, number>;
  byPair: Record<string, number>;
  avgScores: { zone: number; liquidity: number; amd: number; confirmation: number };
}

export interface ReviewInsight {
  totalReviewed: number;
  avgRating: number;
  ruleAdherenceRate: number;          // % of reviews where followedRules=true
}

// ─── Confidence Engine ─────────────────────────────────────────────────────

export interface ConfidenceFactor {
  name: string;
  value: number;                      // 0–1
  weight: number;                     // 0–1 (weights sum to 1)
  explanation: string;
}

export interface SegmentConfidence {
  label: string;
  sampleSize: number;
  observedSuccessRate: number;        // raw win rate
  wilsonLowerBound: number;           // conservative lower estimate
  dataQualityFactor: number;          // 0–1 based on completeness
  consistencyFactor: number;          // 0–1 based on std across segments
  finalConfidence: number;            // 0–100 composite
  confidenceTier: "insufficient" | "low" | "moderate" | "high" | "very_high";
  factors: ConfidenceFactor[];
  explanation: string;
}

export interface ConfidenceReport {
  overallConfidence: number;           // 0–100
  overallTier: "insufficient" | "low" | "moderate" | "high" | "very_high";
  minSampleReached: boolean;
  byPair: Record<string, SegmentConfidence>;
  bySession: Record<string, SegmentConfidence>;
  byRegime: Record<string, SegmentConfidence>;
  byAmdPattern: Record<string, SegmentConfidence>;
  dataQuality: number;                 // 0–100 from validator
  sampleSize: number;
  methodology: string;                 // plain-text explanation
}

// ─── Recommendations ────────────────────────────────────────────────────────
// Advisory only — stored to DB, never applied automatically.

export type RecommendationCategory =
  | "pair_performance"
  | "session_timing"
  | "regime_filter"
  | "score_threshold"
  | "data_quality"
  | "sample_size";

export interface LearningRecommendation {
  id: string;                          // uuid
  category: RecommendationCategory;
  title: string;
  description: string;
  evidence: string;                    // statistical backing
  confidence: number;                  // 0–100 (inherited from segment)
  priority: "low" | "medium" | "high";
  isAdvisoryOnly: true;                // always true — no auto-apply
}

// ─── Learning Cycle ─────────────────────────────────────────────────────────

export interface LearningCycleInput {
  trades: RawTradeRecord[];
  skippedSetups: RawSkippedSetup[];
  manualReviews: RawManualReview[];
  triggeredBy: "manual" | "scheduled";
  dataRangeFrom?: Date;
  dataRangeTo?: Date;
}

export interface LearningCycle {
  id: string;                          // uuid
  version: string;                     // "1.0.0" — semver, never decremented
  cycleNumber: number;                 // monotonically increasing
  status: "running" | "complete" | "failed";
  triggeredBy: "manual" | "scheduled";
  startedAt: Date;
  completedAt: Date | null;
  durationMs: number | null;
  dataRangeFrom: Date | null;
  dataRangeTo: Date | null;
  sampleSize: number;
  validation: DataValidationResult;
  features: ExtractedFeature[];
  metrics: LearningMetrics | null;
  statisticalAnalysis: StatisticalAnalysis | null;
  confidence: ConfidenceReport | null;
  recommendations: LearningRecommendation[];
  validationStatus: "passed" | "degraded" | "failed";
  errorMessage: string | null;
}

// ─── Pipeline Result ────────────────────────────────────────────────────────

export interface PipelineResult {
  cycle: LearningCycle;
  durationMs: number;
  stagesCompleted: string[];
  stagesFailed: string[];
}
