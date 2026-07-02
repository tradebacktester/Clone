// ─── Conflict Resolver ────────────────────────────────────────────────────────
// Detects and resolves disagreements between subsystems.

import type { EaiConflict, EaiConflictSeverity, EaiConflictType } from "./types.js";
import type { StrategyIntelligence, MarketIntelligence, RiskIntelligence, LearningIntelligence } from "./types.js";

let conflictCounter = 0;
function nextId(): string { return `conflict_${Date.now()}_${++conflictCounter}`; }

function divergenceSeverity(d: number): EaiConflictSeverity {
  if (d >= 55) return "critical";
  if (d >= 40) return "high";
  if (d >= 25) return "moderate";
  return "low";
}

// ─── Conflict: Risk vs Strategy ───────────────────────────────────────────────

export function detectRiskVsStrategyConflict(
  strategyScore: number,
  riskSafetyScore: number,  // 100 - overallRiskScore
  risk: RiskIntelligence
): EaiConflict | null {
  const divergence = Math.abs(strategyScore - riskSafetyScore);
  if (strategyScore < 60 || riskSafetyScore > 50) return null;
  if (divergence < 25) return null;

  // High strategy, low safety (high risk) → conflict
  const severity = divergenceSeverity(divergence);
  return {
    conflictId:         nextId(),
    type:               "risk_vs_strategy" as EaiConflictType,
    severity,
    systemA:            "Strategy Intelligence",
    systemB:            "Risk Intelligence",
    scoreA:             strategyScore,
    scoreB:             riskSafetyScore,
    divergence,
    winnerSystem:       "Risk Intelligence",
    resolution:         "Risk Intelligence wins — capital preservation always supersedes signal quality",
    winningEvidence:    [
      `ERB overall risk score: ${(100 - riskSafetyScore).toFixed(1)}`,
      `ERB recommendation: ${risk.recommendation}`,
      risk.survivalModeActive ? "Survival mode is active" : `Capital health: ${risk.capitalHealthScore.toFixed(0)}`,
    ],
    rejectedEvidence:   [
      `Strategy executive score: ${strategyScore.toFixed(1)}`,
      `Strategy recommendation was to trade but risk conditions are elevated`,
    ],
    finalJustification: `Risk score divergence of ${divergence.toFixed(0)} points triggers risk veto. ` +
      `ERB recommends ${risk.recommendation} — overriding strategy signal.`,
  };
}

// ─── Conflict: Market vs Strategy ─────────────────────────────────────────────

export function detectMarketVsStrategyConflict(
  strategyScore: number,
  marketHealthScore: number,
  market: MarketIntelligence
): EaiConflict | null {
  const divergence = Math.abs(strategyScore - marketHealthScore);
  if (strategyScore < 70 || marketHealthScore > 45) return null;
  if (divergence < 30) return null;

  const severity = divergenceSeverity(divergence);
  return {
    conflictId:         nextId(),
    type:               "market_vs_strategy" as EaiConflictType,
    severity,
    systemA:            "Strategy Intelligence",
    systemB:            "Market Intelligence",
    scoreA:             strategyScore,
    scoreB:             marketHealthScore,
    divergence,
    winnerSystem:       "Market Intelligence",
    resolution:         "Poor market conditions override individual strategy quality",
    winningEvidence:    [
      `Market health score: ${marketHealthScore.toFixed(1)}`,
      `Market regime: ${market.regime}`,
      `Market stability: ${market.marketStability.toFixed(0)}`,
      `Opportunity score: ${market.opportunityScore.toFixed(0)}`,
    ],
    rejectedEvidence:   [
      `Strategy score ${strategyScore.toFixed(0)} indicates quality setup`,
      `But market environment is unfavorable (health: ${marketHealthScore.toFixed(0)})`,
    ],
    finalJustification: `Market health (${marketHealthScore.toFixed(0)}) is ${divergence.toFixed(0)} points below ` +
      `strategy score (${strategyScore.toFixed(0)}). Adverse market conditions reduce expected outcome.`,
  };
}

// ─── Conflict: Memory vs Learning ─────────────────────────────────────────────

