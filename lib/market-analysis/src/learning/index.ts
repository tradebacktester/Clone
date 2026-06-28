// ─── Learning Engine — Public API ────────────────────────────────────────────
// Advisory only — observes, measures, and learns. Never modifies trading behavior.

export * from "./learning-core/types.js";
export * from "./learning-core/pipeline.js";
export * from "./learning-validation/data-validator.js";
export * from "./learning-analysis/feature-extractor.js";
export * from "./learning-analysis/statistical-analyzer.js";
export * from "./learning-metrics/metrics-calculator.js";
export * from "./learning-confidence/confidence-engine.js";
export * from "./learning-history/history-store.js";
export * from "./learning-reports/report-generator.js";
export { runStatisticalValidation, measureReproducibility } from "./learning-validation/statistical-validator.js";
export type { StatisticalValidationResult, ValidationCheck } from "./learning-validation/statistical-validator.js";
export { runDriftDetection } from "./learning-validation/drift-detector.js";
export type { DriftEvent, DriftReport, DriftType, DriftSeverity } from "./learning-validation/drift-detector.js";
export { computeHealthSnapshot } from "./learning-validation/health-monitor.js";
export type { HealthSnapshot, HealthInput, HealthDimension } from "./learning-validation/health-monitor.js";
export { evaluateRecommendationAccuracy } from "./learning-validation/recommendation-tracker.js";
export type { RecommendationRecord, AccuracyEvaluation, CalibrationBucket } from "./learning-validation/recommendation-tracker.js";
export { buildScheduledRun, computeScheduleWindow, getScheduleStatus, nextRunDue, isRunDue } from "./learning-validation/scheduler.js";
export type { ScheduleType, ScheduledRun, ScheduleWindow, ScheduleStatus } from "./learning-validation/scheduler.js";
