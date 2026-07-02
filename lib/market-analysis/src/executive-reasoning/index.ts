// ─── Autonomous Executive Reasoning Engine — Orchestrator ────────────────────
// Phase 7.2 · 5-Stage Multi-Step Reasoning Pipeline

import { randomUUID } from "crypto";
import {
  ER_ENGINE_VERSION,
  type ExecutiveReasoningReport,
  type RunReasoningInput,
} from "./types.js";
import { collectEvidence }   from "./evidence-collector.js";
import { runAllAdvisors }    from "./advisor-engine.js";
import { buildConflictMatrix } from "./conflict-detector.js";
import { deliberate }        from "./deliberation-engine.js";
import { runSafetyGates }    from "./safety-gates.js";
import { buildReasoningTrace } from "./reasoning-trace.js";
import {
  runExecutiveAI,
  DECISION_LABELS,
  DECISION_DESCRIPTIONS,
} from "../executive-ai-core/index.js";

// Re-exports
export { ER_ENGINE_VERSION }                from "./types.js";
export type {
  ExecutiveReasoningReport,
  RunReasoningInput,
  ReasoningTrace,
  AdvisorAssessment,
  AdvisorId,
  ConflictMatrix,
  ConflictEntry,
  ConflictSeverity,
  CandidateAction,
  RejectedAlternative,
  DeliberationResult,
  SafetyGateReport,
  SafetyGateResult,
  EvidenceCollection,
  EvidenceItem,
}                                           from "./types.js";
export { collectEvidence }                  from "./evidence-collector.js";
export { runAllAdvisors, strategyAdvisor, marketAdvisor, riskAdvisor, memoryAdvisor, learningAdvisor, identityAdvisor } from "./advisor-engine.js";
export { buildConflictMatrix }              from "./conflict-detector.js";
export { deliberate, buildCandidates }      from "./deliberation-engine.js";
export { runSafetyGates, GATE_THRESHOLDS }  from "./safety-gates.js";
export { buildReasoningTrace }              from "./reasoning-trace.js";

// ─── Main orchestrator ────────────────────────────────────────────────────────

export async function runExecutiveReasoning(
  input: RunReasoningInput = {}
): Promise<ExecutiveReasoningReport> {
  const startedAt = new Date().toISOString();
  const {
    pair      = "EURUSD",
    timeframe = "15m",
    strategyResult = null,
    erbResult      = null,
    riResult       = null,
  } = input;

  const reportId = `er_${randomUUID().slice(0, 12)}`;

  // ── Stage 0: Run EAI Core to get composite decision ──────────────────────
  const executiveDecision = await runExecutiveAI({
    pair, timeframe,
    strategyResult: strategyResult as Record<string, unknown> | null,
    erbResult:      erbResult      as Record<string, unknown> | null,
    riResult:       riResult       as Record<string, unknown> | null,
  });

  // ── Stage 1: Evidence Collection ─────────────────────────────────────────
  const evidence = collectEvidence({
    pair, timeframe,
    strategyResult: strategyResult as Record<string, unknown> | null,
    erbResult:      erbResult      as Record<string, unknown> | null,
    riResult:       riResult       as Record<string, unknown> | null,
    now:            startedAt,
  });

  // ── Stage 2: Independent Advisor Assessments ──────────────────────────────
  const advisors = runAllAdvisors({
    strategyResult: strategyResult as Record<string, unknown> | null,
    erbResult:      erbResult      as Record<string, unknown> | null,
  });

  // ── Stage 3: Conflict Detection ───────────────────────────────────────────
  const conflictMatrix = buildConflictMatrix(advisors);

  // ── Stage 4: Executive Deliberation ──────────────────────────────────────
  const erbR        = (erbResult ?? {}) as Record<string, unknown>;
  const riskRec     = String(erbR.recommendation    ?? "trade_normally");
  const crisisSt    = String(erbR.crisisStatus      ?? "none");
  const survMode    = Boolean(erbR.survivalModeActive);

  const deliberation = deliberate({
    advisors,
    conflictMatrix,
    compositeScore:  executiveDecision.executiveScore,
    riskRec,
    crisisStatus:    crisisSt,
    survivalMode:    survMode,
  });

  // ── Safety Gates ──────────────────────────────────────────────────────────
  const stratR = (strategyResult ?? {}) as Record<string, unknown>;
  const safetyGates = runSafetyGates({
    rulePassRate:        Number(stratR.rulePassRate       ?? 70),
    erbRiskScore:        Number(erbR.overallRiskScore     ?? 30),
    capitalHealthScore:  Number(erbR.capitalHealthScore   ?? 75),
    crisisStatus:        crisisSt,
    survivalModeActive:  survMode,
    evidenceQuality:     evidence.overallQuality,
    brokerReliability:   Number(erbR.brokerReliabilityScore ?? 80),
    executiveConfidence: executiveDecision.executiveConfidence.overall,
  });

  // ── Stage 5: Final Decision ───────────────────────────────────────────────
  // If safety gates prohibit trading and deliberation says "trade" → override
  let finalAction = deliberation.selectedAction;
  if (finalAction === "trade" && !safetyGates.tradingPermitted) {
    finalAction = "observe";  // safest non-halt override
  }

  // ── Build Reasoning Trace ─────────────────────────────────────────────────
  const trace = buildReasoningTrace({
    reportId,
    pair,
    timeframe,
    startedAt,
    evidence,
    advisors,
    conflicts:       conflictMatrix,
    deliberation,
    safetyGates,
    finalDecision:   finalAction,
    finalScore:      executiveDecision.executiveScore,
    finalConfidence: executiveDecision.executiveConfidence.overall,
    engineVersion:   ER_ENGINE_VERSION,
  });

  const durationMs = Date.now() - new Date(startedAt).getTime();

  return {
    reportId,
    traceId:               trace.traceId,
    evaluatedAt:           new Date().toISOString(),
    pair,
    timeframe,

    executiveDecision,
    evidenceCollection:    evidence,
    advisorAssessments:    advisors,
    conflictMatrix,
    deliberationResult:    deliberation,
    safetyGateReport:      safetyGates,

    selectedAction:        finalAction,
    selectedActionLabel:   DECISION_LABELS[finalAction],
    executiveScore:        executiveDecision.executiveScore,
    executiveConfidence:   executiveDecision.executiveConfidence.overall,
    rejectedAlternatives:  deliberation.rejectedAlternatives,

    reasoningTrace:        trace,
    durationMs,
    engineVersion:         ER_ENGINE_VERSION,
    isAdvisoryOnly:        true,
  };
}
