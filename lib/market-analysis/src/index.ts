export * from "./types.js";
export * from "./memory/index.js";
export * from "./data/fetcher.js";
export { startPipeline, getPipelineStatus, getLatestResult, loadLatestResultFromDisk } from "./production-readiness/index.js";
export type { PipelineResult, PipelineStatus, StageResult, CategoryScores, Finding } from "./production-readiness/index.js";
export type { IMarketDataProvider, FetchResult, CacheStatus, DateRange, HistoricalCandle } from "./historical/index.js";
export { BAR_MS, expectedBarCount, emptyResult } from "./historical/index.js";
export { YahooFinanceProvider, DukascopyProvider, HistDataProvider, OANDAProvider, MT5CsvProvider, LocalCsvProvider, ProviderRegistry, createDefaultRegistry } from "./historical/index.js";
export type { ProviderStatus } from "./historical/index.js";
export { getCachedCandles, cacheCandles, getCacheStatus, isCacheValid } from "./historical/index.js";
export type { DataQualityScore, DataGrade } from "./historical/index.js";
export { computeDataQuality, formatQualityBlock } from "./historical/index.js";
export type { TradeResult, ExtendedMetrics, ReturnBucket } from "./historical/index.js";
export { computeExtendedMetrics } from "./historical/index.js";
export type { BreakdownRow, Breakdowns } from "./historical/index.js";
export { computeBreakdowns, formatBreakdownTable } from "./historical/index.js";
export type { BiasCheck, HistoricalBiasReport, BiasLevel } from "./historical/index.js";
export type { BiasType as HistoricalBiasType } from "./historical/index.js";
export { detectHistoricalBias } from "./historical/index.js";
export type { HistoricalConfig, HistoricalValidationResult, StrategyVsActual } from "./historical/index.js";
export { runHistoricalValidation } from "./historical/index.js";
export { generateHistoricalReport } from "./historical/index.js";
export * from "./analysis/swings.js";
export * from "./analysis/fibonacci.js";

// ─── Pattern Performance (selective — avoids collision with learning-core types)
export type {
  PatternCategory,
  TrendStatus,
  PatternStats,
  PatternEvidence,
  PatternTrend,
  PatternRecord,
  PatternFilter,
  PatternReport,
} from "./learning/pattern-performance/types.js";
export {
  MIN_EVIDENCE_SAMPLE,
  MIN_RELIABLE_SAMPLE,
  MIN_HIGH_CONFIDENCE_SAMPLE,
} from "./learning/pattern-performance/types.js";
export {
  wilsonScore,
  compositeConfidence,
  validateEvidence,
  INSUFFICIENT_MESSAGE,
} from "./learning/pattern-performance/evidence-validator.js";
export {
  analyzeTrend,
} from "./learning/pattern-performance/trend-analyzer.js";
export {
  analyzePatterns,
  computePatternStats,
  qualityTier,
  riskProfile,
  filterPatterns,
  rankPatterns,
  PATTERN_ENGINE_VERSION,
} from "./learning/pattern-performance/pattern-analyzer.js";
export {
  PatternStore,
  patternStore,
} from "./learning/pattern-performance/pattern-store.js";
export {
  generatePatternReport,
} from "./learning/pattern-performance/report-generator.js";
export * from "./analysis/zones.js";
export * from "./analysis/liquidity.js";
export * from "./analysis/amd.js";
export * from "./analysis/regime.js";
export * from "./analysis/sr.js";
export * from "./analysis/confirmation.js";
export * from "./signals/generator.js";
export * from "./signals/finalScore.js";
export * from "./backtest/engine.js";
export * from "./backtest/stats.js";
export * from "./learning/scorer.js";
export * from "./learning/weights.js";

