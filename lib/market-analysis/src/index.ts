export * from "./types.js";
export { perceiveTrend } from "./perception/trend-perception.js";
export type { TrendDirection, TrendPerception } from "./perception/trend-perception.js";
export { perceiveRegime } from "./perception/regime-perception.js";
export type { PerceptionRegime, RegimeScore, RegimePerception } from "./perception/regime-perception.js";
export { perceiveVolatility } from "./perception/volatility-perception.js";
export type { VolatilityClassification, VolatilityTrend, VolatilityPerception } from "./perception/volatility-perception.js";
export { perceiveLiquidity } from "./perception/liquidity-perception.js";
export type { LiquidityQuality, SessionLiquidity, LiquidityPerception } from "./perception/liquidity-perception.js";
export { perceiveCorrelation } from "./perception/correlation-perception.js";
export type { CorrelationStatus, PairCorrelation, CorrelationPerception } from "./perception/correlation-perception.js";
export { perceiveNewsContext } from "./perception/news-context.js";
export type { NewsEnvironment, RecoveryPhase, UpcomingNewsEvent, RecentNewsEvent, NewsContext, RawNewsEvent } from "./perception/news-context.js";
export { buildMarketState, MARKET_STATE_VERSION } from "./perception/market-state.js";
export type { TradingSession, OverallConfidence, MarketStateInput, MarketState } from "./perception/market-state.js";
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

// ─── Phase 3: Learning Validation, Drift, Health, Accuracy, Scheduler ────────
export { runStatisticalValidation, measureReproducibility } from "./learning/learning-validation/statistical-validator.js";
export type { StatisticalValidationResult, ValidationCheck } from "./learning/learning-validation/statistical-validator.js";
export { runDriftDetection } from "./learning/learning-validation/drift-detector.js";
export type { DriftEvent, DriftReport, DriftType, DriftSeverity } from "./learning/learning-validation/drift-detector.js";
export { computeHealthSnapshot } from "./learning/learning-validation/health-monitor.js";
export type { HealthSnapshot, HealthInput, HealthDimension } from "./learning/learning-validation/health-monitor.js";
export { evaluateRecommendationAccuracy } from "./learning/learning-validation/recommendation-tracker.js";
export type { RecommendationRecord, AccuracyEvaluation, CalibrationBucket } from "./learning/learning-validation/recommendation-tracker.js";
export { buildScheduledRun, computeScheduleWindow, getScheduleStatus, nextRunDue, isRunDue } from "./learning/learning-validation/scheduler.js";
export type { ScheduleType, ScheduledRun, ScheduleWindow, ScheduleStatus } from "./learning/learning-validation/scheduler.js";

// ─── Phase 4: Enhancement — Calibration, Regime, Versioning, Quality ─────────
export { runCalibration, filterByWindow } from "./learning/learning-validation/confidence-calibrator.js";
export type { ReliabilityBucket, CalibrationResult, CalibrationSnapshot } from "./learning/learning-validation/confidence-calibrator.js";
export { analyzeRegimeState, detectRegimeTransition, buildRegimeHistory, featuresToCandles } from "./learning/learning-validation/regime-transition-detector.js";
export type { RegimeLabel, TransitionType, RegimeTransitionEvent, RegimeState, RegimeTimeline, RegimeHistoryEntry, RegimeCandle } from "./learning/learning-validation/regime-transition-detector.js";
export { buildLearningVersion, compareVersions, generateVersionChangelog, bumpVersion } from "./learning/learning-validation/version-controller.js";
export type { LearningVersionInput, VersionFeatureRanking, VersionPatternRanking, VersionChange, LearningVersion, VersionComparison } from "./learning/learning-validation/version-controller.js";
export { computeQualitySnapshot } from "./learning/learning-validation/quality-monitor.js";
export type { QualityAlertType, AlertSeverity, QualityAlert, QualityDimension, QualitySnapshot, QualityInput } from "./learning/learning-validation/quality-monitor.js";

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

