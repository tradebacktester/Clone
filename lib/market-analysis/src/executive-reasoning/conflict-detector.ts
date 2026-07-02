// ─── Stage 3: Conflict Detection ─────────────────────────────────────────────
import { randomUUID } from "crypto";
import type { AdvisorAssessment, ConflictEntry, ConflictMatrix, ConflictSeverity } from "./types.js";
import type { EaiDecisionType } from "../executive-ai-core/types.js";

const DECISION_RANK: Record<EaiDecisionType, number> = {
  trade:          5,
  wait:           4,
  observe:        3,
  reduce_risk:    2,
  pause_trading:  1,
  emergency_halt: 0,
};

function rankDiff(a: EaiDecisionType, b: EaiDecisionType): number {
  return Math.abs(DECISION_RANK[a] - DECISION_RANK[b]);
}

function conflictSeverity(diff: number): ConflictSeverity {
  if (diff >= 4) return "critical";
  if (diff >= 3) return "high";
  if (diff >= 2) return "moderate";
  if (diff >= 1) return "low";
  return "none";
}

// ─── Detect opposing recommendations ─────────────────────────────────────────

function detectOpposing(advisors: AdvisorAssessment[]): ConflictEntry[] {
  const conflicts: ConflictEntry[] = [];
  for (let i = 0; i < advisors.length; i++) {
    for (let j = i + 1; j < advisors.length; j++) {
      const a = advisors[i];
      const b = advisors[j];
      const diff = rankDiff(a.recommendation, b.recommendation);
      if (diff < 2) continue;  // minor divergence is ok

      const sev = conflictSeverity(diff);
      conflicts.push({
        conflictId:      `c_${randomUUID().slice(0, 6)}`,
        advisorA:        a.advisorName,
        advisorB:        b.advisorName,
        recommendationA: a.recommendation,
        recommendationB: b.recommendation,
        confidenceA:     a.confidence,
        confidenceB:     b.confidence,
        conflictType:    "opposing_recommendations",
        severity:        sev,
        description:     `${a.advisorName} recommends '${a.recommendation}' but ${b.advisorName} recommends '${b.recommendation}' — divergence of ${diff} rank levels`,
      });
    }
  }
  return conflicts;
}

// ─── Detect low-confidence disagreements ─────────────────────────────────────

function detectLowConfidenceDisagreement(advisors: AdvisorAssessment[]): ConflictEntry[] {
  const conflicts: ConflictEntry[] = [];
  const lowConf = advisors.filter(a => a.confidence < 45);
  if (lowConf.length === 0) return conflicts;

  const highConf = advisors.filter(a => a.confidence >= 70);
  if (highConf.length === 0) return conflicts;

  for (const l of lowConf) {
    for (const h of highConf) {
      if (l.recommendation === h.recommendation) continue;
      conflicts.push({
        conflictId:      `c_${randomUUID().slice(0, 6)}`,
        advisorA:        h.advisorName,
        advisorB:        l.advisorName,
        recommendationA: h.recommendation,
        recommendationB: l.recommendation,
        confidenceA:     h.confidence,
        confidenceB:     l.confidence,
        conflictType:    "low_confidence_disagreement",
        severity:        "moderate",
        description:     `${l.advisorName} (confidence ${l.confidence.toFixed(0)}%) disagrees with high-confidence ${h.advisorName} (${h.confidence.toFixed(0)}%)`,
      });
    }
  }
  return conflicts;
}

// ─── Detect missing evidence ──────────────────────────────────────────────────

function detectMissingEvidence(advisors: AdvisorAssessment[]): ConflictEntry[] {
  const missing = advisors.filter(a => a.dataQuality === "missing");
  if (missing.length === 0) return [];

  return missing.map(a => ({
    conflictId:      `c_${randomUUID().slice(0, 6)}`,
    advisorA:        a.advisorName,
    advisorB:        "Evidence System",
    recommendationA: a.recommendation,
    recommendationB: "observe" as EaiDecisionType,
    confidenceA:     a.confidence,
    confidenceB:     0,
    conflictType:    "missing_evidence" as const,
    severity:        "moderate" as ConflictSeverity,
    description:     `${a.advisorName} has missing data quality — recommendation is unreliable`,
  }));
}

