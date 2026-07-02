// ─── Opportunity Cost Analysis ───────────────────────────────────────────────
import { randomUUID } from "crypto";
import type { OpportunityCostAnalysis, DecisionSimulation } from "./types.js";

function clamp(v: number, lo = 0, hi = 100): number {
  return Math.min(hi, Math.max(lo, v));
}

export function analyzeOpportunityCost(
  simulations: DecisionSimulation[],
  executiveScore: number
): OpportunityCostAnalysis {
  const tradeSim = simulations.find(s => s.decisionType === "execute_trade")!;
  const skipSim  = simulations.find(s => s.decisionType === "skip_trade")!;
  const waitSim  = simulations.find(s => s.decisionType === "wait_one_candle")!;

  // ── If Trade ──────────────────────────────────────────────────────────────
  const tradeBenefit  = clamp(tradeSim.expectedRR * tradeSim.expectedProbability);
  const tradeDownside = clamp(tradeSim.expectedRisk);
  const tradeEV       = tradeSim.expectedValue;

  // ── If Skip ───────────────────────────────────────────────────────────────
  // Benefit of skipping = risk avoided
  // Cost of skipping = missed opportunity
  const skipBenefit          = clamp(tradeSim.expectedRisk * 0.7);  // risk avoided
  const skipDownside         = clamp(tradeSim.expectedProbability * 0.5); // missed upside
  const riskAvoidedBySkipping = clamp(tradeSim.capitalAtRisk * 0.85);
  const opportunityMissed    = clamp(tradeBenefit * 0.80);

  // Skip EV: small positive from capital preservation
  const skipEV = (skipSim.expectedProbability / 100) * 0.1 - (1 - skipSim.expectedProbability / 100) * 0.05;

  // ── Opportunity Cost Score ────────────────────────────────────────────────
  // Positive = trading is better, Negative = skipping is better
  const ocScore = clamp((tradeEV - skipEV) * 25 + (executiveScore - 50) * 0.5, -100, 100);

  // ── Recommendation ────────────────────────────────────────────────────────
  let recommendation: OpportunityCostAnalysis["recommendation"];
  if (ocScore > 30 && tradeSim.confidence >= 65) {
    recommendation = "trade";
  } else if (ocScore < -20 || tradeSim.expectedRisk >= 70) {
    recommendation = "skip";
  } else if (waitSim.expectedValue >= tradeSim.expectedValue * 0.85) {
    recommendation = "wait";
  } else if (tradeSim.expectedRisk >= 55) {
    recommendation = "reduce";
  } else {
    recommendation = "wait";
  }

  const confidence = clamp(
    (tradeSim.confidence + skipSim.confidence) / 2 * 0.8 + Math.abs(ocScore) * 0.2
  );

  const reasoning = ocScore > 30
    ? `Trading has a net expected value advantage of ${(tradeEV - skipEV).toFixed(2)}R over skipping. ` +
      `At ${tradeSim.expectedProbability.toFixed(0)}% probability with ${tradeSim.expectedRR.toFixed(1)}:1 RR, ` +
      `the trade opportunity significantly outweighs the capital preservation benefit of skipping.`
    : ocScore < -20
    ? `Skipping preserves ${riskAvoidedBySkipping.toFixed(0)} risk units while missing only ${opportunityMissed.toFixed(0)} opportunity units. ` +
      `Current risk score (${tradeSim.expectedRisk.toFixed(0)}) makes avoidance the more rational choice.`
    : `The opportunity cost is marginal (score: ${ocScore.toFixed(0)}). ` +
      `Waiting for confirmation offers a similar expected value with reduced risk exposure.`;

  return {
    analysisId:            `oca_${randomUUID().slice(0, 8)}`,
    ifTrade: {
      action:               "trade",
      expectedBenefit:      Math.round(tradeBenefit * 10) / 10,
      potentialDownside:    Math.round(tradeDownside * 10) / 10,
      netExpectedValue:     Math.round(tradeEV * 100) / 100,
      probabilityOfSuccess: tradeSim.expectedProbability,
      description:          `Execute trade: ${tradeSim.expectedProbability.toFixed(0)}% probability of success, ` +
                            `${tradeSim.expectedRR.toFixed(1)}:1 RR, risk exposure ${tradeSim.expectedRisk.toFixed(0)}/100.`,
    },
    ifSkip: {
      action:               "skip",
      expectedBenefit:      Math.round(skipBenefit * 10) / 10,
      potentialDownside:    Math.round(skipDownside * 10) / 10,
      netExpectedValue:     Math.round(skipEV * 100) / 100,
      probabilityOfSuccess: skipSim.expectedProbability,
      description:          `Skip trade: preserves ${riskAvoidedBySkipping.toFixed(0)} risk units, ` +
                            `misses potential ${opportunityMissed.toFixed(0)}-unit opportunity.`,
    },
    opportunityCostScore:  Math.round(ocScore * 10) / 10,
    recommendation,
    confidence:            Math.round(confidence * 10) / 10,
    reasoning,
    riskAvoidedBySkipping: Math.round(riskAvoidedBySkipping * 10) / 10,
    opportunityMissedBySkipping: Math.round(opportunityMissed * 10) / 10,
  };
}
