export { buildMarketContext } from "./market-context.js";
export type { MarketContextInput, FullMarketContext } from "./market-context.js";

export { analyzePerformance, analyzeByRegime, analyzeBySession, analyzeByTrendDirection, analyzeByVolatility, analyzeByLiquidity, analyzeByNewsStatus, analyzeByDayOfWeek, analyzeByMonth, analyzeBySpreadBand, overallStats, findStatForCondition } from "./performance-analyzer.js";

export { scoreMarketContext, scoreToLabel } from "./context-scorer.js";
export type { CurrentConditions } from "./context-scorer.js";

export { findHistoricalMatches, computeSimilarityScore, aggregateMatchOutcomes } from "./historical-matcher.js";
export type { CurrentFeatures } from "./historical-matcher.js";

export { analyzeStability } from "./stability-analyzer.js";

export { classifyEnvironment, classificationLabel } from "./environment-classifier.js";

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
  TradeRecord,
  SnapshotRecord,
  MCS_WEIGHTS,
} from "./types.js";

export {
  MCS_WEIGHTS,
  ENVIRONMENT_THRESHOLDS,
  MIN_SAMPLE_FOR_SCORE,
  MIN_SAMPLE_FOR_CONFIDENCE,
  STABILITY_WINDOW,
} from "./types.js";
