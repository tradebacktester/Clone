// ─── Research Lab — Approval Workflow ────────────────────────────────────────
// Manages the human-approval gate before any production deployment.
// No deployment occurs without explicit approval — enforced by design.

import { randomUUID } from "crypto";
import type { DeploymentRecommendation, ApprovalDecision } from "./types.js";

// ─── Approval request builder ─────────────────────────────────────────────────

export interface ApprovalRequest {
  queueId:          string;
  recommendationId: string;
  experimentId:     string;
  projectId:        string;
  title:            string;
  summary:          string;
  priority:         "critical" | "high" | "medium" | "low";
  requestedAt:      Date;
  expiresAt:        Date;
  status:           "pending" | "decided" | "expired";
}

export function buildApprovalRequest(
  recommendation: DeploymentRecommendation,
  projectId:      string,
  ttlHours        = 72,
): ApprovalRequest {
  const now = new Date();
  const priority =
    recommendation.recommendationType === "deploy"    ? "high"   :
    recommendation.recommendationType === "rollback"  ? "critical":
    "medium";

  const expiresAt = new Date(now.getTime() + ttlHours * 3600 * 1000);

  return {
    queueId:          randomUUID(),
    recommendationId: recommendation.recommendationId,
    experimentId:     recommendation.experimentId,
    projectId,
    title:            recommendation.title,
    summary:          recommendation.summary,
    priority,
    requestedAt:      now,
    expiresAt,
    status:           "pending",
  };
}

// ─── Decision processor ───────────────────────────────────────────────────────

export interface ApprovalDecisionResult {
  queueId:        string;
  decision:       ApprovalDecision;
  decidedAt:      Date;
  decidedBy:      string;
  decisionReason: string;
  nextAction:     string;
  isAdvisoryOnly: boolean;
}

export function processDecision(
  queueId:        string,
  decision:       ApprovalDecision,
  reason          = "",
  decidedBy       = "operator",
): ApprovalDecisionResult {
  const nextActionMap: Record<ApprovalDecision, string> = {
    approved:        "Proceed with controlled deployment to research environment validation. Production deployment requires additional sign-off.",
    rejected:        "Archive experimental version. Generate post-mortem report. Start new research cycle.",
    more_testing:    "Return experiment to validation pipeline. Extend paper trading period by 30 days.",
    continue_paper:  "Continue paper trading simulation. Review again after next performance cycle.",
    archived:        "Archive experiment and associated recommendation. Close research project if no active hypotheses remain.",
  };

  return {
    queueId,
    decision,
    decidedAt:      new Date(),
    decidedBy,
    decisionReason: reason || `Operator decision: ${decision}.`,
    nextAction:     nextActionMap[decision],
    isAdvisoryOnly: true,
  };
}

// ─── Rollback detection ───────────────────────────────────────────────────────

export interface DegradationAlert {
  alertId:     string;
  severity:    "critical" | "high" | "medium";
  metric:      string;
  prodValue:   number;
  currentValue:number;
  degradationPct:number;
  description: string;
  recommendation: string;
  detectedAt:  Date;
}

export function detectDegradation(
  deployedWinRate:  number,
  currentWinRate:   number,
  deployedPf:       number,
  currentPf:        number,
  sampleSize:       number,
): DegradationAlert[] {
  if (sampleSize < 10) return [];

  const alerts: DegradationAlert[] = [];

  const wrDrop = deployedWinRate - currentWinRate;
  if (wrDrop > 0.08) {
    alerts.push({
      alertId:      randomUUID(),
      severity:     wrDrop > 0.15 ? "critical" : "high",
      metric:       "win_rate",
      prodValue:    deployedWinRate,
      currentValue: currentWinRate,
      degradationPct: (wrDrop / deployedWinRate) * 100,
      description:  `Win rate dropped from ${(deployedWinRate * 100).toFixed(1)}% to ${(currentWinRate * 100).toFixed(1)}% — ${(wrDrop * 100).toFixed(1)}pp regression.`,
      recommendation: "Recommend rollback to previous approved version. Present evidence to operator for approval.",
      detectedAt:   new Date(),
    });
  }

  const pfDrop = deployedPf - currentPf;
  if (pfDrop > 0.2 && currentPf < 1.0) {
    alerts.push({
      alertId:      randomUUID(),
      severity:     currentPf < 0.8 ? "critical" : "high",
      metric:       "profit_factor",
      prodValue:    deployedPf,
      currentValue: currentPf,
      degradationPct: (pfDrop / deployedPf) * 100,
      description:  `Profit factor dropped from ${deployedPf.toFixed(2)} to ${currentPf.toFixed(2)} — strategy no longer profitable.`,
      recommendation: "Recommend rollback and immediate investigation.",
      detectedAt:   new Date(),
    });
  }

  return alerts;
}
