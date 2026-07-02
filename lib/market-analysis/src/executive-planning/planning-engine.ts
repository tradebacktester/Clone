// ─── Planning Engine ──────────────────────────────────────────────────────────
// Generates 4-horizon plans: Immediate, Short-Term, Medium-Term, Long-Term

import { randomUUID } from "crypto";
import type { Goal, ExecutivePlan, PlanHorizon, PlanAction } from "./types.js";

const HORIZON_LABELS: Record<PlanHorizon, string> = {
  immediate:   "Immediate",
  short_term:  "Short-Term",
  medium_term: "Medium-Term",
  long_term:   "Long-Term",
};

const HORIZON_TIMEFRAMES: Record<PlanHorizon, string> = {
  immediate:   "next trade",
  short_term:  "next 4-hour session",
  medium_term: "next 5 trading days",
  long_term:   "next 30 days",
};

function action(desc: string, goalId: string, horizon: PlanHorizon, priority: number, rationale: string): PlanAction {
  return {
    actionId:    `a_${randomUUID().slice(0, 8)}`,
    description: desc,
    goalId,
    horizon,
    priority,
    rationale,
  };
}

function buildPlan(
  horizon: PlanHorizon,
  title: string,
  summary: string,
  actions: PlanAction[],
  linkedGoalIds: string[],
  confidence: number,
  risks: string[],
  expectedBenefits: string[],
): ExecutivePlan {
  return {
    planId:       `p_${randomUUID().slice(0, 8)}`,
    horizon,
    horizonLabel: HORIZON_LABELS[horizon],
    timeframe:    HORIZON_TIMEFRAMES[horizon],
    title,
    summary,
    actions,
    linkedGoals:  linkedGoalIds,
    confidence,
    risks,
    expectedBenefits,
  };
}

interface PlanContext {
  topGoals:      Goal[];
  executiveScore: number;
  riskScore:     number;
  drawdownPct:   number;
  survivalMode:  boolean;
  crisisStatus:  string;
  winRate:       number;
  profitFactor:  number;
}

