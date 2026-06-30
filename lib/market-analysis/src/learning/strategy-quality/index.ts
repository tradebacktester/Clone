// ─── Strategy Quality Intelligence Engine — Public API ────────────────────────

export { runQualityEngine }             from "./quality-engine.js";
export { evaluateRuleIntegrity }        from "./rule-integrity-evaluator.js";
export { analyzeStructuralQuality }     from "./structural-quality-analyzer.js";
export { analyzeLiquidityIntelligence } from "./liquidity-intelligence-analyzer.js";
export { analyzeAmdIntelligence }       from "./amd-intelligence-analyzer.js";
export { analyzeConfirmationIntelligence } from "./confirmation-intelligence-analyzer.js";
export { integrateMarketIntelligence }  from "./market-intelligence-integrator.js";
export { analyzeHistoricalIntelligence } from "./historical-intelligence-analyzer.js";
export { calculateSqs }                 from "./sqs-calculator.js";
export { classifyQuality }              from "./quality-classifier.js";

export {
  SQI_ENGINE_VERSION,
  SQS_WEIGHTS,
  STRUCTURAL_WEIGHTS,
  LIQUIDITY_INTEL_WEIGHTS,
  AMD_INTEL_WEIGHTS,
  CONFIRMATION_INTEL_WEIGHTS,
  MARKET_INTEL_WEIGHTS,
  QUALITY_CLASSIFICATION_THRESHOLDS,
  QUALITY_CLASSIFICATION_LABELS,
  sqsToClassification,
  scoreToQualityTier,
  getPairQuality,
  SESSION_QUALITY,
  REGIME_QUALITY,
  clamp,
} from "./types.js";

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
} from "./types.js";

export type { SqsResult } from "./sqs-calculator.js";
