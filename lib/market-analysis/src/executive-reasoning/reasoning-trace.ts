// ─── Reasoning Trace Builder ─────────────────────────────────────────────────
import type {
  ReasoningTrace,
  ReasoningStage,
  EvidenceCollection,
  AdvisorAssessment,
  ConflictMatrix,
  DeliberationResult,
  SafetyGateReport,
} from "./types.js";
import type { EaiDecisionType } from "../executive-ai-core/types.js";

export function buildReasoningTrace(params: {
  reportId:         string;
  pair:             string;
  timeframe:        string;
  startedAt:        string;
  evidence:         EvidenceCollection;
  advisors:         AdvisorAssessment[];
  conflicts:        ConflictMatrix;
  deliberation:     DeliberationResult;
  safetyGates:      SafetyGateReport;
  finalDecision:    EaiDecisionType;
  finalScore:       number;
  finalConfidence:  number;
  engineVersion:    string;
}): ReasoningTrace {
  const {
    reportId, pair, timeframe, startedAt,
    evidence, advisors, conflicts, deliberation, safetyGates,
    finalDecision, finalScore, finalConfidence, engineVersion,
  } = params;

  const completedAt = new Date().toISOString();
  const durationMs  = Date.now() - new Date(startedAt).getTime();

  const stages: ReasoningStage[] = [
    {
      stageNumber: 1,
      stageName:   "Evidence Collection",
      completedAt: evidence.collectedAt,
      durationMs:  Math.round(durationMs * 0.15),
      success:     evidence.validItems > 0,
      summary:     `Collected ${evidence.totalItems} evidence items (${evidence.validItems} valid, quality: ${evidence.overallQuality}%)`,
    },
    {
      stageNumber: 2,
      stageName:   "Independent Advisor Assessment",
      completedAt: advisors[advisors.length - 1]?.timestamp ?? completedAt,
      durationMs:  Math.round(durationMs * 0.25),
      success:     advisors.length === 6,
      summary:     `${advisors.length} advisor assessments completed. ` +
        `Recommendations: ${[...new Set(advisors.map(a => a.recommendation))].join(", ")}`,
    },
    {
      stageNumber: 3,
      stageName:   "Conflict Detection",
      completedAt,
      durationMs:  Math.round(durationMs * 0.15),
      success:     true,
      summary:     conflicts.hasConflicts
        ? `${conflicts.entries.length} conflict(s) detected (level: ${conflicts.overallConflictLevel}, agreement: ${conflicts.agreementScore}%)`
        : `No conflicts — full advisor agreement (${conflicts.agreementScore}%)`,
    },
    {
      stageNumber: 4,
      stageName:   "Executive Deliberation",
      completedAt,
      durationMs:  Math.round(durationMs * 0.25),
      success:     true,
      summary:     `Selected '${deliberation.selectedAction}' with utility ${deliberation.selectedCandidate.utilityScore.toFixed(1)}. ` +
        `Utility gap to runner-up: ${deliberation.utilityGap.toFixed(1)}. ${deliberation.rejectedAlternatives.length} alternatives rejected.`,
    },
    {
      stageNumber: 5,
      stageName:   "Safety Gate Validation",
      completedAt,
      durationMs:  Math.round(durationMs * 0.20),
      success:     safetyGates.tradingPermitted || finalDecision !== "trade",
      summary:     safetyGates.allPassed
        ? `All ${safetyGates.passedCount} safety gates passed — trading permitted`
        : `${safetyGates.failedCount} gate(s) failed: ${safetyGates.failedGates.join(", ")}. Trading ${safetyGates.tradingPermitted ? "permitted with caution" : "prohibited"}.`,
    },
  ];

  // Build primary / secondary evidence from top advisors and evidence items
  const primaryEvidence = [
    ...evidence.items.filter(i => i.quality === "strong").slice(0, 3).map(i => `[${i.source}] ${i.dataType}: quality=${i.quality}`),
    ...deliberation.selectedCandidate.advisorSupport > 50
      ? [`Majority advisor support (${deliberation.selectedCandidate.advisorSupport.toFixed(0)}%)`]
      : [],
  ];

  const secondaryEvidence = [
    ...evidence.items.filter(i => i.quality === "moderate").slice(0, 3).map(i => `[${i.source}] ${i.dataType}`),
    `Conflict matrix: ${conflicts.overallConflictLevel} level`,
    `Safety gates: ${safetyGates.passedCount}/${safetyGates.gates.length} passed`,
  ];

  const riskSummary = safetyGates.failedGates.length > 0
    ? `Risk gates failed: ${safetyGates.failedGates.join(", ")}. ` +
      `Trading ${safetyGates.tradingPermitted ? "permitted with reduced confidence" : "prohibited"}.`
    : `All risk controls satisfied. System is in a healthy state for the selected action.`;

  const historicalComparison = `Deliberation selected '${finalDecision}' with utility score ${deliberation.selectedCandidate.utilityScore.toFixed(1)}. ` +
    `Historical reliability estimate: ${deliberation.selectedCandidate.historicalReliability.toFixed(0)}%. ` +
    `Advisor support: ${deliberation.selectedCandidate.advisorSupport.toFixed(0)}%.`;

  const justification = `Stage 1→5 reasoning pipeline completed in ${durationMs}ms. ` +
    deliberation.deliberationReason +
    (conflicts.hasConflicts ? ` Conflicts resolved: ${conflicts.overallConflictLevel} level.` : " No conflicts detected.") +
    ` Final decision: '${finalDecision}' (score=${finalScore.toFixed(1)}, confidence=${finalConfidence.toFixed(0)}%).`;

  return {
    traceId:              `trace_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    reportId,
    pair,
    timeframe,
    startedAt,
    completedAt,
    durationMs,
    stages,
    stage1_evidence:      evidence,
    stage2_advisors:      advisors,
    stage3_conflicts:     conflicts,
    stage4_deliberation:  deliberation,
    safetyGates,
    finalDecision,
    finalScore,
    finalConfidence,
    primaryEvidence,
    secondaryEvidence,
    riskSummary,
    historicalComparison,
    justification,
    engineVersion,
    isReplayable:         true,
  };
}
