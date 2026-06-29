import type { EnvironmentClass, MarketContextScore, StabilityAnalysis } from "./types.js";
import { ENVIRONMENT_THRESHOLDS } from "./types.js";

export interface ClassificationResult {
  classification: EnvironmentClass;
  evidence: string[];
  adjustedScore: number;
}

export function classifyEnvironment(
  mcs: MarketContextScore,
  stability: StabilityAnalysis,
): ClassificationResult {
  const evidence: string[] = [];
  let adjustedScore = mcs.score;

  if (stability.label === "very_unstable") {
    adjustedScore = Math.min(adjustedScore, ENVIRONMENT_THRESHOLDS.neutral - 1);
    evidence.push("Market environment is very unstable — maximum classification capped at Neutral");
  } else if (stability.label === "unstable") {
    adjustedScore = Math.min(adjustedScore, ENVIRONMENT_THRESHOLDS.good - 1);
    evidence.push("Market instability detected — maximum classification capped at Good");
  }

  const newsComp = mcs.components.find(c => c.dimension === "news");
  if (newsComp && newsComp.condition === "blocked") {
    adjustedScore = Math.min(adjustedScore, ENVIRONMENT_THRESHOLDS.difficult - 1);
    evidence.push("News environment is blocked — maximum classification capped at Difficult");
  }

  const corrComp = mcs.components.find(c => c.dimension === "correlation");
  if (corrComp && corrComp.condition === "extreme") {
    adjustedScore -= 10;
    evidence.push("Extreme correlation risk detected — score reduced by 10");
  }

  adjustedScore = Math.round(Math.min(100, Math.max(0, adjustedScore)));

  const classification = scoreToClass(adjustedScore);

  evidence.push(
    ...buildEvidenceLines(mcs, stability, classification),
  );

  return { classification, evidence, adjustedScore };
}

function scoreToClass(score: number): EnvironmentClass {
  if (score >= ENVIRONMENT_THRESHOLDS.excellent) return "excellent";
  if (score >= ENVIRONMENT_THRESHOLDS.good) return "good";
  if (score >= ENVIRONMENT_THRESHOLDS.neutral) return "neutral";
  if (score >= ENVIRONMENT_THRESHOLDS.difficult) return "difficult";
  return "dangerous";
}

function buildEvidenceLines(
  mcs: MarketContextScore,
  stability: StabilityAnalysis,
  classification: EnvironmentClass,
): string[] {
  const lines: string[] = [];

  lines.push(`Market Context Score: ${mcs.score}/100 → ${classification.toUpperCase()}`);
  lines.push(`Market stability: ${stability.label} (${stability.overallStability}/100)`);

  const topComp = [...mcs.components].sort((a, b) => b.weightedScore - a.weightedScore)[0];
  if (topComp) {
    lines.push(`Strongest driver: ${topComp.name} (${topComp.score}/100, weight ${(topComp.weight * 100).toFixed(0)}%)`);
  }

  const weakComp = [...mcs.components].sort((a, b) => a.weightedScore - b.weightedScore)[0];
  if (weakComp && weakComp.score < 40) {
    lines.push(`Weakest factor: ${weakComp.name} (${weakComp.score}/100) — dragging score down`);
  }

  if (mcs.sampleSize < 20) {
    lines.push(`Low historical sample (${mcs.sampleSize} trades) — scores have reduced confidence`);
  }

  if (stability.warnings.length > 0) {
    lines.push(`${stability.warnings.length} stability warning(s) detected`);
  }

  return lines;
}

export function classificationLabel(cls: EnvironmentClass): {
  label: string;
  color: string;
  description: string;
} {
  const map: Record<EnvironmentClass, { label: string; color: string; description: string }> = {
    excellent: {
      label: "Excellent",
      color: "emerald",
      description: "Historically optimal conditions — all factors favorable",
    },
    good: {
      label: "Good",
      color: "green",
      description: "Favorable conditions with minor reservations",
    },
    neutral: {
      label: "Neutral",
      color: "yellow",
      description: "Mixed conditions — some factors favorable, some unfavorable",
    },
    difficult: {
      label: "Difficult",
      color: "orange",
      description: "Unfavorable conditions — historically lower performance",
    },
    dangerous: {
      label: "Dangerous",
      color: "red",
      description: "Highly unfavorable conditions — historically significant losses",
    },
  };
  return map[cls];
}
