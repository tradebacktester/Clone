// ─── Counterfactual Analysis Engine ──────────────────────────────────────────
// Simulates what would have happened if a different decision had been made.

import { randomUUID } from "crypto";
import type {
  CounterfactualAnalysis,
  CounterfactualResult,
  DecisionSimulation,
  DecisionType,
} from "./types.js";
import { DECISION_TYPE_LABELS } from "./types.js";

function clamp(v: number, lo = -10, hi = 10): number {
  return Math.min(hi, Math.max(lo, v));
}

function hypotheticalPnL(
  d: DecisionType,
  actualDecision: DecisionType,
  actualPnL: number,
  sim: DecisionSimulation
): { pnl: number; outcome: CounterfactualResult["hypotheticalOutcome"]; reliability: number } {
  // If the actual trade won, how would alternatives have fared?
  // If the actual trade lost, how would alternatives have compared?

  const p = sim.expectedProbability / 100;
  const rr = sim.expectedRR;

  switch (d) {
    case "execute_trade": {
      // Same result as actual if this IS the actual decision
      const pnl = d === actualDecision ? actualPnL : p * rr - (1 - p) * 1.0;
      return {
        pnl:         clamp(pnl),
        outcome:     pnl > 0 ? "win" : pnl < 0 ? "loss" : "neutral",
        reliability: 80,
      };
    }

    case "wait_one_candle": {
      // Waiting would have gotten a slightly better/worse entry depending on direction
      const entryImprovement = (sim.expectedProbability - 50) / 100 * 0.3;
      const pnl = d === actualDecision ? actualPnL : clamp(actualPnL + entryImprovement);
      return {
        pnl:         clamp(pnl),
        outcome:     pnl > 0 ? "win" : pnl < 0 ? "loss" : "neutral",
        reliability: 65,
      };
    }

    case "wait_confirmation": {
      // Confirmation filter would have filtered out the setup ~25% of the time
      const filteredOut = sim.confidence < 55;
      if (filteredOut) {
        return { pnl: 0, outcome: "neutral", reliability: 55 };
      }
      const pnl = clamp(actualPnL * 0.85); // slightly lower due to worse entry
      return {
        pnl,
        outcome:     pnl > 0 ? "win" : pnl < 0 ? "loss" : "neutral",
        reliability: 60,
      };
    }

    case "reduce_position": {
      // Half position = half PnL
      const pnl = clamp(actualPnL * 0.5);
      return {
        pnl,
        outcome:     pnl > 0 ? "win" : pnl < 0 ? "loss" : "neutral",
        reliability: 80, // straightforward scaling
      };
    }

    case "observation_mode": {
      return { pnl: 0, outcome: "neutral", reliability: 95 };
    }

    case "skip_trade": {
      // Skipping preserves capital — result is 0
      // But if actual was a win, skipping = missed +PnL
      return { pnl: 0, outcome: "avoided_loss", reliability: 95 };
    }

    case "emergency_pause": {
      return { pnl: 0, outcome: "avoided_loss", reliability: 98 };
    }
  }
}

export function buildCounterfactualAnalysis(params: {
  judgmentId:    string;
  tradeId:       string | null;
  actualDecision: DecisionType;
  actualOutcome:  "win" | "loss" | "neutral";
  actualPnL:      number;
  actualRR:       number;
  simulations:    DecisionSimulation[];
}): CounterfactualAnalysis {
  const { judgmentId, tradeId, actualDecision, actualOutcome, actualPnL, actualRR, simulations } = params;

  const alternatives: CounterfactualResult[] = simulations
    .filter(s => s.decisionType !== actualDecision)
    .map(sim => {
      const { pnl, outcome, reliability } = hypotheticalPnL(sim.decisionType, actualDecision, actualPnL, sim);
      const comparedToActual = Math.round((pnl - actualPnL) * 100) / 100;

      let description: string;
      if (sim.decisionType === "skip_trade" || sim.decisionType === "emergency_pause") {
        description = actualOutcome === "win"
          ? `Skipping would have missed the ${actualPnL.toFixed(2)}R gain — opportunity cost was real.`
          : `Skipping would have avoided the ${Math.abs(actualPnL).toFixed(2)}R loss — capital preservation validated.`;
      } else {
        description = comparedToActual > 0
          ? `${sim.decisionLabel} would have produced ${pnl.toFixed(2)}R — ${comparedToActual.toFixed(2)}R better than actual.`
          : `${sim.decisionLabel} would have produced ${pnl.toFixed(2)}R — ${Math.abs(comparedToActual).toFixed(2)}R worse than actual.`;
      }

      return {
        decisionType:        sim.decisionType,
        decisionLabel:       DECISION_TYPE_LABELS[sim.decisionType],
        hypotheticalOutcome: outcome,
        hypotheticalPnL:     pnl,
        hypotheticalRR:      sim.expectedRR,
        comparedToActual,
        description,
        reliability,
      };
    });

  const sorted = [...alternatives].sort((a, b) => b.hypotheticalPnL - a.hypotheticalPnL);
  const bestAlt  = sorted[0] ?? null;
  const worstAlt = sorted[sorted.length - 1] ?? null;

  const decisionQualityScore = (() => {
    if (alternatives.length === 0) return 75;
    const betterAlternatives = alternatives.filter(a => a.comparedToActual > 0.1).length;
    const total = alternatives.length;
    // Higher score if most alternatives would have done worse
    return Math.round(Math.min(100, Math.max(10, (1 - betterAlternatives / total) * 85 + 15)));
  })();

  const learningInsight = (() => {
    const betterAlts = alternatives.filter(a => a.comparedToActual > 0.2);
    if (betterAlts.length === 0) {
      return `Decision quality validated: no alternative would have meaningfully outperformed the actual ${actualDecision} (score: ${decisionQualityScore}/100). ` +
        `The judgment engine selected the optimal action given the available intelligence.`;
    }
    const topAlt = betterAlts.sort((a, b) => b.comparedToActual - a.comparedToActual)[0];
    return `Counterfactual suggests '${topAlt.decisionLabel}' would have improved outcome by ${topAlt.comparedToActual.toFixed(2)}R. ` +
      `This pattern should inform future judgment when similar intelligence conditions arise. ` +
      `Decision quality score: ${decisionQualityScore}/100.`;
  })();

  return {
    analysisId:           `cfa_${randomUUID().slice(0, 8)}`,
    judgmentId,
    tradeId,
    completedAt:          new Date().toISOString(),
    actualDecision,
    actualOutcome,
    actualPnL,
    actualRR,
    alternatives,
    bestAlternative:      bestAlt,
    worstAlternative:     worstAlt,
    learningInsight,
    decisionQualityScore,
  };
}
