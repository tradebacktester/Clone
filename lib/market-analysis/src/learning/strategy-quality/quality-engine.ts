// ─── Strategy Quality Intelligence Engine ────────────────────────────────────
// Main orchestrator — runs all 7 analyzers and assembles the full quality report.
// Advisory only. Never modifies strategy or executes trades.

import { randomUUID } from "crypto";
import { clamp } from "./types.js";
import type { QualitySetup, StrategyQualityReport, ExtractedFeature } from "./types.js";
import { SQI_ENGINE_VERSION } from "./types.js";
import { evaluateRuleIntegrity }            from "./rule-integrity-evaluator.js";
import { analyzeStructuralQuality }         from "./structural-quality-analyzer.js";
import { analyzeLiquidityIntelligence }     from "./liquidity-intelligence-analyzer.js";
import { analyzeAmdIntelligence }           from "./amd-intelligence-analyzer.js";
import { analyzeConfirmationIntelligence }  from "./confirmation-intelligence-analyzer.js";
import { integrateMarketIntelligence }      from "./market-intelligence-integrator.js";
import { analyzeHistoricalIntelligence }    from "./historical-intelligence-analyzer.js";
import { calculateSqs }                     from "./sqs-calculator.js";
import { classifyQuality }                  from "./quality-classifier.js";

// ─── Narrative builder ────────────────────────────────────────────────────────

function buildQualityNarrative(
  report: Omit<StrategyQualityReport, "qualityNarrative" | "isAdvisoryOnly">,
): string {
  const { classification, strategyQualityScore: sqs, setup } = report;
  const cls = classification.classificationLabel;
  const lines: string[] = [];
  lines.push(`${cls} — SQS: ${sqs.toFixed(1)}/100`);
  lines.push(
    `${setup.pair} | ${setup.session} session | ${setup.regime} regime | ${setup.trend} trend.`,
  );

  // Top drivers
  const top = report.strongestComponents.join(" and ");
  const weak = report.weakestComponents.join(" and ");
  if (top)  lines.push(`Primary quality drivers: ${top}.`);
  if (weak) lines.push(`Weakest dimensions: ${weak}.`);

  // Structural
  const sq = report.structuralQuality.structuralQualityScore;
  if (sq >= 75) lines.push("Structural quality is high — clean market structure with well-defined zones.");
  else if (sq < 50) lines.push("Structural quality is below standard — zone definition requires improvement.");

  // Historical
  const hi = report.historicalIntelligence;
  if (hi.evidenceCount >= 5) {
    lines.push(
      `Historical evidence: ${hi.evidenceCount} similar trades — ${(hi.winRate * 100).toFixed(1)}% win rate, avg RR ${hi.averageRR.toFixed(2)}.`,
    );
  } else {
    lines.push("Historical evidence: insufficient comparable trades — score should be treated as indicative.");
  }

  // Classification justification
  lines.push(classification.justification);

  return lines.join(" ");
}

// ─── Main entry point ─────────────────────────────────────────────────────────

export function runQualityEngine(
  setup: QualitySetup,
  historicalFeatures: ExtractedFeature[] = [],
): StrategyQualityReport {
  const now = setup.evaluatedAt ?? new Date();

  // Step 1 — Rule Integrity
  const ruleIntegrity = evaluateRuleIntegrity(setup);

  // Step 2 — Structural Quality
  const structuralQuality = analyzeStructuralQuality(setup);

  // Step 3 — Liquidity Intelligence
  const liquidityIntelligence = analyzeLiquidityIntelligence(setup);

  // Step 4 — AMD Intelligence
  const amdIntelligence = analyzeAmdIntelligence(setup);

  // Step 5 — Confirmation Intelligence
  const confirmationIntelligence = analyzeConfirmationIntelligence(setup);

  // Step 6 — Market Intelligence
  const marketIntelligence = integrateMarketIntelligence(setup);

  // Step 7 — Historical Intelligence
  const historicalIntelligence = analyzeHistoricalIntelligence(setup, historicalFeatures);

  // Step 8 — SQS Calculation
  const sqs = calculateSqs(
    ruleIntegrity,
    structuralQuality,
    liquidityIntelligence,
    amdIntelligence,
    confirmationIntelligence,
    marketIntelligence,
    historicalIntelligence,
  );

  // Step 9 — Classification
  const classification = classifyQuality(sqs.strategyQualityScore, sqs.components);

  // Step 10 — Assemble partial report (without narrative)
  const partial = {
    reportId:    randomUUID(),
    version:     SQI_ENGINE_VERSION,
    setup,
    evaluatedAt: now,
    ruleIntegrity,
    structuralQuality,
    liquidityIntelligence,
    amdIntelligence,
    confirmationIntelligence,
    marketIntelligence,
    historicalIntelligence,
    components:            sqs.components,
    strategyQualityScore:  clamp(sqs.strategyQualityScore, 0, 100),
    classification,
    strongestComponents:   sqs.strongestComponents,
    weakestComponents:     sqs.weakestComponents,
  };

  // Step 11 — Narrative
  const qualityNarrative = buildQualityNarrative(partial);

  return {
    ...partial,
    qualityNarrative,
    // Hard-coded advisory enforcement — must never be false
    isAdvisoryOnly: true as const,
  };
}