export function generateAllPlans(ctx: PlanContext): ExecutivePlan[] {
  const { topGoals, executiveScore, riskScore, drawdownPct, survivalMode, crisisStatus, winRate, profitFactor } = ctx;

  const isInCrisis   = crisisStatus !== "none" && crisisStatus !== "normal";
  const highRisk     = riskScore >= 65;
  const drawdownHigh = drawdownPct >= 5;

  const level1Goals = topGoals.filter(g => g.level === 1);
  const level4Goals = topGoals.filter(g => g.level === 4);
  const level3Goals = topGoals.filter(g => g.level === 3);
  const level2Goals = topGoals.filter(g => g.level === 2);

  const topL4 = level4Goals[0];
  const topL3 = level3Goals[0];
  const topL2 = level2Goals[0];
  const topL1 = level1Goals[0];

  // ── Immediate Plan ────────────────────────────────────────────────────────
  let immediateTitle:   string;
  let immediateSummary: string;
  let immediateActions: PlanAction[];

  if (survivalMode || isInCrisis) {
    immediateTitle   = "Emergency Pause — No New Positions";
    immediateSummary = `Survival mode is active (crisis: ${crisisStatus}). All trading activity paused. Focus on capital protection.`;
    immediateActions = [
      action("Halt all new position entries", topL4?.goalId ?? topL1!.goalId, "immediate", 100, "Survival mode requires immediate trading halt"),
      action("Monitor existing positions for exit opportunities", topL1!.goalId, "immediate", 90, "Capital preservation requires position oversight"),
      action("Document market conditions for post-crisis review", topL1!.goalId, "immediate", 60, "Crisis data informs future defensive protocols"),
    ];
  } else if (drawdownHigh) {
    immediateTitle   = "Drawdown Recovery — Defensive Entry Only";
    immediateSummary = `Drawdown at ${drawdownPct.toFixed(1)}%. Only highest-quality setups permitted. Reduce position sizing.`;
    immediateActions = [
      action("Reduce position size to 50% of normal", topL4?.goalId ?? topL2?.goalId ?? topL1!.goalId, "immediate", 95, `Drawdown ${drawdownPct.toFixed(1)}% — capital protection mode`),
      action("Wait for executive score ≥ 80 before entry", topL2?.goalId ?? topL1!.goalId, "immediate", 88, "Elevated quality threshold during recovery phase"),
      action("Set stop-loss closer to entry for all new trades", topL1!.goalId, "immediate", 82, "Tighter stops reduce further drawdown risk"),
    ];
  } else if (executiveScore >= 70 && !highRisk) {
    immediateTitle   = "High-Quality Execution Window Open";
    immediateSummary = `Executive score ${executiveScore.toFixed(0)}, low risk (${riskScore.toFixed(0)}). Conditions support disciplined entry.`;
    immediateActions = [
      action("Execute qualifying setup at planned entry level", topL4?.goalId ?? topL1!.goalId, "immediate", 90, `Strong intelligence convergence — executive ${executiveScore.toFixed(0)}, risk ${riskScore.toFixed(0)}`),
      action("Confirm AMD structure before entry", topL1!.goalId, "immediate", 85, "Strategy compliance mandatory"),
      action("Set risk management parameters per configuration", topL1!.goalId, "immediate", 80, "Position sizing and SL at pre-defined levels"),
    ];
  } else {
    immediateTitle   = "Observation Mode — Await Confirmation";
    immediateSummary = `Conditions are not yet at full confirmation threshold. Monitor for signal convergence.`;
    immediateActions = [
      action("Continue monitoring all three pairs for signal", topL4?.goalId ?? topL1!.goalId, "immediate", 80, "Patience over forced entry"),
      action("Note upcoming high-impact news events", topL3?.goalId ?? topL1!.goalId, "immediate", 70, "News filters may restrict entries"),
      action("Review active signals for quality improvement", topL2?.goalId ?? topL1!.goalId, "immediate", 65, "Setup quality elevation before entry"),
    ];
  }

  const immediatePlan = buildPlan(
    "immediate",
    immediateTitle,
    immediateSummary,
    immediateActions,
    [...new Set(immediateActions.map(a => a.goalId))],
    Math.round(executiveScore * 0.80),
    highRisk ? ["Elevated risk environment", "Possible false breakout signals"] : ["Standard market risk applies"],
    ["Disciplined execution prevents reactive trading", "Quality filter reduces loss frequency"],
  );

  // ── Short-Term Plan ───────────────────────────────────────────────────────
  const shortTermPlan = buildPlan(
    "short_term",
    highRisk ? "Defensive Session Strategy" : "Quality-First Session Strategy",
    highRisk
      ? `Risk score ${riskScore.toFixed(0)}/100. Prioritise capital protection this session. Max 1 position.`
      : `Focus on ${winRate < 50 ? "improving win rate through quality selection" : "maintaining current performance standards"}. Target 1-2 high-quality setups.`,
    [
      action("Limit maximum positions to 1 this session", topL3?.goalId ?? topL1!.goalId, "short_term", 85, highRisk ? "Risk environment demands exposure control" : "Quality over quantity"),
      action("Apply minimum executive score filter of 65", topL2?.goalId ?? topL1!.goalId, "short_term", 80, "Maintains trade quality standard"),
      action("Review performance vs session targets at close", topL2?.goalId ?? topL1!.goalId, "short_term", 70, "Continuous feedback loop"),
      action("Monitor profit factor impact of session trades", topL2?.goalId ?? topL1!.goalId, "short_term", 65, `PF currently at ${profitFactor.toFixed(2)}`),
    ],
    [topL3?.goalId, topL2?.goalId, topL1?.goalId].filter(Boolean) as string[],
    Math.round(executiveScore * 0.72),
    ["Session volatility may reduce setup quality", "News events could invalidate analysis"],
    ["Clear session objective improves decision consistency", "Quality filter prevents degradation of PF"],
  );

  // ── Medium-Term Plan ──────────────────────────────────────────────────────
  const mediumTermPlan = buildPlan(
    "medium_term",
    drawdownHigh ? "Drawdown Recovery Campaign" : "Systematic Performance Improvement",
    drawdownHigh
      ? `5-day recovery plan: reduce drawdown from ${drawdownPct.toFixed(1)}% to target <3%. Increase setup quality thresholds.`
      : `Over the next 5 trading days: target win rate ${winRate < 55 ? "improvement to 55%" : "maintenance above 55%"} and profit factor ${profitFactor < 1.5 ? "recovery to 1.5+" : "maintenance above 1.5"}.`,
    [
      action(`Target ${winRate < 55 ? "win rate improvement" : "win rate maintenance"} over next 20 trades`, topL2?.goalId ?? topL1!.goalId, "medium_term", 80, "Win rate improvement requires setup quality focus"),
      action("Review and tighten setup quality criteria if PF < 1.5", topL2?.goalId ?? topL1!.goalId, "medium_term", 75, `Current PF: ${profitFactor.toFixed(2)}`),
      action("Conduct weekly drawdown review against 8% limit", topL2?.goalId ?? topL1!.goalId, "medium_term", 70, "Proactive drawdown management"),
      action("Update learning engine with new pattern evidence", topL1!.goalId, "medium_term", 60, "Continuous improvement through evidence accumulation"),
    ],
    [topL2?.goalId, topL1?.goalId].filter(Boolean) as string[],
    Math.round(executiveScore * 0.65),
    ["Market regime may shift during this window", "Overtrading risk if quality thresholds are relaxed"],
    ["Systematic approach produces consistent improvement", "Evidence-based adjustments compound over time"],
  );

  // ── Long-Term Plan ────────────────────────────────────────────────────────
  const longTermPlan = buildPlan(
    "long_term",
    "Permanent Mission Alignment — 30-Day Horizon",
    "Maintain absolute adherence to permanent mission objectives while systematically improving expectancy, execution quality, and statistical robustness.",
    [
      action("Maintain drawdown below 8% limit at all times", topL1!.goalId, "long_term", 95, "Permanent mission: capital preservation"),
      action("Achieve profit factor ≥ 1.5 over 100-trade sample", topL2?.goalId ?? topL1!.goalId, "long_term", 85, "Long-term profitability target"),
      action("Complete 20-episode RL agent learning cycle", topL1!.goalId, "long_term", 75, "Research laboratory integration"),
      action("Validate all strategy improvements through backtesting", topL1!.goalId, "long_term", 70, "Statistical robustness requirement"),
      action("Conduct monthly mission health certification", topL1!.goalId, "long_term", 65, "Institutional-grade governance"),
    ],
    level1Goals.map(g => g.goalId),
    Math.round(executiveScore * 0.60),
    ["Market regime changes may require plan adaptation", "Learning system improvements must be validated before deployment"],
    ["Long-term consistency compounds into institutional-grade performance", "Mission alignment ensures no drift from core objectives"],
  );

  return [immediatePlan, shortTermPlan, mediumTermPlan, longTermPlan];
}