// ─── Detect risk-policy violations ───────────────────────────────────────────

function detectRiskPolicyViolations(advisors: AdvisorAssessment[]): ConflictEntry[] {
  const conflicts: ConflictEntry[] = [];
  const riskAdv = advisors.find(a => a.advisorId === "risk_advisor");
  if (!riskAdv) return conflicts;

  const restrictive = ["pause_trading", "emergency_halt", "reduce_risk"] as EaiDecisionType[];
  if (!restrictive.includes(riskAdv.recommendation)) return conflicts;

  // Any advisor recommending trade or wait while risk says restrict
  for (const a of advisors) {
    if (a.advisorId === "risk_advisor") continue;
    if (!["trade", "wait"].includes(a.recommendation)) continue;
    const diff = rankDiff(a.recommendation, riskAdv.recommendation);
    if (diff < 2) continue;

    conflicts.push({
      conflictId:      `c_${randomUUID().slice(0, 6)}`,
      advisorA:        a.advisorName,
      advisorB:        riskAdv.advisorName,
      recommendationA: a.recommendation,
      recommendationB: riskAdv.recommendation,
      confidenceA:     a.confidence,
      confidenceB:     riskAdv.confidence,
      conflictType:    "risk_policy_violation",
      severity:        diff >= 3 ? "critical" : "high",
      description:     `${a.advisorName} recommends '${a.recommendation}' but Risk Advisor mandates '${riskAdv.recommendation}' — risk policy violation`,
    });
  }
  return conflicts;
}

// ─── Build conflict matrix ────────────────────────────────────────────────────

export function buildConflictMatrix(advisors: AdvisorAssessment[]): ConflictMatrix {
  const allConflicts: ConflictEntry[] = [
    ...detectOpposing(advisors),
    ...detectLowConfidenceDisagreement(advisors),
    ...detectMissingEvidence(advisors),
    ...detectRiskPolicyViolations(advisors),
  ];

  // Deduplicate by advisorA+advisorB pair keeping highest severity
  const seen = new Map<string, ConflictEntry>();
  for (const c of allConflicts) {
    const key = [c.advisorA, c.advisorB].sort().join("||");
    const existing = seen.get(key);
    if (!existing || conflictSeverity_rank(c.severity) > conflictSeverity_rank(existing.severity)) {
      seen.set(key, c);
    }
  }
  const entries = [...seen.values()];

  const criticalCount  = entries.filter(c => c.severity === "critical").length;
  const highCount      = entries.filter(c => c.severity === "high").length;
  const moderateCount  = entries.filter(c => c.severity === "moderate").length;

  const overallLevel: ConflictSeverity =
    criticalCount > 0 ? "critical" :
    highCount > 0     ? "high" :
    moderateCount > 0 ? "moderate" :
    entries.length > 0 ? "low" : "none";

  // Agreement score: % of advisor pairs that agree (same recommendation)
  const pairs = advisors.length * (advisors.length - 1) / 2;
  const agreeingPairs = pairs - entries.filter(c => c.conflictType === "opposing_recommendations").length;
  const agreementScore = pairs > 0 ? Math.round((agreeingPairs / pairs) * 100) : 100;

  const typeCount: Record<string, number> = {};
  for (const c of entries) typeCount[c.conflictType] = (typeCount[c.conflictType] ?? 0) + 1;
  const dominantPattern = Object.entries(typeCount).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "none";

  return {
    matrixId:             `cm_${randomUUID().slice(0, 8)}`,
    entries,
    hasConflicts:         entries.length > 0,
    criticalCount,
    highCount,
    moderateCount,
    overallConflictLevel: overallLevel,
    dominantPattern,
    agreementScore,
  };
}

function conflictSeverity_rank(s: ConflictSeverity): number {
  return { none: 0, low: 1, moderate: 2, high: 3, critical: 4 }[s] ?? 0;
}