export function detectMemoryVsLearningConflict(
  historyWinRate: number,
  learningConfidence: number,
  learningDrift: number
): EaiConflict | null {
  if (Math.abs(historyWinRate - learningConfidence) < 30) return null;
  if (learningDrift > -20) return null;

  const divergence = Math.abs(historyWinRate - learningConfidence);
  return {
    conflictId:      nextId(),
    type:            "memory_vs_learning" as EaiConflictType,
    severity:        "moderate",
    systemA:         "Memory Intelligence",
    systemB:         "Learning Intelligence",
    scoreA:          historyWinRate,
    scoreB:          learningConfidence,
    divergence,
    winnerSystem:    "Learning Intelligence",
    resolution:      "Recency of learning data takes priority over historical average when drift is significant",
    winningEvidence: [
      `Learning confidence: ${learningConfidence.toFixed(0)}`,
      `Performance drift: ${learningDrift.toFixed(1)} (negative indicates degradation)`,
    ],
    rejectedEvidence: [
      `Historical win rate: ${historyWinRate.toFixed(0)} — may not reflect current conditions`,
    ],
    finalJustification: `Negative performance drift (${learningDrift.toFixed(1)}) with divergence ` +
      `of ${divergence.toFixed(0)} points suggests historical patterns are losing reliability.`,
  };
}

// ─── Multi-system conflict ────────────────────────────────────────────────────

export function detectMultiSystemConflict(
  systems: { name: string; score: number }[]
): EaiConflict | null {
  if (systems.length < 3) return null;
  const scores = systems.map(s => s.score);
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  const maxDev = Math.max(...scores.map(s => Math.abs(s - avg)));
  if (maxDev < 35) return null;

  const highest = systems.reduce((a, b) => a.score > b.score ? a : b);
  const lowest  = systems.reduce((a, b) => a.score < b.score ? a : b);
  const divergence = highest.score - lowest.score;

  return {
    conflictId:      nextId(),
    type:            "multi_system" as EaiConflictType,
    severity:        divergenceSeverity(divergence),
    systemA:         highest.name,
    systemB:         lowest.name,
    scoreA:          highest.score,
    scoreB:          lowest.score,
    divergence,
    winnerSystem:    "Weighted Composite",
    resolution:      "Weighted average applied across all systems; no single system dominates",
    winningEvidence: systems.filter(s => s.score >= avg).map(s => `${s.name}: ${s.score.toFixed(0)}`),
    rejectedEvidence: systems.filter(s => s.score < avg).map(s => `${s.name}: ${s.score.toFixed(0)}`),
    finalJustification: `${systems.length} systems diverge by up to ${divergence.toFixed(0)} points. ` +
      `Composite weighting applied. Caution level elevated.`,
  };
}

// ─── Run all conflict detectors ───────────────────────────────────────────────

export function resolveAllConflicts(params: {
  strategyScore: number;
  marketScore: number;
  riskSafetyScore: number;
  memoryScore: number;
  learningScore: number;
  identityScore: number;
  risk: RiskIntelligence;
  market: MarketIntelligence;
  learningDrift: number;
  memoryWinRate: number;
  learningConfidence: number;
}): EaiConflict[] {
  const conflicts: EaiConflict[] = [];

  const c1 = detectRiskVsStrategyConflict(params.strategyScore, params.riskSafetyScore, params.risk);
  if (c1) conflicts.push(c1);

  const c2 = detectMarketVsStrategyConflict(params.strategyScore, params.marketScore, params.market);
  if (c2) conflicts.push(c2);

  const c3 = detectMemoryVsLearningConflict(params.memoryWinRate, params.learningConfidence, params.learningDrift);
  if (c3) conflicts.push(c3);

  const c4 = detectMultiSystemConflict([
    { name: "Strategy",  score: params.strategyScore },
    { name: "Market",    score: params.marketScore },
    { name: "Risk",      score: params.riskSafetyScore },
    { name: "Memory",    score: params.memoryScore },
    { name: "Learning",  score: params.learningScore },
    { name: "Identity",  score: params.identityScore },
  ]);
  if (c4) conflicts.push(c4);

  return conflicts;
}
