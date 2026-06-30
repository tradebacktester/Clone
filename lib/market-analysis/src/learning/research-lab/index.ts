// ─── Autonomous Research Lab — Public API ─────────────────────────────────────
// Advisory only. Research is completely isolated from production trading.

export { runResearchCycle, buildLabReport } from "./research-engine.js";
export { detectWeaknesses }                from "./weakness-detector.js";
export { generateHypotheses }             from "./hypothesis-generator.js";
export { buildExperiment, buildCodeChangeArtifact, generateStrategyVersion, describeConfigChanges } from "./experiment-builder.js";
export { runValidationPipeline }          from "./validation-pipeline.js";
export { compareStrategies, extractMetrics } from "./comparison-engine.js";
export { generateRecommendation }         from "./recommendation-generator.js";
export { buildApprovalRequest, processDecision, detectDegradation } from "./approval-workflow.js";

export {
  RL_ENGINE_VERSION,
  MIN_SAMPLE_FOR_COMPARISON,
  MIN_STAT_SIGNIFICANCE_PVAL,
  MIN_SUPERIORITY_SCORE,
  VALIDATION_STAGES,
  clamp,
  pctDelta,
  priorityFromScore,
} from "./types.js";

export type {
  ValidationStage,
  ProjectStatus,
  Priority,
  HypothesisType,
  HypothesisStatus,
  ExperimentStatus,
  ApprovalStatus,
  DeploymentStatus,
  OverallVerdict,
  RecommendationType,
  RecommendationStatus,
  ApprovalDecision,
  ApprovalQueueStatus,
  ChangeType,
  Weakness,
  Hypothesis,
  ConfigChange,
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
} from "./types.js";

export type { FeatureSnapshot }          from "./weakness-detector.js";
export type { ApprovalRequest, ApprovalDecisionResult, DegradationAlert } from "./approval-workflow.js";
