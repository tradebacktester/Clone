// ─── Goal Generator ────────────────────────────────────────────────────────────
// Creates goals across all 4 levels of the mission hierarchy.

import { randomUUID } from "crypto";
import type { Goal, GoalLevel, GoalCategory } from "./types.js";
import { GOAL_LEVEL_NAMES, GOAL_LEVEL_LABELS } from "./types.js";

function clamp(v: number, lo = 0, hi = 100): number {
  return Math.min(hi, Math.max(lo, v));
}

function goal(
  level: GoalLevel,
  category: GoalCategory,
  title: string,
  description: string,
  metric: string,
  target: number,
  current: number,
  unit: string,
  higherIsBetter: boolean,
  importance: number,
  urgency: number,
  impact: number,
  riskIfUnmet: number,
  confidence: number,
  evidence: string[],
  obstacles: string[] = [],
): Goal {
  const priority = clamp(importance * 0.35 + urgency * 0.30 + impact * 0.20 + riskIfUnmet * 0.15);
  const progress = higherIsBetter
    ? clamp((current / Math.max(0.01, target)) * 100)
    : clamp((1 - (current - target) / Math.max(0.01, target)) * 100);

  const estDays = progress >= 100 ? 0 : Math.round((100 - progress) / Math.max(1, urgency / 10));
  const estimatedCompletion = new Date(Date.now() + estDays * 86_400_000).toISOString();

  const whyRank = `Priority ${priority.toFixed(0)}/100 — importance ${importance.toFixed(0)}, urgency ${urgency.toFixed(0)}, impact ${impact.toFixed(0)}, risk-if-unmet ${riskIfUnmet.toFixed(0)}.`;

  return {
    goalId:              `g_${randomUUID().slice(0, 8)}`,
    level,
    levelName:           GOAL_LEVEL_NAMES[level],
    levelLabel:          GOAL_LEVEL_LABELS[level],
    category,
    title,
    description,
    metric,
    target,
    current,
    unit,
    higherIsBetter,
    priority:            Math.round(priority * 10) / 10,
    importance:          Math.round(importance * 10) / 10,
    urgency:             Math.round(urgency * 10) / 10,
    expectedImpact:      Math.round(impact * 10) / 10,
    riskIfUnmet:         Math.round(riskIfUnmet * 10) / 10,
    confidence:          Math.round(confidence * 10) / 10,
    status:              progress >= 100 ? "completed" : "active",
    progress:            Math.round(progress * 10) / 10,
    estimatedCompletion,
    obstacles,
    evidence,
    whyThisRank:         whyRank,
  };
}

export interface GoalContext {
  executiveScore:  number;
  riskScore:       number;
  drawdownPct:     number;
  winRate:         number;
  profitFactor:    number;
  openPositions:   number;
  crisisStatus:    string;
  survivalMode:    boolean;
  strategyScore:   number;
  marketScore:     number;
}

