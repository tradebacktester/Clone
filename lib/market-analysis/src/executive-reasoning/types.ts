// ─── Autonomous Executive Reasoning Engine — Types ────────────────────────────
// Phase 7.2

import type { EaiDecisionType, EaiIntelligenceInput, ExecutiveDecision } from "../executive-ai-core/types.js";

export const ER_ENGINE_VERSION = "1.0.0";

// ─── Stage 1: Evidence ────────────────────────────────────────────────────────

export interface EvidenceItem {
  evidenceId:   string;
  source:       string;
  dataType:     string;
  value:        unknown;
  quality:      "strong" | "moderate" | "weak" | "missing";
  freshness:    "fresh" | "stale" | "unknown";
  timestamp:    string;
}

export interface EvidenceCollection {
  collectionId:    string;
  collectedAt:     string;
  pair:            string;
  timeframe:       string;
  items:           EvidenceItem[];
  overallQuality:  number;     // 0-100
  missingItems:    string[];
  staleItems:      string[];
  validItems:      number;
  totalItems:      number;
}

// ─── Stage 2: Advisor Assessments ────────────────────────────────────────────

export type AdvisorId =
  | "strategy_advisor"
  | "market_advisor"
  | "risk_advisor"
  | "memory_advisor"
  | "learning_advisor"
  | "identity_advisor";

export interface AdvisorAssessment {
  advisorId:          AdvisorId;
  advisorName:        string;
  recommendation:     EaiDecisionType;
  confidence:         number;  // 0-100
  supportingEvidence: string[];
  reliability:        number;  // 0-100
  keyRisks:           string[];
  dataQuality:        "strong" | "moderate" | "weak" | "missing";
  reasoning:          string;
  timestamp:          string;
}

// ─── Stage 3: Conflict Detection ─────────────────────────────────────────────

export type ConflictSeverity = "none" | "low" | "moderate" | "high" | "critical";

export interface ConflictEntry {
  conflictId:       string;
  advisorA:         string;
  advisorB:         string;
  recommendationA:  EaiDecisionType;
  recommendationB:  EaiDecisionType;
  confidenceA:      number;
  confidenceB:      number;
  conflictType:     "opposing_recommendations" | "low_confidence_disagreement" |
                    "missing_evidence" | "stale_data" | "unstable_market" | "risk_policy_violation";
  severity:         ConflictSeverity;
  description:      string;
}

export interface ConflictMatrix {
  matrixId:          string;
  entries:           ConflictEntry[];
  hasConflicts:      boolean;
  criticalCount:     number;
  highCount:         number;
  moderateCount:     number;
  overallConflictLevel: ConflictSeverity;
  dominantPattern:   string;
  agreementScore:    number;   // 0-100 (100 = full agreement)
}

// ─── Stage 4: Deliberation ────────────────────────────────────────────────────

export interface CandidateAction {
  action:               EaiDecisionType;
  actionLabel:          string;
  expectedBenefit:      number;    // 0-100
  expectedRisk:         number;    // 0-100 (higher = worse)
  confidence:           number;    // 0-100
  historicalReliability: number;  // 0-100
  policyCompliance:     boolean;
  survivalImpact:       number;   // -100 to +100 (positive = good for survival)
  advisorSupport:       number;   // 0-100 (% of advisors recommending this)
  utilityScore:         number;   // composite
  isViable:             boolean;
  rejectionReason:      string | null;
}

export interface RejectedAlternative {
  action:          EaiDecisionType;
  actionLabel:     string;
  utilityScore:    number;
  rejectionReason: string;
  confidence:      number;
}

export interface DeliberationResult {
  deliberationId:     string;
  candidates:         CandidateAction[];
  selectedAction:     EaiDecisionType;
  selectedCandidate:  CandidateAction;
  rejectedAlternatives: RejectedAlternative[];
  utilityGap:         number;  // utility diff between 1st and 2nd
  deliberationReason: string;
}

// ─── Safety Gates ─────────────────────────────────────────────────────────────

export interface SafetyGateResult {
  gate:       string;
  passed:     boolean;
  value:      number;
  threshold:  number;
  message:    string;
  severity:   "info" | "warning" | "critical";
}

export interface SafetyGateReport {
  allPassed:        boolean;
  tradingPermitted: boolean;
  gates:            SafetyGateResult[];
  failedGates:      string[];
  passedCount:      number;
  failedCount:      number;
  overrideReason:   string | null;  // if trading blocked, why
}

// ─── Reasoning Trace ──────────────────────────────────────────────────────────

export interface ReasoningStage {
  stageNumber:   number;
  stageName:     string;
  completedAt:   string;
  durationMs:    number;
  success:       boolean;
  summary:       string;
}

export interface ReasoningTrace {
  traceId:          string;
  reportId:         string;
  pair:             string;
  timeframe:        string;
  startedAt:        string;
  completedAt:      string;
  durationMs:       number;

  // Stage-by-stage
  stages:           ReasoningStage[];
  stage1_evidence:  EvidenceCollection;
  stage2_advisors:  AdvisorAssessment[];
  stage3_conflicts: ConflictMatrix;
  stage4_deliberation: DeliberationResult;
  safetyGates:      SafetyGateReport;

  // Final
  finalDecision:    EaiDecisionType;
  finalScore:       number;
  finalConfidence:  number;
  primaryEvidence:  string[];
  secondaryEvidence: string[];
  riskSummary:      string;
  historicalComparison: string;
  justification:    string;

  // Meta
  engineVersion:    string;
  isReplayable:     true;
}

// ─── Executive Reasoning Report ───────────────────────────────────────────────

export interface ExecutiveReasoningReport {
  reportId:          string;
  traceId:           string;
  evaluatedAt:       string;
  pair:              string;
  timeframe:         string;

  // Subsystem decision
  executiveDecision: ExecutiveDecision;

  // Reasoning layers
  evidenceCollection:  EvidenceCollection;
  advisorAssessments:  AdvisorAssessment[];
  conflictMatrix:      ConflictMatrix;
  deliberationResult:  DeliberationResult;
  safetyGateReport:    SafetyGateReport;

  // Output
  selectedAction:      EaiDecisionType;
  selectedActionLabel: string;
  executiveScore:      number;
  executiveConfidence: number;
  rejectedAlternatives: RejectedAlternative[];

  // Trace
  reasoningTrace:     ReasoningTrace;
  durationMs:         number;
  engineVersion:      string;
  isAdvisoryOnly:     true;
}

// ─── Run Input ────────────────────────────────────────────────────────────────

export interface RunReasoningInput {
  pair?:        string;
  timeframe?:   string;
  strategyResult?: Record<string, unknown> | null;
  erbResult?:   Record<string, unknown> | null;
  riResult?:    Record<string, unknown> | null;
  weights?:     Record<string, number>;
}
