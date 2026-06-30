// ─── Trader Identity & Strategy Consistency Engine — Public API ───────────────
// Advisory only. Never modifies strategy or execution logic.

export { runTraderIdentityEngine, buildIdentityProfile, runDriftAnalysis } from "./identity-engine.js";
export { evaluateRuleIdentity }                  from "./rule-identity.js";
export { analyzeAdaptiveIdentity }               from "./preference-analyzer.js";
export {
  computeRuleSimilarity,
  computeHistoricalSimilarity,
  computePreferenceAlignment,
  computeIdentitySimilarity,
}                                                from "./similarity-calculator.js";
export { evaluateConsistency }                   from "./consistency-evaluator.js";
export { detectDrift }                           from "./drift-detector.js";
export { buildIdentityNarrative, stageLabel }    from "./report-generator.js";

export {
  TI_ENGINE_VERSION,
  MIN_SAMPLE_FOR_ADAPTIVE,
  MIN_PREFERENCE_SAMPLE,
  MIN_PREFERENCE_CONFIDENCE,
  PREFERENCE_LIFT_THRESHOLD,
  DRIFT_WINDOW_SIZE,
  SIMILARITY_WEIGHTS,
  CONSISTENCY_THRESHOLDS,
  CONSISTENCY_LABELS,
  clamp,
  consistencyFromScore,
  driftSeverityFromScore,
  cosineSimilarity,
  featureVector,
} from "./types.js";

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
} from "./types.js";
