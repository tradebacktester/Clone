// ─── Research Lab — Recommendation Generator ──────────────────────────────────
// Generates evidence-based deployment recommendations. Advisory only.
// Human approval required before any deployment action.

import { randomUUID } from "crypto";
import type { ComparisonResult, ValidationPipelineResult, DeploymentRecommendation, RecommendationType } from "./types.js";
import type { CodeChangeArtifact } from "./types.js";

// ─── Recommendation type logic ────────────────────────────────────────────────

function classifyRecommendationType(
  comparison: ComparisonResult,
  validation: ValidationPipelineResult,
): RecommendationType {
  if (!validation.passed) return "archive";
  if (comparison.overallVerdict === "superior" && comparison.isStatSignificant) return "deploy";
  if (comparison.overallVerdict === "superior" && !comparison.isStatSignificant) return "continue_testing";
  if (comparison.overallVerdict === "equivalent") return "continue_testing";
  return "archive";
}

// ─── Risk assessment builder ──────────────────────────────────────────────────

function buildRiskAssessment(comparison: ComparisonResult, validation: ValidationPipelineResult): string {
  const risks: string[] = [];

  if (!comparison.isStatSignificant) {
    risks.push("Win-rate improvement is not yet statistically significant — larger sample may reverse results.");
  }
  if (comparison.regressions.length > 0) {
    const worst = comparison.regressions[0]!;
    risks.push(`${worst.metric} regressed by ${Math.abs(worst.pct).toFixed(1)}% in experimental version.`);
  }
  if (comparison.experimentMetrics.maxDrawdown > comparison.productionMetrics.maxDrawdown) {
    risks.push("Experimental version has higher maximum drawdown than production.");
  }
  if (validation.confidence < 70) {
    risks.push(`Validation confidence is ${validation.confidence.toFixed(0)}% — below 70% threshold for high-confidence deployment.`);
  }
  if (comparison.productionMetrics.tradeCount < 20) {
    risks.push("Production sample size is small — comparison may not be representative.");
  }

  if (risks.length === 0) risks.push("No major risk factors identified. All validation stages passed with acceptable margins.");

  return risks.map((r, i) => `${i + 1}. ${r}`).join("\n");
}

// ─── Evidence builder ─────────────────────────────────────────────────────────

function buildValidationEvidence(validation: ValidationPipelineResult): string[] {
  return validation.stages
    .filter(s => s.score > 0)
    .map(s => `${s.stage.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}: ${s.passed ? "✓ PASS" : "✗ FAIL"} (score ${s.score.toFixed(0)}/100) — ${s.summary}`);
}

// ─── Drawbacks builder ────────────────────────────────────────────────────────

function buildPotentialDrawbacks(comparison: ComparisonResult, validation: ValidationPipelineResult): string[] {
  const drawbacks: string[] = [];

  if (!comparison.isStatSignificant) {
    drawbacks.push("Statistical significance not yet confirmed — results may revert with more trades.");
  }
  for (const r of comparison.regressions) {
    drawbacks.push(`${r.metric} is ${Math.abs(r.pct).toFixed(1)}% worse in experimental version.`);
  }
  if (comparison.experimentMetrics.tradeCount < comparison.productionMetrics.tradeCount) {
    drawbacks.push("Experimental version filters more trades — may reduce activity in thin markets.");
  }
  if (drawbacks.length === 0) {
    drawbacks.push("No significant drawbacks identified in validation.");
  }

  return drawbacks;
}

// ─── Code change summary ──────────────────────────────────────────────────────

function summarizeCodeChanges(changes: CodeChangeArtifact[]): string {
  if (changes.length === 0) return "No research code changes recorded.";
  return changes
    .map((c, i) => `${i + 1}. [${c.changeType.toUpperCase()}] ${c.changeTitle} — ${c.targetModule} (+${c.linesAdded}/-${c.linesRemoved} lines). Tests: ${c.testsPassed ? "✓" : "✗"} Static: ${c.staticAnalysis ? "✓" : "✗"} Security: ${c.securityCheck ? "✓" : "✗"} Perf: ${c.perfBenchmark ? "✓" : "✗"}`)
    .join("\n");
}

