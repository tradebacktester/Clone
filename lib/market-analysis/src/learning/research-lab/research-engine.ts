// ─── Autonomous Research Lab — Main Orchestrator ──────────────────────────────
// Runs the full self-evolution pipeline from weakness detection to approval.
// Advisory only. Research environment is completely isolated from production.

import { randomUUID } from "crypto";
import { RL_ENGINE_VERSION } from "./types.js";
import { detectWeaknesses }      from "./weakness-detector.js";
import { generateHypotheses }    from "./hypothesis-generator.js";
import { buildExperiment, buildCodeChangeArtifact } from "./experiment-builder.js";
import { runValidationPipeline } from "./validation-pipeline.js";
import { compareStrategies, extractMetrics } from "./comparison-engine.js";
import { generateRecommendation } from "./recommendation-generator.js";
import { buildApprovalRequest }  from "./approval-workflow.js";
import type {
  ResearchProject,
  ResearchExperiment,
  ResearchLabReport,
  Weakness,
  Hypothesis,
  ComparisonResult,
  ValidationPipelineResult,
  DeploymentRecommendation,
  CodeChangeArtifact,
} from "./types.js";
import type { FeatureSnapshot } from "./weakness-detector.js";
import type { ApprovalRequest } from "./approval-workflow.js";

// ─── Full pipeline run ────────────────────────────────────────────────────────

export interface ResearchCycleResult {
  project:          ResearchProject;
  weaknesses:       Weakness[];
  hypotheses:       Hypothesis[];
  experiment:       ResearchExperiment;
  codeChanges:      CodeChangeArtifact[];
  validation:       ValidationPipelineResult;
  comparison:       ComparisonResult;
  recommendation:   DeploymentRecommendation;
  approvalRequest:  ApprovalRequest;
  isAdvisoryOnly:   true;
  cycleCompletedAt: Date;
}

export function runResearchCycle(
  historicalRows: FeatureSnapshot[],
  productionVersion = "1.0.0",
): ResearchCycleResult {
  const projectId  = randomUUID();
  const startedAt  = new Date();

  // Step 1 — Detect weaknesses
  const weaknesses = detectWeaknesses(historicalRows);

  // Step 2 — Generate hypotheses from weaknesses
  const hypotheses = generateHypotheses(projectId, weaknesses);
  const topHypothesis = hypotheses[0]!;

  // Step 3 — Build experimental strategy
  const experiment = buildExperiment(projectId, topHypothesis, productionVersion);

  // Step 4 — Build code change artifact
  const codeChanges: CodeChangeArtifact[] = [
    buildCodeChangeArtifact(topHypothesis, experiment.experimentId, projectId),
  ];
  // Add additional changes for multi-hypothesis experiments
  for (const h of hypotheses.slice(1, 3)) {
    codeChanges.push(buildCodeChangeArtifact(h, experiment.experimentId, projectId));
  }

  // Step 5 — Run validation pipeline
  const expConfig   = topHypothesis.proposedChange as Record<string, unknown>;
  const validation  = runValidationPipeline(historicalRows, expConfig);

  // Update experiment with validation results
  experiment.validationResults   = { stages: validation.stages, passed: validation.passed, overallScore: validation.overallScore };
  experiment.statisticalConfidence = validation.confidence;
  experiment.status              = validation.passed ? "completed" : "failed";
  experiment.validationStage     = validation.passed ? undefined : validation.failedStage;
  experiment.completedAt         = new Date();

  // Step 6 — Compare with production
  const comparison = compareStrategies(historicalRows, historicalRows, expConfig);
  experiment.performanceMetrics = {
    ...comparison.experimentMetrics,
    tradeCount: comparison.experimentMetrics.tradeCount,
  } as unknown as Record<string, unknown>;

  // Step 7 — Generate deployment recommendation
  const recommendation = generateRecommendation(
    projectId,
    experiment.experimentId,
    comparison,
    validation,
    codeChanges,
    productionVersion,
    experiment.strategyVersion,
  );

  // Step 8 — Build approval request
  const approvalRequest = buildApprovalRequest(recommendation, projectId);

  // Step 9 — Assemble project record
  const project: ResearchProject = {
    projectId,
    title:           `Research Cycle: ${topHypothesis.title}`,
    description:     `Autonomous research project targeting: ${weaknesses[0]?.title ?? "General improvement"}`,
    objective:       topHypothesis.rationale,
    weaknessTarget:  weaknesses[0]?.category ?? "general",
    status:          "completed",
    priority:        weaknesses[0]?.severity === "critical" ? "critical"
                   : weaknesses[0]?.severity === "high"     ? "high"
                   : "medium",
    hypothesisCount: hypotheses.length,
    experimentCount: 1,
    isAdvisoryOnly:  true,
    startedAt,
    completedAt:     new Date(),
  };

  return {
    project,
    weaknesses,
    hypotheses,
    experiment,
    codeChanges,
    validation,
    comparison,
    recommendation,
    approvalRequest,
    isAdvisoryOnly:   true,
    cycleCompletedAt: new Date(),
  };
}

// ─── Summary report builder ───────────────────────────────────────────────────

export function buildLabReport(
  activeProjects:       number,
  totalHypotheses:      number,
  totalExperiments:     number,
  pendingApprovals:     number,
  completedExperiments: number,
  deployedVersions:     number,
  weaknesses:           Weakness[],
): ResearchLabReport {
  return {
    version:             RL_ENGINE_VERSION,
    generatedAt:         new Date(),
    activeProjects,
    totalHypotheses,
    totalExperiments,
    pendingApprovals,
    completedExperiments,
    deployedVersions,
    weaknesses,
    isAdvisoryOnly:      true,
  };
}
