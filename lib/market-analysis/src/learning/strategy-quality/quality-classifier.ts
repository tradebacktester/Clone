// ─── Quality Classifier ───────────────────────────────────────────────────────
// Maps a Strategy Quality Score to one of 7 measurable classifications.
// Advisory only.

import {
  QUALITY_CLASSIFICATION_THRESHOLDS,
  QUALITY_CLASSIFICATION_LABELS,
  sqsToClassification,
} from "./types.js";
import type { QualityClassificationResult, SqsComponent } from "./types.js";

export function classifyQuality(
  sqs: number,
  components: SqsComponent[],
): QualityClassificationResult {
  const classification = sqsToClassification(sqs);
  const label          = QUALITY_CLASSIFICATION_LABELS[classification];

  // Find threshold that was met and next threshold above
  let thresholdMet  = 0;
  let nextThreshold: number | null = null;
  for (let i = 0; i < QUALITY_CLASSIFICATION_THRESHOLDS.length; i++) {
    const [thr] = QUALITY_CLASSIFICATION_THRESHOLDS[i]!;
    if (sqs >= thr) {
      thresholdMet = thr;
      // Next tier threshold (the one above this)
      nextThreshold = i > 0 ? (QUALITY_CLASSIFICATION_THRESHOLDS[i - 1]![0] ?? null) : null;
      break;
    }
  }
  const gapToNext = nextThreshold !== null ? nextThreshold - sqs : null;

  // Measurable reasons based on component scores
  const measurableReasons: string[] = [];
  const strong   = components.filter(c => c.score >= 70).map(c => `${c.name}: ${c.score.toFixed(0)}`);
  const weak     = components.filter(c => c.score < 45).map(c => `${c.name}: ${c.score.toFixed(0)}`);
  const moderate = components.filter(c => c.score >= 45 && c.score < 70).map(c => `${c.name}: ${c.score.toFixed(0)}`);

  if (strong.length   > 0) measurableReasons.push(`Strong components (≥70): ${strong.join(", ")}`);
  if (moderate.length > 0) measurableReasons.push(`Moderate components (45–69): ${moderate.join(", ")}`);
  if (weak.length     > 0) measurableReasons.push(`Weak components (<45): ${weak.join(", ")}`);
  measurableReasons.push(`SQS: ${sqs.toFixed(2)} / 100`);

  // Justification narrative
  let justification = "";
  switch (classification) {
    case "institutional_grade":
      justification = `SQS of ${sqs.toFixed(1)} exceeds the institutional threshold (90). All or nearly all evaluation dimensions reach elite quality. This setup mirrors institutional trade criteria.`;
      break;
    case "elite":
      justification = `SQS of ${sqs.toFixed(1)} qualifies as Elite (80–89). Multi-dimensional quality is outstanding — the setup demonstrates professional-grade structure, confirmation, and market alignment.`;
      break;
    case "excellent":
      justification = `SQS of ${sqs.toFixed(1)} qualifies as Excellent (70–79). The setup shows consistently high scores across most dimensions with only minor weaknesses.`;
      break;
    case "strong":
      justification = `SQS of ${sqs.toFixed(1)} qualifies as Strong (60–69). Solid setup with clear strengths; one or two dimensions below ideal but overall above average.`;
      break;
    case "average":
      justification = `SQS of ${sqs.toFixed(1)} qualifies as Average (45–59). The setup meets minimum standards but lacks the multi-dimensional conviction required for high-confidence entries.`;
      break;
    case "weak":
      justification = `SQS of ${sqs.toFixed(1)} qualifies as Weak (25–44). Multiple dimensions underperform; the setup does not meet quality standards for reliable execution.`;
      break;
    case "reject":
      justification = `SQS of ${sqs.toFixed(1)} falls below the minimum threshold (25). This setup fails across multiple critical evaluation dimensions and should not be considered.`;
      break;
  }

  return {
    classification,
    classificationLabel: label,
    sqs,
    justification,
    measurableReasons,
    thresholdMet,
    nextThreshold,
    gapToNext,
  };
}