// ─── Market Context Intelligence Engine
export { buildMarketContext } from "./context/index.js";
export type { MarketContextInput, FullMarketContext } from "./context/index.js";
export {
  analyzePerformance,
  analyzeByRegime,
  analyzeBySession,
  analyzeByTrendDirection,
  analyzeByVolatility,
  analyzeByLiquidity,
  analyzeByNewsStatus,
  analyzeByDayOfWeek,
  analyzeByMonth,
  analyzeBySpreadBand,
  overallStats,
  findStatForCondition,
} from "./context/index.js";
export { scoreMarketContext, scoreToLabel } from "./context/index.js";
export type { CurrentConditions } from "./context/index.js";
export { findHistoricalMatches, computeSimilarityScore, aggregateMatchOutcomes } from "./context/index.js";
export type { CurrentFeatures } from "./context/index.js";
export { analyzeStability } from "./context/index.js";
export { classifyEnvironment, classificationLabel } from "./context/index.js";
export type {
  EnvironmentClass,
  StabilityLabel,
  OutcomeLabel,
  ConditionStats,
  MCSComponent,
  MarketContextScore,
  HistoricalMatch,
  StabilityMeasure,
  StabilityAnalysis,
  ContextHistory,
  MarketContextAnalysis,
  TradeRecord as ContextTradeRecord,
  SnapshotRecord,
} from "./context/index.js";
export {
  ENVIRONMENT_THRESHOLDS,
  MIN_SAMPLE_FOR_SCORE,
  MIN_SAMPLE_FOR_CONFIDENCE,
  STABILITY_WINDOW,
} from "./context/index.js";

// ─── World Model (selective — avoids type collisions with root types.ts) ───────
export type {
  WorldModelComponent,
  RelationshipType,
  ComponentRelationship,
  EvidenceDataPoint,
  TransitionCategory,
  MarketTransitionStats,
  TransitionEvidence,
  InfluenceEdge,
  InfluenceGraph,
  InfluenceNode,
  InfluenceDirection,
  ScenarioType,
  ScenarioQuery,
  ScenarioResult,
  ScenarioEvidenceItem,
  MarketWorldState,
  ActiveTransition,
  WorldModelSummary,
  ModelHealth,
  WorldModelFeatureRow,
  WorldModelReport,
} from "./world-model/index.js";
export {
  WORLD_MODEL_VERSION,
  ALL_COMPONENTS,
  COMPONENT_LABELS,
  analyzeRelationships,
  filterSignificantRelationships,
  getRelationshipsFor,
  MIN_RELATIONSHIP_SAMPLE,
  MIN_CONFIDENCE_THRESHOLD,
  CAUSAL_CONFIDENCE_THRESHOLD,
  detectTransitions,
  computeTransitionStats,
  detectActiveTransitions,
  KNOWN_TRANSITIONS,
  buildInfluenceGraph,
  getInfluencedBy,
  getInfluences,
  getTopInfluencers,
  buildInfluenceChain,
  runScenario,
  runAllPredefinedScenarios,
  PREDEFINED_SCENARIOS,
  WorldModelStore,
  worldModelStore,
  WORLD_MODEL_ENGINE_VERSION,
  generateWorldModelReport,
  generateRelationshipReport,
  generateTransitionReport,
  generateScenarioReport,
} from "./world-model/index.js";

// ─── Unified Market Intelligence Engine ───────────────────────────────────────
// Single source of truth for all future intelligence modules.
export { generateIntelligenceReport, UNIFIED_INTELLIGENCE_VERSION } from "./unified-intelligence/index.js";
export { computeHealthScore } from "./unified-intelligence/index.js";
export { computeOpportunityScore } from "./unified-intelligence/index.js";
export { assessRisk as assessMarketRisk } from "./unified-intelligence/index.js";
export { compareHistorical } from "./unified-intelligence/index.js";
export { generateOutlook } from "./unified-intelligence/index.js";
export type {
  MarketSummary,
  HistoricalContext,
  HistoricalMatch as UnifiedHistoricalMatch,
  HealthScoreBreakdown,
  HealthGrade,
  RiskDimension,
  RiskAssessment,
  RiskLevel,
  OpportunityScoreBreakdown,
  OpportunityLabel,
  OutlookScenario,
  MarketOutlook as UnifiedMarketOutlook,
  UnifiedMarketState,
  MarketIntelligenceReport as UnifiedIntelligenceReport,
} from "./unified-intelligence/index.js";

