// ─── Explainer ────────────────────────────────────────────────────────────────
// Builds full human-readable explainability for every Executive Decision.

import type {
  EaiExplainability,
  EaiConflict,
  EaiContribution,
  EaiDecisionType,
  EaiConfidence,
} from "./types.js";
import { DECISION_LABELS } from "./types.js";

// ─── Agreed / disagreed systems ───────────────────────────────────────────────

function classifySystems(contributions: EaiContribution[]): {
  agreed: string[];
  disagreed: string[];
} {
  const agreed     = contributions.filter(c => c.position === "supporting").map(c => c.system);
  const disagreed  = contributions.filter(c => c.position === "opposing").map(c => c.system);
  return { agreed, disagreed };
}

// ─── Top evidence ─────────────────────────────────────────────────────────────

function extractTopEvidence(contributions: EaiContribution[], conflicts: EaiConflict[]): string[] {
  const evidence: string[] = [];
  for (const c of contributions.slice(0, 4)) {
    evidence.push(`${c.system} (${c.score.toFixed(0)}/100): ${c.keyFinding}`);
  }
  return evidence;
}

function extractContraEvidence(conflicts: EaiConflict[]): string[] {
  return conflicts.flatMap(c => c.rejectedEvidence).slice(0, 4);
}

// ─── Historical references ────────────────────────────────────────────────────

function buildHistoricalReferences(
  decision: EaiDecisionType,
  compositeScore: number,
  confidence: EaiConfidence
): string[] {
  return [
    `Decision threshold for '${DECISION_LABELS[decision]}': ${compositeScore >= 80 ? "≥80" : compositeScore >= 65 ? "65-79" : compositeScore >= 45 ? "45-64" : compositeScore >= 30 ? "30-44" : "< 30"} composite score`,
    `Confidence interval: [${confidence.confidenceInterval.lower.toFixed(1)}, ${confidence.confidenceInterval.upper.toFixed(1)}]`,
    `Historical reliability rating: ${confidence.reliabilityRating}`,
    `System reliability: ${confidence.systemReliability.toFixed(0)}% — infrastructure and broker health`,
  ];
}

// ─── Why narrative ────────────────────────────────────────────────────────────

function buildWhyNarrative(
  decision: EaiDecisionType,
  compositeScore: number,
  agreed: string[],
  disagreed: string[],
  conflicts: EaiConflict[],
  vetoApplied: boolean,
  vetoReason: string | null,
  mostInfluential: string
): string {
  let narrative = `Executive AI produced a '${DECISION_LABELS[decision]}' decision with composite score ${compositeScore.toFixed(1)}/100. `;

  if (vetoApplied && vetoReason) {
    narrative += `A risk veto was applied: ${vetoReason}. `;
  }

  if (agreed.length > 0) {
    narrative += `${agreed.length} subsystem(s) support this decision: ${agreed.join(", ")}. `;
  }

  if (disagreed.length > 0) {
    narrative += `${disagreed.length} subsystem(s) raised concern: ${disagreed.join(", ")}. `;
  }

  if (conflicts.length > 0) {
    const critical = conflicts.filter(c => c.severity === "critical" || c.severity === "high");
    narrative += `${conflicts.length} inter-system conflict(s) detected${critical.length > 0 ? ` (${critical.length} high/critical)` : ""}. `;
  }

  narrative += `Most influential system: ${mostInfluential}.`;
  return narrative;
}

// ─── Executive summary ────────────────────────────────────────────────────────

function buildExecutiveSummary(
  decision: EaiDecisionType,
  compositeScore: number,
  confidence: EaiConfidence,
  conflicts: EaiConflict[]
): string {
  const status = compositeScore >= 80 ? "all clear" : compositeScore >= 65 ? "cautious" : compositeScore >= 45 ? "mixed" : "risk-elevated";
  return (
    `KRYTOS Executive AI: ${DECISION_LABELS[decision].toUpperCase()} | ` +
    `Score ${compositeScore.toFixed(0)}/100 | ` +
    `Confidence ${confidence.overall.toFixed(0)}% (${confidence.reliabilityRating}) | ` +
    `${conflicts.length} conflict(s) | ` +
    `Status: ${status}`
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function buildExplainability(params: {
  decision: EaiDecisionType;
  compositeScore: number;
  contributions: EaiContribution[];
  conflicts: EaiConflict[];
  confidence: EaiConfidence;
  vetoApplied: boolean;
  vetoReason: string | null;
}): EaiExplainability {
  const { agreed, disagreed } = classifySystems(params.contributions);
  const mostInfluential = params.contributions[0]?.system ?? "Strategy Intelligence";

  const topEvidence    = extractTopEvidence(params.contributions, params.conflicts);
  const contraEvidence = extractContraEvidence(params.conflicts);
  const historical     = buildHistoricalReferences(params.decision, params.compositeScore, params.confidence);

  const why = buildWhyNarrative(
    params.decision, params.compositeScore,
    agreed, disagreed,
    params.conflicts,
    params.vetoApplied, params.vetoReason,
    mostInfluential
  );

  return {
    whyThisDecision:     why,
    agreedSystems:        agreed,
    disagreedSystems:     disagreed,
    mostInfluentialSystem: mostInfluential,
    topEvidence,
    contraEvidence,
    confidence:           params.confidence.overall,
    reliability:          params.confidence.reliabilityRating,
    historicalReferences: historical,
    executiveSummary:     buildExecutiveSummary(params.decision, params.compositeScore, params.confidence, params.conflicts),
  };
}