export function generateAllGoals(ctx: GoalContext): Goal[] {
  const {
    executiveScore, riskScore, drawdownPct, winRate,
    profitFactor, openPositions, crisisStatus, survivalMode,
    strategyScore, marketScore,
  } = ctx;

  const isInCrisis     = crisisStatus !== "none" && crisisStatus !== "normal";
  const highRisk       = riskScore >= 65;
  const drawdownHigh   = drawdownPct >= 5;
  const winRateLow     = winRate < 50;
  const pfLow          = profitFactor < 1.5;
  const manyPositions  = openPositions >= 2;
  const strongSignal   = executiveScore >= 70 && strategyScore >= 65 && !highRisk;

  const goals: Goal[] = [];

  // ── Level 1: Permanent Mission ─────────────────────────────────────────────
  goals.push(goal(1, "capital_preservation",
    "Preserve Capital at All Times",
    "Never risk more than the configured maximum per trade or session. Capital preservation is the foundation of all other objectives.",
    "capitalIntactPct", 100, 100, "%", true,
    100, 100, 100, 100, 95,
    ["Permanent mission constraint — overrides all Level 2-4 goals"],
  ));

  goals.push(goal(1, "execution_quality",
    "Maintain Disciplined Execution",
    "Every trade must follow the deterministic AMD/SMC strategy. No emotional or reactive deviations.",
    "executionAdherence", 100, clamp(executiveScore * 0.9), "%", true,
    95, 85, 90, 90, 90,
    ["Executive score alignment with strategy score confirms disciplined setup evaluation"],
  ));

  goals.push(goal(1, "profitability",
    "Ensure Long-Term Profitability",
    "Maintain positive expectancy over rolling 100-trade windows. No single session dominates results.",
    "longTermExpectancy", 1.0, clamp(profitFactor / 3, 0, 1.0), "R", true,
    90, 80, 95, 85, 85,
    [`Current profit factor ${profitFactor.toFixed(2)} — long-term trajectory monitored`],
  ));

  goals.push(goal(1, "compliance",
    "Never Violate Safety Rules",
    "Emergency pause, survival mode, and risk gates must be respected unconditionally.",
    "safetyViolations", 0, 0, "count", false,
    100, 100, 100, 100, 98,
    ["Safety gates enforced at execution layer — no override path exists"],
  ));

  goals.push(goal(1, "risk_management",
    "Remain Statistically Robust",
    "Performance must be reproducible across different market regimes. No over-fit dependency on single conditions.",
    "regimeRobustness", 80, clamp(marketScore * 0.8), "%", true,
    90, 70, 85, 80, 80,
    [`Market intelligence score ${marketScore.toFixed(0)} reflects current regime robustness`],
  ));

  // ── Level 2: Strategic Goals ───────────────────────────────────────────────
  const maxDDTarget = 8.0;
  goals.push(goal(2, "drawdown_control",
    "Maintain Maximum Drawdown Below Limit",
    `Keep drawdown below ${maxDDTarget}% to protect capital base.`,
    "drawdownPct", maxDDTarget, drawdownPct, "%", false,
    drawdownHigh ? 95 : 75, drawdownHigh ? 90 : 50, drawdownHigh ? 85 : 60, drawdownHigh ? 90 : 65, 85,
    [`Current drawdown: ${drawdownPct.toFixed(1)}%`, `Target: <${maxDDTarget}%`],
    drawdownHigh ? ["Drawdown exceeds threshold — immediate risk reduction required"] : [],
  ));

  goals.push(goal(2, "profitability",
    "Maintain Target Profit Factor ≥ 1.5",
    "Profit factor above 1.5 indicates sustainable positive expectancy.",
    "profitFactor", 1.5, profitFactor, "ratio", true,
    pfLow ? 85 : 65, pfLow ? 75 : 45, 80, pfLow ? 70 : 50, 80,
    [`Current profit factor: ${profitFactor.toFixed(2)}`, "Target: ≥1.5"],
    pfLow ? ["Profit factor below target — review setup quality"] : [],
  ));

  goals.push(goal(2, "profitability",
    "Improve Long-Term Expectancy",
    "Systematically increase the average R per trade through quality filter improvement.",
    "avgRPerTrade", 0.5, clamp(profitFactor * 0.25, 0, 1.0), "R", true,
    70, 50, 85, 60, 75,
    ["Learning engine pattern quality improvement directly contributes to expectancy"],
  ));

  goals.push(goal(2, "execution_quality",
    "Reduce Execution Errors",
    "Minimize false entries, premature exits, and rule violations.",
    "executionScore", 85, clamp(executiveScore * 0.85), "%", true,
    75, 60, 75, 65, 80,
    [`Executive score ${executiveScore.toFixed(0)} reflects current execution quality`],
  ));

  goals.push(goal(2, "trade_quality",
    "Improve Average Trade Quality Score",
    "Increase the proportion of trades rated 'A-grade' by the strategy quality engine.",
    "avgSetupQuality", 75, clamp(strategyScore * 0.9), "%", true,
    70, 55, 80, 60, 78,
    [`Strategy score ${strategyScore.toFixed(0)} reflects current setup quality`],
  ));

  // ── Level 3: Operational Goals ─────────────────────────────────────────────
  if (highRisk || drawdownHigh) {
    goals.push(goal(3, "exposure_control",
      "Reduce Portfolio Exposure",
      "Limit open positions and notional exposure during elevated risk conditions.",
      "openPositions", 1, openPositions, "count", false,
      85, 90, 80, 85, 88,
      [`Current open positions: ${openPositions}`, `Risk score: ${riskScore.toFixed(0)}/100`],
      ["High risk environment requires immediate exposure reduction"],
    ));
  }

  if (marketScore < 55 || isInCrisis) {
    goals.push(goal(3, "market_observation",
      "Increase Observation Time",
      "Spend more cycles gathering market intelligence before committing capital.",
      "observationRatio", 70, clamp(100 - marketScore), "%", true,
      80, isInCrisis ? 95 : 70, 70, 75, 82,
      [`Market score ${marketScore.toFixed(0)} suggests unclear direction`, `Crisis: ${crisisStatus}`],
    ));
  }

  if (!highRisk && executiveScore >= 60) {
    goals.push(goal(3, "trade_quality",
      "Focus on Higher-Quality Setups Only",
      "Only take setups with executive score ≥ 70 and strategy score ≥ 65.",
      "qualityThresholdAdherence", 90, clamp(executiveScore * 0.85 + strategyScore * 0.15), "%", true,
      75, 65, 80, 65, 82,
      [`Executive score ${executiveScore.toFixed(0)}, strategy score ${strategyScore.toFixed(0)}`],
    ));
  }

  goals.push(goal(3, "portfolio_management",
    "Avoid Correlated Trades",
    "Do not simultaneously hold positions in correlated pairs (EUR/USD + GBP/USD).",
    "correlationViolations", 0, 0, "count", false,
    70, 60, 65, 60, 85,
    ["Correlation monitoring active — no violations detected this session"],
  ));

  goals.push(goal(3, "execution_quality",
    "Improve Entry Execution Quality",
    "Ensure all entries are placed within 2 pips of planned level.",
    "entryPrecision", 95, clamp(executiveScore * 0.88), "%", true,
    65, 55, 70, 55, 78,
    [`Executive judgment confidence supports entry precision targets`],
  ));

  // ── Level 4: Immediate Goals ───────────────────────────────────────────────
  if (survivalMode || isInCrisis) {
    goals.push(goal(4, "recovery",
      "Pause Trading — Survival Mode Active",
      "Halt all new positions until survival mode is cleared and capital is protected.",
      "tradingPaused", 1, survivalMode ? 1 : 0, "bool", true,
      100, 100, 95, 100, 96,
      [`Survival mode: ${survivalMode}`, `Crisis status: ${crisisStatus}`],
      ["Active survival mode — no new positions permitted"],
    ));
  } else if (drawdownHigh) {
    goals.push(goal(4, "recovery",
      "Recover from Drawdown — Conservative Mode",
      "Use defensive position sizing until drawdown recovers below 3%.",
      "drawdownRecovery", 3, drawdownPct, "%", false,
      92, 95, 85, 88, 88,
      [`Current drawdown ${drawdownPct.toFixed(1)}% — recovery required`],
    ));
  } else if (strongSignal) {
    goals.push(goal(4, "trade_quality",
      "Execute High-Quality Setup",
      "Current intelligence supports execution — engage with disciplined sizing.",
      "executionReadiness", 100, clamp(executiveScore * 0.9), "%", true,
      80, 88, 85, 70, 85,
      [`Executive score ${executiveScore.toFixed(0)}, strategy score ${strategyScore.toFixed(0)}, risk score ${riskScore.toFixed(0)}`],
    ));
  } else if (winRateLow) {
    goals.push(goal(4, "market_observation",
      "Monitor Market — Wait for Clearer Signal",
      "Win rate is below 50%. Observe current price action before next entry.",
      "observationTime", 30, 0, "min", true,
      75, 80, 75, 72, 82,
      [`Win rate ${winRate.toFixed(0)}% — below target threshold`],
    ));
  } else {
    goals.push(goal(4, "market_observation",
      "Wait for Confirmation Signal",
      "Current setup is not at full confirmation. Monitor for additional signal before entry.",
      "confirmationSignalReceived", 1, 0, "bool", true,
      72, 75, 70, 65, 80,
      [`Executive score ${executiveScore.toFixed(0)} — acceptable but below threshold for immediate execution`],
    ));
  }

  if (manyPositions) {
    goals.push(goal(4, "exposure_control",
      "Reduce Open Positions Before Next Entry",
      "Multiple open positions increase correlation risk. Close or hedge before adding.",
      "maxOpenPositions", 1, openPositions, "count", false,
      85, 92, 80, 80, 87,
      [`${openPositions} open positions — exceeds threshold of 1`],
    ));
  }

  return goals;
}