// ─── Strategy Reasoning Engine ────────────────────────────────────────────────
// Phase 5 — evaluates every valid setup with full explainability.
// Advisory only — no trade execution, no strategy modification.
export {
  runStrategyReasoning,
  evaluateRules,
  findSimilarHistoricalTrades,
  analyzeMarketSupport,
  analyzePatternStrength,
  analyzeContextStrength,
  calculateStrategyStrength,
  extractSupportingFactors,
  computeStatisticalExpectancy,
  assessRisks,
  buildReasoningNarrative,
  strengthToRecommendation,
  scoreToTier,
  evidenceToReliability,
  getPairScore,
  SR_ENGINE_VERSION,
  STRENGTH_WEIGHTS,
  STRATEGY_RULES,
  SESSION_SCORES,
  REGIME_SCORES,
  VOLATILITY_SCORES,
} from "./learning/strategy-reasoning/index.js";
export type {
  StrategySetup,
  ReasoningRecommendation,
  RuleResult,
  RuleStatus,
  RuleEvaluationResult,
  SimilarTrade,
  HistoricalEvidenceResult,
  MarketSupportResult,
  PatternStrengthResult,
  ContextStrengthResult,
  StrengthComponent,
  StrengthTier,
  StrategyStrengthResult,
  SupportingFactor,
  StrategyReasoningReport,
} from "./learning/strategy-reasoning/index.js";

// ─── Strategy Quality Intelligence Engine ─────────────────────────────────────
// Phase 5 — objective multi-factor setup quality scoring (0–100 SQS, 7-tier).
// Advisory only — no strategy modification, no trade execution.
export {
  runQualityEngine,
  evaluateRuleIntegrity,
  analyzeStructuralQuality,
  analyzeLiquidityIntelligence,
  analyzeAmdIntelligence,
  analyzeConfirmationIntelligence,
  integrateMarketIntelligence,
  analyzeHistoricalIntelligence,
  calculateSqs,
  classifyQuality,
  sqsToClassification,
  scoreToQualityTier,
  getPairQuality,
  SQI_ENGINE_VERSION,
  SQS_WEIGHTS,
  STRUCTURAL_WEIGHTS,
  LIQUIDITY_INTEL_WEIGHTS,
  AMD_INTEL_WEIGHTS,
  CONFIRMATION_INTEL_WEIGHTS,
  MARKET_INTEL_WEIGHTS,
  QUALITY_CLASSIFICATION_THRESHOLDS,
  QUALITY_CLASSIFICATION_LABELS,
  SESSION_QUALITY,
  REGIME_QUALITY,
} from "./learning/strategy-quality/index.js";
export type {
  QualitySetup,
  QualityClassification,
  QualityTier,
  RuleIntegrityResult,
  StructuralQualityResult,
  LiquidityIntelligenceResult,
  AmdIntelligenceResult,
  ConfirmationIntelligenceResult,
  MarketIntelligenceResult,
  HistoricalIntelligenceResult,
  SqsComponent,
  QualityClassificationResult,
  StrategyQualityReport,
} from "./learning/strategy-quality/index.js";

// ─── Trader Identity & Strategy Consistency Engine ────────────────────────────
// Phase 5 P3 — dynamic identity model, preference discovery, consistency scoring.
// Advisory only — no strategy modification, no trade execution.
export {
  runTraderIdentityEngine,
  buildIdentityProfile,
  runDriftAnalysis,
  evaluateRuleIdentity,
  analyzeAdaptiveIdentity,
  computeRuleSimilarity,
  computeHistoricalSimilarity,
  computePreferenceAlignment,
  computeIdentitySimilarity,
  evaluateConsistency,
  detectDrift,
  buildIdentityNarrative,
  stageLabel,
  TI_ENGINE_VERSION,
  MIN_SAMPLE_FOR_ADAPTIVE,
  MIN_PREFERENCE_SAMPLE,
  SIMILARITY_WEIGHTS,
  CONSISTENCY_THRESHOLDS,
  CONSISTENCY_LABELS,
  consistencyFromScore,
} from "./learning/trader-identity/index.js";
export type {
  IdentityStage,
  ConsistencyLevel,
  PreferenceType,
  DriftType,
  DriftSeverity,
  IdentitySetup,
  IdentityFeature,
  RuleCheck,
  RuleIdentityResult,
  PreferenceGroup,
  AdaptiveIdentityResult,
  SimilarHistoricalTrade,
  RuleSimilarityResult,
  HistoricalSimilarityResult,
  PreferenceAlignmentResult,
  IdentitySimilarityScore,
  ConsistencyResult,
  DriftEvent,
  DriftReport,
  IdentityProfile,
  TraderIdentityReport,
} from "./learning/trader-identity/index.js";

