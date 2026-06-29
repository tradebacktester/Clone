// ─── Report Generator ─────────────────────────────────────────────────────────
// Generates the full reasoning narrative and supporting/weakest factor lists.
// Advisory only — no trade execution, no strategy modification.

import type {
  StrategySetup,
  RuleEvaluationResult,
  HistoricalEvidenceResult,
  MarketSupportResult,
  PatternStrengthResult,
  ContextStrengthResult,
  StrategyStrengthResult,
  SupportingFactor,
} from "./types.js";
import { REASONING_RECOMMENDATION_LABELS } from "./types.js";

// ─── Factor extraction ────────────────────────────────────────────────────────

export function extractSupportingFactors(
  ruleResult:     RuleEvaluationResult,
  evidence:       HistoricalEvidenceResult,
  marketSupport:  MarketSupportResult,
  patternStrength: PatternStrengthResult,
  contextStrength: ContextStrengthResult,
  strength:       StrategyStrengthResult,
): { strongest: SupportingFactor[]; weakest: SupportingFactor[] } {
  const factors: SupportingFactor[] = [
    {
      name:   "Rule Quality",
      impact: ruleResult.ruleQualityScore - 60,
      detail: ruleResult.explanation.split(" | ")[0] ?? "",
    },
    {
      name:   "Historical Win Rate",
      impact: evidence.evidenceCount >= 5 ? (evidence.winRate - 0.5) * 100 : -20,
      detail: `${(evidence.winRate * 100).toFixed(1)}% win rate across ${evidence.evidenceCount} similar trades`,
    },
    {
      name:   "Market Regime",
      impact: marketSupport.regimeScore - 60,
      detail: `Regime score: ${marketSupport.regimeScore.toFixed(0)}`,
    },
    {
      name:   "Market Trend",
      impact: marketSupport.trendScore - 60,
      detail: `Trend score: ${marketSupport.trendScore.toFixed(0)}`,
    },
    {
      name:   "Zone Quality",
      impact: patternStrength.zoneScore - 60,
      detail: `Zone composite: ${patternStrength.zoneScore.toFixed(1)}`,
    },
    {
      name:   "AMD Structure",
      impact: patternStrength.amdScore - 55,
      detail: `AMD quality: ${patternStrength.amdScore.toFixed(1)}`,
    },
    {
      name:   "Liquidity Sweep",
      impact: patternStrength.liquiditySweepScore - 55,
      detail: `Sweep quality: ${patternStrength.liquiditySweepScore.toFixed(1)}`,
    },
    {
      name:   "Confirmation Quality",
      impact: patternStrength.confirmationScore - 60,
      detail: `Confirmation: ${patternStrength.confirmationScore.toFixed(1)}`,
    },
    {
      name:   "Session Timing",
      impact: contextStrength.sessionScore - 60,
      detail: `Session score: ${contextStrength.sessionScore.toFixed(0)}`,
    },
    {
      name:   "Historical Context",
      impact: contextStrength.historicalContextScore - 50,
      detail: `Session/regime win rate: ${contextStrength.historicalContextScore.toFixed(1)}`,
    },
    {
      name:   "Market Stability",
      impact: marketSupport.stabilityScore - 60,
      detail: `Stability: ${marketSupport.stabilityScore.toFixed(1)}`,
    },
    {
      name:   "Sample Reliability",
      impact: evidence.evidenceCount >= 20 ? 15 : evidence.evidenceCount >= 10 ? 5 : evidence.evidenceCount >= 5 ? -10 : -30,
      detail: `${evidence.evidenceCount} similar trades (${evidence.sampleReliability} reliability)`,
    },
  ];

  const sorted = [...factors].sort((a, b) => b.impact - a.impact);
  return {
    strongest: sorted.filter(f => f.impact > 0).slice(0, 5),
    weakest:   sorted.filter(f => f.impact <= 0).slice(-5).reverse(),
  };
}

// ─── Statistical expectancy ───────────────────────────────────────────────────

export function computeStatisticalExpectancy(
  winRate: number,
  averageRR: number,
  evidenceCount: number,
): number {
  // E = winRate * avgRR - (1 - winRate) * 1
  if (evidenceCount < 5) return 0;
  return winRate * averageRR - (1 - winRate) * 1;
}

