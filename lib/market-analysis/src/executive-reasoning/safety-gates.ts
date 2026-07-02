// ─── Safety Gates ─────────────────────────────────────────────────────────────
// 7-gate pre-trade safety validation.
import type { SafetyGateResult, SafetyGateReport } from "./types.js";

interface SafetyInput {
  rulePassRate:        number;  // from strategy
  erbRiskScore:        number;  // ERB overall risk
  capitalHealthScore:  number;  // ERB capital health
  crisisStatus:        string;
  survivalModeActive:  boolean;
  evidenceQuality:     number;  // from evidence collection 0-100
  brokerReliability:   number;  // ERB broker score
  executiveConfidence: number;  // from EAI confidence engine
}

const GATE_THRESHOLDS = {
  rulePassRate:        70,
  erbRiskScore:        65,   // risk must be BELOW this
  capitalHealthScore:  40,
  evidenceQuality:     50,
  brokerReliability:   60,
  executiveConfidence: 55,
};

export function runSafetyGates(input: SafetyInput): SafetyGateReport {
  const gates: SafetyGateResult[] = [];

  // Gate 1: Deterministic strategy passed
  const g1pass = input.rulePassRate >= GATE_THRESHOLDS.rulePassRate;
  gates.push({
    gate:      "Deterministic Strategy",
    passed:    g1pass,
    value:     input.rulePassRate,
    threshold: GATE_THRESHOLDS.rulePassRate,
    message:   g1pass
      ? `Strategy rule pass rate ${input.rulePassRate.toFixed(0)}% meets 70% threshold`
      : `Strategy rule pass rate ${input.rulePassRate.toFixed(0)}% is below 70% required`,
    severity:  g1pass ? "info" : "critical",
  });

  // Gate 2: ERB risk within limits
  const g2pass = input.erbRiskScore <= GATE_THRESHOLDS.erbRiskScore;
  gates.push({
    gate:      "Risk Limits",
    passed:    g2pass,
    value:     input.erbRiskScore,
    threshold: GATE_THRESHOLDS.erbRiskScore,
    message:   g2pass
      ? `ERB risk score ${input.erbRiskScore.toFixed(0)} within limit of 65`
      : `ERB risk score ${input.erbRiskScore.toFixed(0)} exceeds limit of 65 — trading restricted`,
    severity:  g2pass ? "info" : "critical",
  });

  // Gate 3: Capital protection
  const g3pass = input.capitalHealthScore >= GATE_THRESHOLDS.capitalHealthScore;
  gates.push({
    gate:      "Capital Protection",
    passed:    g3pass,
    value:     input.capitalHealthScore,
    threshold: GATE_THRESHOLDS.capitalHealthScore,
    message:   g3pass
      ? `Capital health ${input.capitalHealthScore.toFixed(0)}% is adequate`
      : `Capital health ${input.capitalHealthScore.toFixed(0)}% is critically low — trading prohibited`,
    severity:  g3pass ? "info" : "critical",
  });

  // Gate 4: No active Emergency Mode
  const noEmergency = input.crisisStatus !== "emergency" && !input.survivalModeActive;
  gates.push({
    gate:      "Emergency Mode",
    passed:    noEmergency,
    value:     noEmergency ? 0 : 1,
    threshold: 0,
    message:   noEmergency
      ? `No active emergency mode — crisis=${input.crisisStatus}, survivalMode=${input.survivalModeActive}`
      : `Emergency mode active: crisis=${input.crisisStatus}, survivalMode=${input.survivalModeActive}`,
    severity:  noEmergency ? "info" : "critical",
  });

  // Gate 5: Data integrity
  const g5pass = input.evidenceQuality >= GATE_THRESHOLDS.evidenceQuality;
  gates.push({
    gate:      "Data Integrity",
    passed:    g5pass,
    value:     input.evidenceQuality,
    threshold: GATE_THRESHOLDS.evidenceQuality,
    message:   g5pass
      ? `Evidence quality ${input.evidenceQuality.toFixed(0)}% is acceptable`
      : `Evidence quality ${input.evidenceQuality.toFixed(0)}% is below 50% minimum — data integrity insufficient`,
    severity:  g5pass ? "info" : "warning",
  });

  // Gate 6: Broker reliability
  const g6pass = input.brokerReliability >= GATE_THRESHOLDS.brokerReliability;
  gates.push({
    gate:      "Broker Reliability",
    passed:    g6pass,
    value:     input.brokerReliability,
    threshold: GATE_THRESHOLDS.brokerReliability,
    message:   g6pass
      ? `Broker reliability ${input.brokerReliability.toFixed(0)}% meets 60% threshold`
      : `Broker reliability ${input.brokerReliability.toFixed(0)}% is below 60% minimum`,
    severity:  g6pass ? "info" : "warning",
  });

  // Gate 7: Executive confidence
  const g7pass = input.executiveConfidence >= GATE_THRESHOLDS.executiveConfidence;
  gates.push({
    gate:      "Executive Confidence",
    passed:    g7pass,
    value:     input.executiveConfidence,
    threshold: GATE_THRESHOLDS.executiveConfidence,
    message:   g7pass
      ? `Executive confidence ${input.executiveConfidence.toFixed(0)}% meets 55% minimum`
      : `Executive confidence ${input.executiveConfidence.toFixed(0)}% is below 55% minimum`,
    severity:  g7pass ? "info" : "warning",
  });

  const failedGates    = gates.filter(g => !g.passed).map(g => g.gate);
  const allPassed      = failedGates.length === 0;
  // Trading is only permitted if all critical gates pass
  const criticalFailed = gates.filter(g => !g.passed && g.severity === "critical");
  const tradingPermitted = criticalFailed.length === 0;

  const overrideReason = !tradingPermitted
    ? `Trade prohibited: ${criticalFailed.map(g => g.gate).join(", ")} gate(s) failed`
    : !allPassed
    ? `Warning: ${failedGates.join(", ")} gate(s) failed but trading permitted with caution`
    : null;

  return {
    allPassed,
    tradingPermitted,
    gates,
    failedGates,
    passedCount: gates.filter(g => g.passed).length,
    failedCount: failedGates.length,
    overrideReason,
  };
}

export { GATE_THRESHOLDS };