// ─── Learning Engine (selective — avoids re-exporting Pair/Session/MarketRegime
//     which are already in ./types.js) ───────────────────────────────────────
export type {
  RawTradeRecord,
  RawSkippedSetup,
  RawManualReview,
  ExtractedFeature,
  ValidationIssue,
  DataValidationResult,
  SegmentMetrics,
  LearningMetrics,
  HistogramBin,
  CorrelationResult,
  DistributionStats,
  StatisticalAnalysis,
  SkippedSetupInsight,
  ReviewInsight,
  ConfidenceFactor,
  SegmentConfidence,
  ConfidenceReport,
  RecommendationCategory,
  LearningRecommendation,
  LearningCycleInput,
  LearningCycle,
  PipelineResult,
  TradeOutcome,
  ZoneType,
  AmdPattern,
  VolatilityLevel,
  TrendDirection,
  CertificationLevel,
} from "./learning/learning-core/types.js";
export {
  runLearningPipeline,
  buildEmptyCycle,
  LEARNING_ENGINE_VERSION,
} from "./learning/learning-core/pipeline.js";
export {
  validateTrades,
  toNumber as learningToNumber,
  clamp as learningClamp,
  safeDivide as learningSafeDivide,
  MIN_SAMPLE_FOR_PASSED,
  MIN_SAMPLE_FOR_DEGRADED,
} from "./learning/learning-validation/data-validator.js";
export {
  extractFeatures,
  buildFeatureSummary,
} from "./learning/learning-analysis/feature-extractor.js";
export type { FeatureSummary } from "./learning/learning-analysis/feature-extractor.js";
export {
  analyzeStatistics,
  computeDistributions,
  computeCorrelations,
  analyzeSkippedSetups,
  analyzeReviews,
  pearson,
  computeSkewness,
} from "./learning/learning-analysis/statistical-analyzer.js";
export {
  calculateMetrics,
  segmentBy,
  computeDrawdown,
  computeSharpe,
  computeSortino,
  buildHistogram,
  mean as learningMean,
  stdDev as learningStdDev,
  median as learningMedian,
  percentile as learningPercentile,
  qualityBucket,
} from "./learning/learning-metrics/metrics-calculator.js";
export {
  wilsonLowerBound,
  consistencyFactor,
  dataQualityFactor,
  computeSegmentConfidence,
  computeConfidenceReport,
  confidenceTier,
} from "./learning/learning-confidence/confidence-engine.js";
export type { ConfidenceTier } from "./learning/learning-confidence/confidence-engine.js";
export { historyStore } from "./learning/learning-history/history-store.js";
export type { CycleListEntry } from "./learning/learning-history/history-store.js";
export {
  generateRecommendations,
  formatCycleSummary,
  compareCycles,
} from "./learning/learning-reports/report-generator.js";
export type { CycleComparison } from "./learning/learning-reports/report-generator.js";
export * from "./market_regime/volatility_analyzer.js";
export * from "./market_regime/trend_analyzer.js";
export * from "./market_regime/adaptive_weights.js";
export * from "./backtest/montecarlo.js";
export * from "./backtest/walkforward.js";
export * from "./replay/index.js";
export type {
  SimTrade,
  SimStats,
  SensitivityLevel,
  ParameterVariation,
  ParameterSensitivityResult,
  SensitivityAnalysisResult,
  MarketCondition,
  MarketStressScenario,
  MarketStressResult,
  ExecutionImperfection,
  ExecutionStressScenario,
  ExecutionStressResult,
  LosingStreakAnalysis,
  DrawdownRecovery,
  RiskStressResult,
  WFRobustnessResult,
  OOSSplit,
  OOSResult,
  ConfidenceStabilityResult,
  RobustnessScoreBreakdown,
  RobustnessScore,
  RobustnessPipelineConfig,
  RobustnessPipelineResult,
  PipelineStatus as RobustnessPipelineStatus,
} from "./robustness/types.js";
export { runSimulation, runMonteCarlo as runRobustnessMonteCarlo } from "./robustness/simulator.js";
export { MARKET_CONDITION_PROFILES, ALL_CONDITIONS } from "./robustness/candle-gen.js";
export { runParameterSensitivity } from "./robustness/parameter-sensitivity.js";
export { runMarketStressTests } from "./robustness/market-stress.js";
export { runExecutionStressTests } from "./robustness/execution-stress.js";
export { runRiskStressTests } from "./robustness/risk-stress.js";
export { runWalkForwardRobustness } from "./robustness/walk-forward-robustness.js";
export { runOOSValidation } from "./robustness/out-of-sample.js";
export { runConfidenceStability } from "./robustness/confidence-stability.js";
export { computeRobustnessScore } from "./robustness/robustness-score.js";
export {
  runRobustnessPipeline,
  getRobustnessPipelineStatus,
  getLatestRobustnessResult,
} from "./robustness/pipeline.js";
export { generateRobustnessReportMarkdown } from "./robustness/report-generator.js";