// ─── Risk assessment ──────────────────────────────────────────────────────────

export function assessRisks(
  setup: StrategySetup,
  ruleResult: RuleEvaluationResult,
  evidence: HistoricalEvidenceResult,
  marketSupport: MarketSupportResult,
): { riskAssessment: string; potentialRisks: string[] } {
  const risks: string[] = [];

  if (ruleResult.failedRules > 0) {
    risks.push(`${ruleResult.failedRules} strategy rule(s) not satisfied`);
  }
  if (ruleResult.barelyPassed >= 3) {
    risks.push(`${ruleResult.barelyPassed} rules barely passed — marginal quality`);
  }
  if (evidence.evidenceCount < 5) {
    risks.push("Insufficient historical evidence — conclusions unreliable");
  } else if (evidence.winRate < 0.40) {
    risks.push(`Below-average historical win rate (${(evidence.winRate * 100).toFixed(1)}%)`);
  }
  if (setup.spreadPips > 2.5) {
    risks.push(`High spread (${setup.spreadPips.toFixed(2)} pips) — reduces expected value`);
  }
  if (marketSupport.volatilityScore < 45) {
    risks.push("Extreme or very low volatility — atypical market conditions");
  }
  if (marketSupport.newsScore < 40) {
    risks.push("Adverse news context — heightened event risk");
  }
  if (setup.rrPlanned < 2.0) {
    risks.push(`Low planned RR (${setup.rrPlanned.toFixed(1)}) — limited reward potential`);
  }
  if (marketSupport.regimeScore < 45) {
    risks.push("Unfavourable market regime for this setup type");
  }

  let riskAssessment: string;
  if (risks.length === 0)      riskAssessment = "Low — no significant risk factors identified";
  else if (risks.length <= 2)  riskAssessment = "Moderate — minor risk factors present";
  else if (risks.length <= 4)  riskAssessment = "Elevated — multiple risk factors require attention";
  else                         riskAssessment = "High — significant risk factors compromise setup quality";

  return { riskAssessment, potentialRisks: risks };
}

// ─── Full reasoning narrative ─────────────────────────────────────────────────

export function buildReasoningNarrative(
  setup: StrategySetup,
  ruleResult: RuleEvaluationResult,
  evidence: HistoricalEvidenceResult,
  marketSupport: MarketSupportResult,
  patternStrength: PatternStrengthResult,
  contextStrength: ContextStrengthResult,
  strength: StrategyStrengthResult,
  expectancy: number,
): string {
  const label = REASONING_RECOMMENDATION_LABELS[strength.recommendation];
  const lines: string[] = [];

  lines.push(`KRYTOS Strategy Reasoning Engine v1.0 — ${label}`);
  lines.push(`Setup: ${setup.pair} | ${setup.session} session | ${setup.regime} regime | ${setup.volatility} volatility`);
  lines.push(`Strategy Strength: ${strength.strategyStrengthScore.toFixed(1)}/100 | Confidence: ${strength.confidenceScore.toFixed(1)}/100`);
  lines.push("");

  lines.push("── Rule Evaluation ──");
  lines.push(ruleResult.explanation);
  lines.push("");

  lines.push("── Historical Evidence ──");
  lines.push(evidence.explanation);
  if (expectancy !== 0) {
    const expSign = expectancy >= 0 ? "+" : "";
    lines.push(`Statistical expectancy: ${expSign}${expectancy.toFixed(2)}R per trade`);
  }
  lines.push("");

  lines.push("── Market Context ──");
  lines.push(marketSupport.explanations.join(" | "));
  lines.push("");

  lines.push("── Pattern Strength ──");
  lines.push(patternStrength.explanations.join(" | "));
  lines.push("");

  lines.push("── Context Strength ──");
  lines.push(contextStrength.explanations.join(" | "));
  lines.push("");

  lines.push("── Strategy Strength Components ──");
  for (const c of strength.components) {
    lines.push(`  ${c.name}: ${c.score.toFixed(1)}/100 (weight ${(c.weight * 100).toFixed(0)}%, contribution ${c.contribution.toFixed(1)})`);
  }
  lines.push("");

  lines.push("Advisory only. KRYTOS does not modify strategy or execute trades autonomously.");

  return lines.join("\n");
}