// ─── Autonomous Research & Self-Evolution Laboratory ──────────────────────────
// Phase 5 P4 — sandboxed research engine, validation pipeline, approval workflow.
// Advisory only. Research environment is completely isolated from production.
export {
  runResearchCycle,
  buildLabReport,
  detectWeaknesses,
  generateHypotheses,
  buildExperiment,
  buildCodeChangeArtifact,
  generateStrategyVersion,
  runValidationPipeline,
  compareStrategies,
  extractMetrics,
  generateRecommendation,
  buildApprovalRequest,
  processDecision,
  detectDegradation,
  RL_ENGINE_VERSION,
  VALIDATION_STAGES,
} from "./learning/research-lab/index.js";
export type {
  ValidationStage,
  ProjectStatus,
  Priority,
  HypothesisType,
  HypothesisStatus,
  ExperimentStatus,
  ApprovalStatus,
  OverallVerdict,
  RecommendationType,
  ApprovalDecision,
  ChangeType,
  Weakness,
  Hypothesis,
  ValidationStageResult,
  ValidationPipelineResult,
  PerformanceMetrics,
  ComparisonResult,
  CodeChangeArtifact,
  ResearchExperiment,
  DeploymentRecommendation,
  ResearchProject,
  ResearchLabReport,
  ResearchCycleResult,
  FeatureSnapshot,
  ApprovalRequest,
  DegradationAlert,
} from "./learning/research-lab/index.js";

// ─── Executive Strategy Brain ─────────────────────────────────────────────────
export {
  runExecutiveBrain,
  runCertification,
  ESB_ENGINE_VERSION,
  DEFAULT_SCORE_WEIGHTS,
  buildRuleEngineSummary,
  buildReasoningSummary,
  buildQualitySummary,
  buildIdentitySummary,
  buildHistoricalIntelligence,
  buildMarketSummary,
  buildResearchSummary,
} from "./executive-brain/index.js";

export type {
  UnifiedStrategyIntelligenceObject,
  EsbSetupInput,
  EsbScoreWeights,
  EsbScoreBreakdown,
  EsbRecommendation,
  RuleEngineSummary,
  StrategyReasoningSummary,
  StrategyQualitySummary,
  TraderIdentitySummary,
  HistoricalIntelligence,
  MarketIntelligenceSummary,
  ResearchIntelligenceSummary,
  ExplainabilityBundle,
  CertificationReport,
} from "./executive-brain/index.js";

// ─── Risk Intelligence Core Engine (Phase 6) ──────────────────────────────────
export {
  runRiskIntelligence,
  gatherSystemMetrics,
  defaultAccountState,
  defaultPortfolioInput,
  defaultMarketInput,
  defaultBrokerMetrics,
  defaultSystemMetrics,
  evaluateAccountRisk,
  evaluatePositionRisk,
  evaluatePortfolioRisk,
  evaluateMarketRisk,
  evaluateBrokerRisk,
  evaluateSystemRisk,
  scoreToRiskClassification,
  RI_ENGINE_VERSION,
  RI_RISK_VERSION,
  DEFAULT_RI_WEIGHTS,
} from "./risk-intelligence/index.js";

export type {
  RunRiInput,
  UnifiedRiskIntelligenceObject,
  AccountState,
  PositionInput,
  PortfolioInput,
  MarketRiskInput,
  BrokerMetrics,
  SystemMetrics,
  RiScoreWeights,
  RiskClassification,
  AccountRiskResult,
  PositionRiskResult,
  PortfolioRiskResult,
  MarketRiskResult,
  BrokerRiskResult,
  SystemRiskResult,
  RiskAlert,
  OpenPosition,
} from "./risk-intelligence/index.js";
