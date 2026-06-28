// ─── Learning Pipeline ───────────────────────────────────────────────────────
// Orchestrates the 8-stage learning pipeline.
// Advisory only — no trade execution, no strategy modification.
//
// Pipeline:
//   1. Experience Collection (inputs provided by caller)
//   2. Data Validation
//   3. Feature Extraction
//   4. Statistical Analysis
//   5. Pattern Performance Analysis (via metrics calculator)
//   6. Confidence Calculation
//   7. Report Generation
//   8. Recommendation Storage (returned, never auto-applied)

import { randomUUID } from "crypto";
import type {
  LearningCycleInput,
  LearningCycle,
  PipelineResult,
  ExtractedFeature,
} from "./types.js";
import { validateTrades } from "../learning-validation/data-validator.js";
import { extractFeatures, buildFeatureSummary } from "../learning-analysis/feature-extractor.js";
import { calculateMetrics } from "../learning-metrics/metrics-calculator.js";
import { computeConfidenceReport } from "../learning-confidence/confidence-engine.js";
import { analyzeStatistics } from "../learning-analysis/statistical-analyzer.js";
import { generateRecommendations } from "../learning-reports/report-generator.js";
import { historyStore } from "../learning-history/history-store.js";

export const LEARNING_ENGINE_VERSION = "1.0.0";

// ─── Pipeline Stages ──────────────────────────────────────────────────────────

const STAGES = [
  "data_validation",
  "feature_extraction",
  "statistical_analysis",
  "metrics_calculation",
  "confidence_calculation",
  "recommendation_generation",
  "history_storage",
] as const;

type Stage = (typeof STAGES)[number];

// ─── Run Pipeline ─────────────────────────────────────────────────────────────

export async function runLearningPipeline(
  input: LearningCycleInput,
): Promise<PipelineResult> {
  const startedAt = new Date();
  const id = randomUUID();
  const cycleNumber = historyStore.getNextCycleNumber();

  const stagesCompleted: Stage[] = [];
  const stagesFailed: Stage[] = [];

  const cycle: LearningCycle = {
    id,
    version: LEARNING_ENGINE_VERSION,
    cycleNumber,
    status: "running",
    triggeredBy: input.triggeredBy,
    startedAt,
    completedAt: null,
    durationMs: null,
    dataRangeFrom: input.dataRangeFrom ?? null,
    dataRangeTo: input.dataRangeTo ?? null,
    sampleSize: input.trades.length,
    validation: {
      isValid: false,
      totalRecords: 0,
      usableRecords: 0,
      rejectedRecords: 0,
      completenessScore: 0,
      issues: [],
      qualityNotes: [],
    },
    features: [],
    metrics: null,
    statisticalAnalysis: null,
    confidence: null,
    recommendations: [],
    validationStatus: "failed",
    errorMessage: null,
  };

  try {
    // ── Stage 1: Data Validation ───────────────────────────────────────────
    const validation = validateTrades(input.trades);
    cycle.validation = validation;
    cycle.sampleSize = validation.usableRecords;

    if (!validation.isValid) {
      cycle.status = "failed";
      cycle.validationStatus = "failed";
      cycle.errorMessage = validation.issues
        .filter(i => i.severity === "error")
        .map(i => i.message)
        .join("; ");
      stagesFailed.push("data_validation");
      finaliseCycle(cycle, startedAt);
      historyStore.append(cycle);
      return { cycle, durationMs: cycle.durationMs!, stagesCompleted: [], stagesFailed: [...stagesFailed] };
    }
    stagesCompleted.push("data_validation");

    // ── Stage 2: Feature Extraction ───────────────────────────────────────
    const features = extractFeatures(input.trades);
    cycle.features = features;
    cycle.sampleSize = features.length;
    stagesCompleted.push("feature_extraction");

    // ── Stage 3: Statistical Analysis ─────────────────────────────────────
    const statsAnalysis = analyzeStatistics(features, input.skippedSetups, input.manualReviews);
    cycle.statisticalAnalysis = statsAnalysis;
    stagesCompleted.push("statistical_analysis");

    // ── Stage 4 & 5: Metrics + Pattern Performance ─────────────────────────
    const metrics = calculateMetrics(features);
    cycle.metrics = metrics;
    stagesCompleted.push("metrics_calculation");

    // ── Stage 6: Confidence Calculation ───────────────────────────────────
    const confidence = computeConfidenceReport(features, validation);
    cycle.confidence = confidence;
    stagesCompleted.push("confidence_calculation");

    // ── Stage 7: Recommendation Generation ────────────────────────────────
    const recommendations = generateRecommendations(metrics, confidence);
    cycle.recommendations = recommendations;
    stagesCompleted.push("recommendation_generation");

    // ── Stage 8: History Storage ───────────────────────────────────────────
    cycle.status = "complete";
    cycle.validationStatus = deriveValidationStatus(validation);
    finaliseCycle(cycle, startedAt);
    historyStore.append(cycle);
    stagesCompleted.push("history_storage");

  } catch (err) {
    cycle.status = "failed";
    cycle.validationStatus = "failed";
    cycle.errorMessage = err instanceof Error ? err.message : String(err);
    const remaining = STAGES.filter(s => !stagesCompleted.includes(s));
    stagesFailed.push(...remaining.slice(0, 1));
    finaliseCycle(cycle, startedAt);
    historyStore.append(cycle);
  }

  return {
    cycle,
    durationMs: cycle.durationMs!,
    stagesCompleted,
    stagesFailed,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function finaliseCycle(cycle: LearningCycle, startedAt: Date): void {
  cycle.completedAt = new Date();
  cycle.durationMs = cycle.completedAt.getTime() - startedAt.getTime();
}

function deriveValidationStatus(
  validation: LearningCycle["validation"],
): LearningCycle["validationStatus"] {
  const errors = validation.issues.filter(i => i.severity === "error").length;
  const warnings = validation.issues.filter(i => i.severity === "warning").length;
  if (errors > 0) return "failed";
  if (warnings > 3) return "degraded";
  return "passed";
}

// ─── Dry-run (for testing) ────────────────────────────────────────────────────

export function buildEmptyCycle(): LearningCycle {
  return {
    id: randomUUID(),
    version: LEARNING_ENGINE_VERSION,
    cycleNumber: 0,
    status: "running",
    triggeredBy: "manual",
    startedAt: new Date(),
    completedAt: null,
    durationMs: null,
    dataRangeFrom: null,
    dataRangeTo: null,
    sampleSize: 0,
    validation: { isValid: false, totalRecords: 0, usableRecords: 0, rejectedRecords: 0, completenessScore: 0, issues: [], qualityNotes: [] },
    features: [],
    metrics: null,
    statisticalAnalysis: null,
    confidence: null,
    recommendations: [],
    validationStatus: "failed",
    errorMessage: null,
  };
}
