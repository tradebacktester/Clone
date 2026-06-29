// ─── Rule Evaluator ───────────────────────────────────────────────────────────
// Evaluates whether each strategy rule passed, barely passed, or exceeded
// the threshold. Produces a Rule Quality Score (0–100) and per-rule detail.
// Advisory only.

import { clamp } from "../learning-validation/data-validator.js";
import type {
  StrategySetup,
  RuleResult,
  RuleEvaluationResult,
  RuleStatus,
} from "./types.js";
import { STRATEGY_RULES } from "./types.js";

// ─── Single rule evaluation ────────────────────────────────────────────────────

function evaluateRule(
  rule: (typeof STRATEGY_RULES)[number],
  value: number,
): RuleResult {
  const { name, threshold, exceptional, inverted, weight } = rule;

  let status: RuleStatus;
  let score: number;
  let explanation: string;

  if (!inverted) {
    // Higher is better
    if (value >= exceptional) {
      status = "exceptional";
      score  = clamp(80 + ((value - exceptional) / (100 - exceptional)) * 20, 80, 100);
      explanation = `${name}: ${value.toFixed(1)} — exceeds exceptional threshold (${exceptional}). Exceptional quality.`;
    } else if (value >= threshold) {
      // Scale from 60–79 between threshold and exceptional
      const ratio = (value - threshold) / Math.max(exceptional - threshold, 1);
      score  = clamp(60 + ratio * 20, 60, 79);
      if (value < threshold + (exceptional - threshold) * 0.15) {
        status = "barely_passed";
        explanation = `${name}: ${value.toFixed(1)} — barely above threshold (${threshold}). Marginal quality.`;
      } else {
        status = "passed";
        explanation = `${name}: ${value.toFixed(1)} — satisfies threshold (${threshold}). Adequate quality.`;
      }
    } else {
      status = "failed";
      score  = clamp((value / threshold) * 55, 0, 55);
      explanation = `${name}: ${value.toFixed(1)} — below threshold (${threshold}). Rule not satisfied.`;
    }
  } else {
    // Lower is better (e.g. spread)
    if (value <= exceptional) {
      status = "exceptional";
      score  = 100;
      explanation = `${name}: ${value.toFixed(2)} — below exceptional threshold (${exceptional}). Excellent conditions.`;
    } else if (value <= threshold) {
      const ratio = (threshold - value) / Math.max(threshold - exceptional, 1);
      score  = clamp(60 + ratio * 20, 60, 79);
      if (value > threshold - (threshold - exceptional) * 0.15) {
        status = "barely_passed";
        explanation = `${name}: ${value.toFixed(2)} — barely under threshold (${threshold}). Marginal spread.`;
      } else {
        status = "passed";
        explanation = `${name}: ${value.toFixed(2)} — satisfies threshold (${threshold}).`;
      }
    } else {
      status = "failed";
      score  = clamp((threshold / Math.max(value, 0.01)) * 55, 0, 55);
      explanation = `${name}: ${value.toFixed(2)} — exceeds threshold (${threshold}). Rule not satisfied.`;
    }
  }

  return { name, value, threshold, exceptional, status, score, explanation, weight } as RuleResult & { weight: number };
}

// ─── Rule set evaluation ──────────────────────────────────────────────────────

export function evaluateRules(setup: StrategySetup): RuleEvaluationResult {
  const results: RuleResult[] = [];
  let totalWeight = 0;
  let weightedScore = 0;

  for (const rule of STRATEGY_RULES) {
    const rawValue = setup[rule.key];
    const value = typeof rawValue === "number" ? rawValue : 0;
    const result = evaluateRule(rule, value) as RuleResult & { weight: number };
    results.push(result);
    weightedScore += result.score * rule.weight;
    totalWeight   += rule.weight;
  }

  const ruleQualityScore = clamp(weightedScore / Math.max(totalWeight, 1), 0, 100);

  const failed     = results.filter(r => r.status === "failed").length;
  const barely     = results.filter(r => r.status === "barely_passed").length;
  const passed     = results.filter(r => r.status === "passed").length;
  const exceptional = results.filter(r => r.status === "exceptional").length;
  const passing    = passed + exceptional + barely;

  const lines: string[] = [];
  lines.push(`Rule Quality Score: ${ruleQualityScore.toFixed(1)}/100`);
  lines.push(`Rules: ${passing}/${results.length} passed (${exceptional} exceptional, ${barely} barely, ${failed} failed)`);
  if (failed > 0) {
    const names = results.filter(r => r.status === "failed").map(r => r.name).join(", ");
    lines.push(`Failed rules: ${names}`);
  }
  if (exceptional > 0) {
    const names = results.filter(r => r.status === "exceptional").map(r => r.name).join(", ");
    lines.push(`Exceptional rules: ${names}`);
  }

  return {
    rules:             results,
    ruleQualityScore,
    passingRules:      passing,
    totalRules:        results.length,
    failedRules:       failed,
    barelyPassed:      barely,
    exceptionalRules:  exceptional,
    explanation:       lines.join(" | "),
  };
}
