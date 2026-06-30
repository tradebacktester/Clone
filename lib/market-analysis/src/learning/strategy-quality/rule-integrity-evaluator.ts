// ─── Rule Integrity Evaluator ─────────────────────────────────────────────────
// Evaluates rule completeness, strictness, alignment, and confidence.
// Advisory only.

import { clamp } from "./types.js";
import type { QualitySetup, RuleIntegrityResult } from "./types.js";

// Core rule definitions for integrity evaluation
interface IntegrityRule {
  name:        string;
  key:         keyof QualitySetup;
  threshold:   number;   // minimum acceptable value
  excellent:   number;   // excellent threshold
  weight:      number;
  inverted:    boolean;
}

const INTEGRITY_RULES: IntegrityRule[] = [
  { name: "Zone Quality (Supply)",    key: "supplyQuality",       threshold: 60,  excellent: 80,  weight: 0.12, inverted: false },
  { name: "Zone Quality (Demand)",    key: "demandQuality",       threshold: 60,  excellent: 80,  weight: 0.12, inverted: false },
  { name: "Liquidity Score",          key: "liquidityScore",      threshold: 55,  excellent: 75,  weight: 0.12, inverted: false },
  { name: "AMD Quality",              key: "amdScore",            threshold: 55,  excellent: 75,  weight: 0.12, inverted: false },
  { name: "Confirmation Quality",     key: "confirmationQuality", threshold: 60,  excellent: 80,  weight: 0.12, inverted: false },
  { name: "Setup Score",              key: "setupScore",          threshold: 60,  excellent: 80,  weight: 0.12, inverted: false },
  { name: "TQI",                      key: "tqi",                 threshold: 55,  excellent: 75,  weight: 0.12, inverted: false },
  { name: "Risk/Reward Ratio",        key: "rrPlanned",           threshold: 1.5, excellent: 3.0, weight: 0.10, inverted: false },
  { name: "Spread (pips)",            key: "spreadPips",          threshold: 3.0, excellent: 1.0, weight: 0.06, inverted: true },
];

type RuleGrade = "failed" | "barely_passed" | "passed" | "excellent";

function gradeRule(value: number, rule: IntegrityRule): { grade: RuleGrade; score: number } {
  const { threshold, excellent, inverted } = rule;
  if (inverted) {
    if (value <= excellent)   return { grade: "excellent",     score: 100 };
    if (value <= threshold)   return { grade: "passed",        score: clamp(((threshold - value) / (threshold - excellent)) * 40 + 60, 60, 100) };
    if (value <= threshold * 1.5) return { grade: "barely_passed", score: 40 };
    return { grade: "failed", score: clamp(((threshold * 2 - value) / threshold) * 30, 0, 30) };
  }
  if (value >= excellent)   return { grade: "excellent",     score: 100 };
  if (value >= threshold)   return { grade: "passed",        score: clamp(((value - threshold) / (excellent - threshold)) * 40 + 60, 60, 100) };
  if (value >= threshold * 0.7) return { grade: "barely_passed", score: clamp((value / threshold) * 40, 20, 50) };
  return { grade: "failed", score: clamp((value / threshold) * 20, 0, 20) };
}

// ─── Completeness score ───────────────────────────────────────────────────────
// How many of the optional enrichment fields are populated?

const OPTIONAL_KEYS: Array<keyof QualitySetup> = [
  "htfAlignment", "srStrength", "premiumDiscountBias", "zoneFreshness",
  "zoneRespect", "marketStructureCleanliness",
  "liquiditySweepSize", "liquiditySweepClarity", "stopHuntQuality",
  "manipulationClarity", "distributionStrength",
  "accumulationQuality", "manipulationQuality", "distributionQuality",
  "amdCompleteness", "amdConfidence",
  "candleStrength", "momentum", "candleBodyRatio", "breakStrength",
  "displacement", "followThroughProb",
  "marketHealthScore", "opportunityScore", "trendStrength",
];

function computeCompleteness(setup: QualitySetup): number {
  const filled = OPTIONAL_KEYS.filter(k => setup[k] !== undefined && setup[k] !== null).length;
  return clamp((filled / OPTIONAL_KEYS.length) * 100, 0, 100);
}

// ─── Main evaluator ───────────────────────────────────────────────────────────

export function evaluateRuleIntegrity(setup: QualitySetup): RuleIntegrityResult {
  const explanations: string[] = [];
  const graded = INTEGRITY_RULES.map(rule => {
    const raw = setup[rule.key];
    const value = typeof raw === "number" ? raw : Number(raw ?? 0);
    const { grade, score } = gradeRule(value, rule);
    return { rule, grade, score, value };
  });

  const passing    = graded.filter(g => g.grade !== "failed");
  const excellent  = graded.filter(g => g.grade === "excellent");
  const barely     = graded.filter(g => g.grade === "barely_passed");
  const failed     = graded.filter(g => g.grade === "failed");
  const totalRules = INTEGRITY_RULES.length;
  const passingN   = passing.length;

  // ── Completeness score ────────────────────────────────────────────────
  const completenessScore = computeCompleteness(setup);

  // ── Strictness score (how many rules pass at high quality) ────────────
  const strictnessScore = clamp(
    (excellent.length / totalRules) * 60 +
    (passing.length / totalRules) * 40,
    0, 100,
  );

  // ── Alignment score (rules agree with market context) ─────────────────
  // Trending + good supply/demand = aligned; check key coherence
  let alignmentBonus = 50; // base
  const regime = setup.regime.toLowerCase();
  const trend  = setup.trend.toLowerCase();
  if ((regime === "trending") && (setup.setupScore >= 60)) alignmentBonus += 20;
  if (setup.tqi >= 65 && setup.confirmationQuality >= 65)  alignmentBonus += 15;
  if (setup.rrPlanned >= 2.0)                               alignmentBonus += 10;
  if (trend !== "unknown" && setup.amdScore >= 60)          alignmentBonus += 5;
  const alignmentScore = clamp(alignmentBonus, 0, 100);

  // ── Confidence score (how confident are we in this rule eval) ─────────
  // More excellent rules → higher confidence; failed rules → lower
  const confidenceScore = clamp(
    100 - (failed.length / totalRules) * 60 +
    (excellent.length / totalRules) * 20 -
    (barely.length / totalRules) * 10,
    0, 100,
  );

  // ── Composite rule integrity score ────────────────────────────────────
  // Weighted average of graded rule scores + completeness bonus
  const weightedRuleScore = graded.reduce((sum, g) =>
    sum + g.score * g.rule.weight, 0,
  );
  const ruleIntegrityScore = clamp(
    weightedRuleScore * 0.55 +
    completenessScore * 0.15 +
    strictnessScore   * 0.20 +
    alignmentScore    * 0.10,
    0, 100,
  );

  explanations.push(`Rule Integrity Score: ${ruleIntegrityScore.toFixed(1)}/100`);
  explanations.push(`${passingN}/${totalRules} rules passing — ${excellent.length} exceptional, ${barely.length} barely passed, ${failed.length} failed`);
  explanations.push(`Completeness: ${completenessScore.toFixed(0)}% optional fields populated`);
  if (failed.length > 0) {
    explanations.push(`Failed rules: ${failed.map(g => g.rule.name).join(", ")}`);
  }
  if (excellent.length >= 5) {
    explanations.push("Outstanding rule excellence — majority of rules at exceptional quality.");
  }

  return {
    completenessScore,
    strictnessScore,
    alignmentScore,
    confidenceScore,
    ruleIntegrityScore,
    passingRules: passingN,
    totalRules,
    explanations,
  };
}