// ─── Main generator ───────────────────────────────────────────────────────────

export function generateRecommendation(
  projectId:    string,
  experimentId: string,
  comparison:   ComparisonResult,
  validation:   ValidationPipelineResult,
  codeChanges:  CodeChangeArtifact[],
  productionVersion: string,
  experimentVersion: string,
): DeploymentRecommendation {
  const type = classifyRecommendationType(comparison, validation);

  const titleMap: Record<RecommendationType, string> = {
    deploy:           `Deploy ${experimentVersion} — Statistically Superior to ${productionVersion}`,
    continue_testing: `Continue Testing ${experimentVersion} — Promising but Insufficient Evidence`,
    archive:          `Archive ${experimentVersion} — Validation Failed or No Improvement`,
    rollback:         `Rollback Recommendation`,
  };

  const summaryMap: Record<RecommendationType, string> = {
    deploy: [
      `Experimental strategy version ${experimentVersion} has outperformed production ${productionVersion} across all 10 validation stages.`,
      `Win rate improvement: ${comparison.improvements.find(i => i.metric === "Win Rate")?.pct.toFixed(1) ?? "N/A"}%.`,
      `Sharpe improvement: ${comparison.sharpeImprovement.toFixed(1)}%.`,
      `Statistical significance: ${comparison.isStatSignificant ? "Confirmed (p<0.05)" : "Not confirmed"}.`,
      `Recommendation: DEPLOY pending human approval.`,
    ].join(" "),

    continue_testing: [
      `Experimental strategy version ${experimentVersion} shows promise vs production ${productionVersion} but has not yet achieved statistical significance.`,
      `${comparison.improvements.length} improvements detected, ${comparison.regressions.length} regressions.`,
      `Recommendation: Continue paper trading and gather more data.`,
    ].join(" "),

    archive: [
      `Experimental strategy version ${experimentVersion} did not pass all validation requirements.`,
      `Failed stage: ${validation.failedStage ?? "comparison"}.`,
      `Recommendation: Archive this experiment and start a new hypothesis.`,
    ].join(" "),

    rollback: "Performance degradation detected in production. Recommend rollback to previous version.",
  };

  const perfSummary = [
    `Production: WR=${(comparison.productionMetrics.winRate * 100).toFixed(1)}%, RR=${comparison.productionMetrics.avgRr.toFixed(2)}, PF=${comparison.productionMetrics.profitFactor.toFixed(2)}, Sharpe=${comparison.productionMetrics.sharpe.toFixed(2)}, DD=${(comparison.productionMetrics.maxDrawdown * 100).toFixed(1)}%.`,
    `Experimental: WR=${(comparison.experimentMetrics.winRate * 100).toFixed(1)}%, RR=${comparison.experimentMetrics.avgRr.toFixed(2)}, PF=${comparison.experimentMetrics.profitFactor.toFixed(2)}, Sharpe=${comparison.experimentMetrics.sharpe.toFixed(2)}, DD=${(comparison.experimentMetrics.maxDrawdown * 100).toFixed(1)}%.`,
    comparison.summary,
  ].join(" ");

  const rollbackPlan = [
    `1. Halt new signal generation from experimental version immediately.`,
    `2. Revert configuration to production version ${productionVersion}.`,
    `3. Close any open positions opened under experimental rules (if applicable).`,
    `4. Restore all rule thresholds to production values.`,
    `5. Log rollback event to research history with timestamp and reason.`,
    `6. Begin post-mortem analysis of experimental version failure.`,
  ].join("\n");

  return {
    recommendationId:       randomUUID(),
    experimentId,
    projectId,
    title:                  titleMap[type],
    summary:                summaryMap[type],
    codeChangeSummary:      summarizeCodeChanges(codeChanges),
    performanceSummary:     perfSummary,
    riskAssessment:         buildRiskAssessment(comparison, validation),
    statisticalSignificance:comparison.winRatePValue,
    confidenceScore:        validation.confidence,
    validationEvidence:     buildValidationEvidence(validation),
    potentialDrawbacks:     buildPotentialDrawbacks(comparison, validation),
    rollbackPlan,
    recommendationType:     type,
    status:                 "pending_approval",
  };
}
