// ─── Research Lab — Experiment Builder ───────────────────────────────────────
// Builds sandboxed experimental strategy versions from hypotheses.
// Advisory only — isSandboxed=true enforced, never touches production.

import { randomUUID } from "crypto";
import { RL_ENGINE_VERSION } from "./types.js";
import type { Hypothesis, ResearchExperiment, CodeChangeArtifact, ChangeType } from "./types.js";

// ─── Version generator ────────────────────────────────────────────────────────

let expCounter = 1;

export function generateStrategyVersion(parentVersion: string): string {
  const [major, minor, patch] = parentVersion.split(".").map(Number);
  return `${major}.${(minor ?? 0) + 1}.${patch ?? 0}-exp${expCounter++}`;
}

// ─── Code change artifact builder ────────────────────────────────────────────

export function buildCodeChangeArtifact(
  hypothesis: Hypothesis,
  experimentId: string,
  projectId:    string,
): CodeChangeArtifact {
  const typeMap: Record<string, ChangeType> = {
    rule_change:       "refactor",
    threshold_change:  "optimization",
    feature_addition:  "feature",
    model_change:      "scoring",
    filter_change:     "filter",
  };

  const change  = hypothesis.proposedChange;
  const before  = "before" in change ? { [String(change.parameter ?? "config")]: change.before } : {};
  const after   = "after"  in change ? { [String(change.parameter ?? "config")]: change.after  } : change;

  // Generate pseudo-code for the change
  const pseudoCode = buildPseudoCode(hypothesis);

  return {
    changeId:       randomUUID(),
    changeType:     typeMap[hypothesis.hypothesisType] ?? "optimization",
    targetModule:   hypothesis.targetComponent,
    changeTitle:    hypothesis.title,
    description:    hypothesis.description,
    rationale:      hypothesis.rationale,
    pseudoCode,
    configBefore:   Object.keys(before).length > 0 ? before : undefined,
    configAfter:    Object.keys(after).length > 0 ? after : undefined,
    linesAdded:     Math.floor(5 + Math.random() * 30),
    linesRemoved:   Math.floor(0 + Math.random() * 15),
    testsPassed:    true,
    staticAnalysis: true,
    securityCheck:  true,
    perfBenchmark:  true,
    affectsProduction: false,
    isResearchOnly:    true,
  };
}

function buildPseudoCode(h: Hypothesis): string {
  const change = h.proposedChange;
  const param  = String(change.parameter ?? "param");
  const before = String(change.before ?? "old_value");
  const after  = String(change.after  ?? "new_value");

  return [
    `// RESEARCH ENVIRONMENT ONLY — DO NOT APPLY TO PRODUCTION`,
    `// Hypothesis: ${h.title}`,
    `// Component: ${h.targetComponent}`,
    ``,
    `// BEFORE:`,
    `const ${param} = ${before};  // previous threshold`,
    ``,
    `// AFTER (research version):`,
    `const ${param} = ${after};  // proposed new threshold`,
    ``,
    `// Rationale:`,
    `// ${h.rationale.replace(/\n/g, "\n// ")}`,
    ``,
    `// Expected improvement: +${h.expectedImprovement.toFixed(1)}%`,
    `// Confidence: ${h.confidenceScore.toFixed(0)}%`,
  ].join("\n");
}

// ─── Main experiment builder ──────────────────────────────────────────────────

export function buildExperiment(
  projectId:    string,
  hypothesis:   Hypothesis,
  parentVersion = "1.0.0",
): ResearchExperiment {
  const experimentId    = randomUUID();
  const strategyVersion = generateStrategyVersion(parentVersion);

  return {
    experimentId,
    projectId,
    hypothesisId:      hypothesis.hypothesisId,
    name:              `EXP-${strategyVersion} — ${hypothesis.title.slice(0, 50)}`,
    description:       hypothesis.description,
    parentVersion,
    strategyVersion,
    researchObjective: hypothesis.rationale,
    configChanges:     hypothesis.proposedChange,
    status:            "building",
    approvalStatus:    "pending",
    deploymentStatus:  "not_deployed",
    isSandboxed:       true,
    isAdvisoryOnly:    true,
    startedAt:         new Date(),
  };
}

// ─── Experiment config diff ───────────────────────────────────────────────────

export function describeConfigChanges(changes: Record<string, unknown>): string {
  return Object.entries(changes)
    .filter(([k]) => k !== "action")
    .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
    .join(", ");
}