// ─── Feature Importance Engine (selective — avoids ConfidenceTier collision) ──
export type {
  FeatureId,
  FeatureCategory,
  FeatureDataType,
  FeatureDefinition,
  BucketStats,
  FeatureImportanceResult,
  InteractionDefinition,
  FeatureCondition,
  InteractionResult,
  FeatureConfidenceState,
  ValidationFlags,
  FiAnalysisCycle,
  FeatureRanking,
  FeatureImportanceReport,
  OverfittingRisk,
  ReliabilityRating,
  ConfidenceTrendDirection,
} from "./learning/feature-importance/types.js";
export {
  FEATURE_DEFINITIONS,
  FI_ENGINE_VERSION,
  MIN_SAMPLE_SIZE,
  SUFFICIENT_SAMPLE_SIZE,
  SYNERGY_THRESHOLD,
  MIN_INTERACTION_SAMPLE,
} from "./learning/feature-importance/types.js";
export {
  calculateFeatureImportance,
  calculateSingleFeature,
} from "./learning/feature-importance/feature-calculator.js";
export {
  analyzeInteractions,
} from "./learning/feature-importance/interaction-analyzer.js";
export {
  computeConfidenceDelta,
  applyConfidenceLearning,
  computeOverallCycleConfidence,
} from "./learning/feature-importance/confidence-learning.js";
export {
  rankFeatures,
  topFeatures,
  weakestFeatures,
  topByConfidence,
  topInteractions,
  summarizeByCategory,
} from "./learning/feature-importance/ranking-engine.js";
export {
  validateFeature,
  validateFeatureSet,
  validateInteractions,
} from "./learning/feature-importance/validator.js";
export { featureImportanceStore } from "./learning/feature-importance/history-store.js";
export { generateFeatureImportanceReport } from "./learning/feature-importance/report-generator.js";

// ─── Decision Intelligence Engine (selective — avoids type collisions) ─────────
export type {
  CurrentSetup,
  TisComponent,
  TisComponentKey,
  RecommendationLevel,
  EvidenceFactor,
  SimilarExperience,
  UncertaintyLevel,
  DiReliabilityRating,
  TradeIntelligenceReport,
  ValidationFlag,
} from "./learning/decision-intelligence/types.js";
export {
  TIS_WEIGHTS,
  RECOMMENDATION_LEVELS,
  DI_ENGINE_VERSION,
  MIN_EVIDENCE_FOR_RECOMMENDATION,
  MAX_SIMILAR_EXPERIENCES,
  LOW_CONFIDENCE_THRESHOLD,
  SIMILARITY_THRESHOLD,
  tisToLevel,
  computeUncertaintyLevel,
  computeReliabilityRating,
} from "./learning/decision-intelligence/types.js";
export { evaluateSetup, describeExpectancy } from "./learning/decision-intelligence/recommendation-engine.js";
export { findSimilarExperiences, cosineSimilarity, buildVectorFromSetup } from "./learning/decision-intelligence/historical-matcher.js";
export { computeTis } from "./learning/decision-intelligence/setup-scorer.js";
export { extractFactors } from "./learning/decision-intelligence/factor-analyzer.js";
export { computeRecommendationConfidence } from "./learning/decision-intelligence/confidence-calculator.js";
export { diStore } from "./learning/decision-intelligence/di-store.js";
export { generateMarkdownReport as generateDecisionReport } from "./learning/decision-intelligence/report-generator.js";

import type { Pair, Timeframe, AnalysisResult } from "./types.js";
import { fetchCandles } from "./data/fetcher.js";
import { detectSwings, labelStructure, calcATR } from "./analysis/swings.js";
import { calcFibForCandles } from "./analysis/fibonacci.js";
import { detectZones } from "./analysis/zones.js";
import { detectLiquidityLevels, detectLiquidityGrabs, detectSweeps } from "./analysis/liquidity.js";
import { detectAMD } from "./analysis/amd.js";
import { detectRegime } from "./analysis/regime.js";
import { generateSignals } from "./signals/generator.js";
import { DEFAULT_WEIGHT_PROFILE, type WeightProfile } from "./learning/weights.js";

export async function runFullAnalysis(
  pair: Pair,
  timeframe: Timeframe = "4h",
  learnedWeights: WeightProfile = DEFAULT_WEIGHT_PROFILE,
): Promise<AnalysisResult> {
  const candles = await fetchCandles(pair, timeframe);
  const swings = detectSwings(candles, timeframe === "1d" ? 5 : 3);
  const structure = labelStructure(swings);
  const atr = calcATR(candles);
  const fib = calcFibForCandles(candles, swings);
  const zones = detectZones(pair, timeframe, candles, fib, 10);
  const liquidity = detectLiquidityLevels(candles, swings);
  const recentGrabs = detectLiquidityGrabs(candles, liquidity);
  const sweeps = detectSweeps(candles, swings);
  const amd = detectAMD(candles, recentGrabs);
  const regime = detectRegime(pair, candles, swings);
  const signals = generateSignals(pair, candles, zones, fib, amd, regime, recentGrabs, learnedWeights, sweeps);

  return {
    pair,
    timeframe,
    candles,
    swings,
    structure,
    fib,
    zones,
    liquidity,
    recentGrabs,
    sweeps,
    amd,
    regime,
    signals,
    atr,
    analyzedAt: new Date(),
  };
}
