// ─── Stage 4: Executive Deliberation ─────────────────────────────────────────
import { randomUUID } from "crypto";
import type {
  AdvisorAssessment,
  ConflictMatrix,
  CandidateAction,
  RejectedAlternative,
  DeliberationResult,
} from "./types.js";
import type { EaiDecisionType } from "../executive-ai-core/types.js";
import { DECISION_LABELS } from "../executive-ai-core/types.js";

const ALL_ACTIONS: EaiDecisionType[] = [
  "trade", "wait", "observe", "reduce_risk", "pause_trading", "emergency_halt",
];

// ─── Expected benefit per action (intrinsic) ──────────────────────────────────

const INTRINSIC_BENEFIT: Record<EaiDecisionType, number> = {
  trade:          90,
  wait:           55,
  observe:        40,
  reduce_risk:    30,
  pause_trading:  20,
  emergency_halt: 10,
};

const INTRINSIC_RISK: Record<EaiDecisionType, number> = {
  trade:          60,  // highest execution risk
  wait:           20,
  observe:        10,
  reduce_risk:    15,
  pause_trading:  5,
  emergency_halt: 5,
};

const SURVIVAL_IMPACT: Record<EaiDecisionType, number> = {
  trade:          30,   // can improve equity
  wait:           10,
  observe:        5,
  reduce_risk:    20,   // protects capital
  pause_trading:  40,
  emergency_halt: 60,   // maximum capital preservation
};

// ─── Per-action advisor support ───────────────────────────────────────────────

function advisorSupport(action: EaiDecisionType, advisors: AdvisorAssessment[]): number {
  if (advisors.length === 0) return 50;
  const supporting = advisors.filter(a => a.recommendation === action).length;
  return Math.round((supporting / advisors.length) * 100);
}

// ─── Historical reliability per action (static estimate for now) ──────────────

function historicalReliability(action: EaiDecisionType, compositeScore: number): number {
  const baseRel: Record<EaiDecisionType, number> = {
    trade:          compositeScore >= 80 ? 75 : 55,
    wait:           70,
    observe:        65,
    reduce_risk:    80,
    pause_trading:  85,
    emergency_halt: 90,
  };
  return baseRel[action] ?? 60;
}

// ─── Policy compliance ────────────────────────────────────────────────────────

function policyCompliant(
  action: EaiDecisionType,
  riskRec: string,
  crisisStatus: string,
  survivalMode: boolean
): boolean {
  if (survivalMode && action === "trade") return false;
  if (crisisStatus === "emergency" && ["trade", "wait"].includes(action)) return false;
  if (riskRec === "emergency_stop" && action !== "emergency_halt") return false;
  if (riskRec === "survival_mode" && ["trade", "wait", "observe"].includes(action)) return false;
  return true;
}

// ─── Utility formula ──────────────────────────────────────────────────────────

function computeUtility(c: CandidateAction, conflictPenalty: number): number {
  if (!c.policyCompliance) return -999;
  const benefitTerm  = c.expectedBenefit * (c.confidence / 100) * (c.historicalReliability / 100);
  const riskTerm     = c.expectedRisk * 1.5;
  const supportBonus = c.advisorSupport * 0.20;
  const survivalBonus = c.survivalImpact * 0.10;
  return benefitTerm - riskTerm + supportBonus + survivalBonus - conflictPenalty;
}

// ─── Build candidates ─────────────────────────────────────────────────────────

export function buildCandidates(params: {
  advisors:       AdvisorAssessment[];
  conflictMatrix: ConflictMatrix;
  compositeScore: number;
  riskRec:        string;
  crisisStatus:   string;
  survivalMode:   boolean;
}): CandidateAction[] {
  const { advisors, conflictMatrix, compositeScore, riskRec, crisisStatus, survivalMode } = params;
  const conflictPenalty = conflictMatrix.criticalCount * 8 + conflictMatrix.highCount * 4;

  return ALL_ACTIONS.map(action => {
    const benefit   = INTRINSIC_BENEFIT[action];
    const risk      = INTRINSIC_RISK[action];
    const support   = advisorSupport(action, advisors);
    const historical = historicalReliability(action, compositeScore);
    const survival  = SURVIVAL_IMPACT[action];
    const compliant = policyCompliant(action, riskRec, crisisStatus, survivalMode);

    // Average confidence of advisors recommending this action
    const supportingAdvisors = advisors.filter(a => a.recommendation === action);
    const confidence = supportingAdvisors.length > 0
      ? supportingAdvisors.reduce((s, a) => s + a.confidence, 0) / supportingAdvisors.length
      : (compositeScore * 0.6 + 20);

    const cand: CandidateAction = {
      action,
      actionLabel:          DECISION_LABELS[action],
      expectedBenefit:      benefit,
      expectedRisk:         risk,
      confidence:           Math.min(95, Math.max(10, confidence)),
      historicalReliability: historical,
      policyCompliance:     compliant,
      survivalImpact:       survival,
      advisorSupport:       support,
      utilityScore:         0,  // computed below
      isViable:             compliant,
      rejectionReason:      !compliant ? `Policy non-compliant: risk=${riskRec}, crisis=${crisisStatus}, survivalMode=${survivalMode}` : null,
    };
    cand.utilityScore = computeUtility(cand, conflictPenalty);
    return cand;
  });
}

// ─── Select action ────────────────────────────────────────────────────────────

export function deliberate(params: {
  advisors:       AdvisorAssessment[];
  conflictMatrix: ConflictMatrix;
  compositeScore: number;
  riskRec:        string;
  crisisStatus:   string;
  survivalMode:   boolean;
}): DeliberationResult {
  const candidates = buildCandidates(params);
  const viable     = candidates.filter(c => c.isViable).sort((a, b) => b.utilityScore - a.utilityScore);

  // Fallback: if nothing is viable (edge case), pick emergency_halt
  const selected   = viable[0] ?? candidates.find(c => c.action === "emergency_halt")!;
  const runner     = viable[1];
  const utilityGap = runner ? selected.utilityScore - runner.utilityScore : 0;

  const rejectedAlternatives: RejectedAlternative[] = candidates
    .filter(c => c.action !== selected.action)
    .map(c => ({
      action:          c.action,
      actionLabel:     c.actionLabel,
      utilityScore:    Math.round(c.utilityScore * 10) / 10,
      rejectionReason: c.rejectionReason
        ?? `Lower utility (${c.utilityScore.toFixed(1)} vs ${selected.utilityScore.toFixed(1)})`,
      confidence:      c.confidence,
    }))
    .sort((a, b) => b.utilityScore - a.utilityScore);

  const topAdvisors = params.advisors.filter(a => a.recommendation === selected.action).map(a => a.advisorName);
  const reason = selected.utilityScore > 0
    ? `'${selected.actionLabel}' has highest utility score (${selected.utilityScore.toFixed(1)}) among viable candidates. ` +
      `Supported by: ${topAdvisors.join(", ") || "weighted composite"}. Utility gap to runner-up: ${utilityGap.toFixed(1)}.`
    : `All positive utility options are policy non-compliant. Falling back to emergency-safe action.`;

  return {
    deliberationId:      `del_${randomUUID().slice(0, 8)}`,
    candidates,
    selectedAction:      selected.action,
    selectedCandidate:   selected,
    rejectedAlternatives,
    utilityGap:          Math.round(utilityGap * 10) / 10,
    deliberationReason:  reason,
  };
}
