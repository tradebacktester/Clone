// ─── Judgment Engine ──────────────────────────────────────────────────────────
// Produces the final judgment: top 3, explanations, evidence.

import type {
  DecisionRanking,
  DecisionSimulation,
  JudgmentExplainability,
  OpportunityCostAnalysis,
} from "./types.js";

function clamp(v: number, lo = 0, hi = 100): number {
  return Math.min(hi, Math.max(lo, v));
}

function wilsonLower(wins: number, n: number, z = 1.96): number {
  if (n === 0) return 0;
  const p = wins / n;
  const d = 1 + (z * z) / n;
  return clamp(((p + (z * z) / (2 * n) - z * Math.sqrt((p * (1 - p) + (z * z) / (4 * n)) / n)) / d) * 100, 0, 100);
}

function wilsonUpper(wins: number, n: number, z = 1.96): number {
  if (n === 0) return 100;
  const p = wins / n;
  const d = 1 + (z * z) / n;
  return clamp(((p + (z * z) / (2 * n) + z * Math.sqrt((p * (1 - p) + (z * z) / (4 * n)) / n)) / d) * 100, 0, 100);
}

export function buildJudgmentExplainability(params: {
  bestRanking:    DecisionRanking;
  allRankings:    DecisionRanking[];
  simulations:    DecisionSimulation[];
  opportunityCost: OpportunityCostAnalysis;
  executiveScore: number;
  riskScore:      number;
}): JudgmentExplainability {
  const { bestRanking, allRankings, simulations, opportunityCost, executiveScore, riskScore } = params;
  const bestSim = simulations.find(s => s.decisionType === bestRanking.decisionType)!;

  // Why best ranked highest
  const whyBest = `'${bestRanking.decisionLabel}' ranked #1 with composite score ${bestRanking.overallScore.toFixed(0)}/100. ` +
    `Key drivers: EV=${bestSim.expectedValue.toFixed(2)}R, ` +
    `confidence=${bestRanking.confidence.toFixed(0)}%, ` +
    `historical win rate=${bestSim.historicalWinRate.toFixed(0)}%, ` +
    `risk score=${bestRanking.riskScore.toFixed(0)}/100. ` +
    `Opportunity cost analysis recommends "${opportunityCost.recommendation}" ` +
    `(OC score=${opportunityCost.opportunityCostScore.toFixed(0)}).`;

  // Why alternatives were rejected
  const whyRejected = allRankings
    .filter(r => r.rank > 1 && r.rank <= 7)
    .map(r => `#${r.rank} ${r.decisionLabel}: ${r.rankingReason}`);

  // Most influential evidence
  const mostInfluential: string[] = [
    `Executive score ${executiveScore.toFixed(0)}/100 ${executiveScore >= 70 ? "supports" : "does not strongly support"} trade execution`,
    `Risk score ${riskScore.toFixed(0)}/100 ${riskScore >= 65 ? "elevates caution — favours conservative approach" : "within acceptable bounds for execution"}`,
    `Historical win rate ${bestSim.historicalWinRate.toFixed(0)}% across ${bestSim.sampleSize} similar setups`,
    `Opportunity cost score ${opportunityCost.opportunityCostScore.toFixed(0)} — ${opportunityCost.reasoning.slice(0, 80)}…`,
    `Deliberation selected '${bestRanking.decisionLabel}' with score utility gap of ${(allRankings[0].overallScore - (allRankings[1]?.overallScore ?? 0)).toFixed(1)} vs runner-up`,
  ];

  // Historical references
  const histRefs = [
    ...bestSim.similarCases.slice(0, 3),
  ];

  // Confidence interval via Wilson CI
  const wins    = Math.round(bestSim.historicalWinRate / 100 * bestSim.sampleSize);
  const lower   = wilsonLower(wins, bestSim.sampleSize);
  const upper   = wilsonUpper(wins, bestSim.sampleSize);

  // Statistical reliability note
  const reliabilityNote = bestSim.sampleSize < 10
    ? `Low sample size (n=${bestSim.sampleSize}) — statistical reliability is limited. Wider confidence interval expected.`
    : bestSim.sampleSize < 25
    ? `Moderate sample size (n=${bestSim.sampleSize}) — results are directionally reliable but should be treated as indicative.`
    : `Sufficient sample size (n=${bestSim.sampleSize}) — statistical reliability is adequate for institutional decision-making.`;

  // Key risks
  const keyRisks: string[] = [];
  if (riskScore >= 65)                    keyRisks.push(`Elevated risk score (${riskScore.toFixed(0)}) increases capital exposure`);
  if (bestSim.expectedProbability < 55)   keyRisks.push(`Below-average probability of success (${bestSim.expectedProbability.toFixed(0)}%)`);
  if (bestSim.sampleSize < 8)             keyRisks.push("Small historical sample — conclusions should be treated as preliminary");
  if (bestSim.historicalDrawdown > 20)    keyRisks.push(`Historical drawdown ${bestSim.historicalDrawdown.toFixed(0)}% — position sizing review recommended`);
  if (keyRisks.length === 0)              keyRisks.push("No material risk factors identified — normal operating conditions");

  return {
    whyBestRankedHighest:       whyBest,
    whyAlternativesRejected:    whyRejected,
    mostInfluentialEvidence:    mostInfluential,
    historicalReferences:       histRefs,
    confidenceInterval:         { lower: Math.round(lower * 10) / 10, upper: Math.round(upper * 10) / 10 },
    statisticalReliabilityNote: reliabilityNote,
    keyRisks,
  };
}
