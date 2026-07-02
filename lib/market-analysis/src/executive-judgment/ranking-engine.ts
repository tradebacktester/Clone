// ─── Decision Ranking Engine ──────────────────────────────────────────────────
// Ranks all 7 candidate decisions by a weighted composite score.

import type { DecisionSimulation, DecisionRanking } from "./types.js";

function clamp(v: number, lo = 0, hi = 100): number {
  return Math.min(hi, Math.max(lo, v));
}

// Normalise EV (typically -1 to 4) to 0-100 scale
function normaliseEV(ev: number): number {
  return clamp((ev + 1) / 5 * 100);
}

// Statistical reliability estimate from sample size
function sampleToReliability(n: number): number {
  // Reaches ~80 at n=20, ~90 at n=40
  return clamp(30 + (1 - Math.exp(-n / 15)) * 65);
}

function buildRankingReason(
  sim: DecisionSimulation,
  score: number,
  rank: number
): string {
  const d = sim.decisionType;
  const ev = sim.expectedValue.toFixed(2);
  const wr = sim.historicalWinRate.toFixed(0);
  const risk = sim.expectedRisk.toFixed(0);
  const conf = sim.confidence.toFixed(0);

  if (rank === 1) {
    return `Ranked #1 with composite score ${score.toFixed(0)}/100. ` +
      `EV ${ev}R, win rate ${wr}%, risk ${risk}/100, confidence ${conf}%. ` +
      `Best balance of expected return and downside protection across all candidates.`;
  }

  const reasons: string[] = [];
  if (sim.expectedValue < 0)      reasons.push(`negative expected value (${ev}R)`);
  if (sim.expectedRisk > 70)      reasons.push(`high risk exposure (${risk}/100)`);
  if (sim.historicalWinRate < 50) reasons.push(`below-50% historical win rate (${wr}%)`);
  if (sim.confidence < 50)        reasons.push(`low confidence (${conf}%)`);
  if (sim.sampleSize < 5)         reasons.push("insufficient historical sample");

  const label = sim.decisionLabel;
  return reasons.length > 0
    ? `${label} ranked #${rank} due to: ${reasons.join("; ")}. Score: ${score.toFixed(0)}/100.`
    : `${label} ranked #${rank} — score ${score.toFixed(0)}/100 (lower utility vs higher-ranked options).`;
}

export function rankDecisions(simulations: DecisionSimulation[]): DecisionRanking[] {
  // Compute composite score for each candidate
  const scored = simulations.map(sim => {
    const evNorm        = normaliseEV(sim.expectedValue);
    const confNorm      = sim.confidence;
    const histEvidence  = clamp(sim.historicalWinRate * 0.6 + sim.sampleSize * 1.5);
    const riskInv       = clamp(100 - sim.expectedRisk);  // lower risk = better
    const reliability   = sampleToReliability(sim.sampleSize);

    // Weighted composite: EV 30%, confidence 20%, historical evidence 20%, risk 15%, reliability 15%
    const overallScore = clamp(
      evNorm        * 0.30 +
      confNorm      * 0.20 +
      histEvidence  * 0.20 +
      riskInv       * 0.15 +
      reliability   * 0.15
    );

    return {
      sim,
      overallScore,
      evNorm,
      histEvidence,
      riskInv,
      reliability,
    };
  });

  // Sort by overallScore descending
  scored.sort((a, b) => b.overallScore - a.overallScore);

  return scored.map((s, i) => {
    const rank = i + 1;
    const reason = buildRankingReason(s.sim, s.overallScore, rank);
    return {
      decisionType:           s.sim.decisionType,
      decisionLabel:          s.sim.decisionLabel,
      rank,
      overallScore:           Math.round(s.overallScore * 10) / 10,
      expectedValue:          s.sim.expectedValue,
      confidence:             Math.round(s.sim.confidence * 10) / 10,
      riskScore:              Math.round(s.sim.expectedRisk * 10) / 10,
      historicalEvidence:     Math.round(s.histEvidence * 10) / 10,
      statisticalReliability: Math.round(s.reliability * 10) / 10,
      rankingReason:          reason,
    };
  });
}
