// ─── Strategy Stability Monitor ───────────────────────────────────────────────

import {
  StrategyContext,
  StrategyStabilityCrisisSignal,
  THRESHOLDS,
  scoreToCrisisSeverity,
} from "./types.js";

export function monitorStrategyStability(ctx: StrategyContext): StrategyStabilityCrisisSignal {
  const evidence: string[] = [];

  const decline = ctx.baselineWinRate - ctx.recentWinRate;

  const winRateDecline = decline >= THRESHOLDS.WIN_RATE_DECLINE_MODERATE;
  if (winRateDecline)
    evidence.push(`Win rate decline: ${(decline * 100).toFixed(1)}% drop (${(ctx.recentWinRate * 100).toFixed(1)}% vs ${(ctx.baselineWinRate * 100).toFixed(1)}% baseline)`);

  const drawdownAcceleration = ctx.currentDrawdown >= THRESHOLDS.DRAWDOWN_MODERATE;
  if (drawdownAcceleration)
    evidence.push(`Drawdown acceleration: ${ctx.currentDrawdown.toFixed(2)}%`);

  const unexpectedLossClusters = ctx.lossStreak >= THRESHOLDS.LOSS_STREAK_HIGH;
  if (unexpectedLossClusters)
    evidence.push(`Unexpected loss cluster: ${ctx.lossStreak} consecutive losses`);

  // Performance drift: recent PnL is negative when baseline WR is positive
  const performanceDrift =
    ctx.recentPnL < 0 && ctx.baselineWinRate > 0.5;
  if (performanceDrift)
    evidence.push(`Performance drift: negative recent PnL despite ${(ctx.baselineWinRate * 100).toFixed(1)}% baseline win rate`);

  // Confidence collapse: extreme win rate drop
  const confidenceCollapse = decline >= THRESHOLDS.WIN_RATE_DECLINE_SEVERE;
  if (confidenceCollapse)
    evidence.push(`Confidence collapse: severe win rate decline of ${(decline * 100).toFixed(1)}%`);

  // Strategy degradation: drawdown + win rate decline together
  const strategyDegradation =
    drawdownAcceleration && winRateDecline;
  if (strategyDegradation)
    evidence.push("Strategy degradation: concurrent drawdown and win rate decline");

  let score = 0;
  if (confidenceCollapse)      score += 45;
  if (strategyDegradation)     score += 40;
  if (drawdownAcceleration && ctx.currentDrawdown >= THRESHOLDS.DRAWDOWN_SEVERE) score += 35;
  else if (drawdownAcceleration) score += 15;
  if (unexpectedLossClusters && ctx.lossStreak >= THRESHOLDS.LOSS_STREAK_CRITICAL) score += 30;
  else if (unexpectedLossClusters) score += 15;
  if (winRateDecline)          score += 20;
  if (performanceDrift)        score += 10;

  score += Math.max(0, decline - THRESHOLDS.WIN_RATE_DECLINE_MODERATE) * 100;
  score += Math.max(0, ctx.currentDrawdown - THRESHOLDS.DRAWDOWN_MODERATE) * 3;
  score += Math.max(0, ctx.lossStreak - THRESHOLDS.LOSS_STREAK_HIGH) * 5;

  const crisisScore    = Math.min(100, Math.round(score));
  const stabilityScore = Math.max(0, 100 - crisisScore);

  return {
    winRateDecline,
    drawdownAcceleration,
    unexpectedLossClusters,
    performanceDrift,
    confidenceCollapse,
    strategyDegradation,
    crisisScore,
    severity:         scoreToCrisisSeverity(crisisScore),
    evidence,
    stabilityScore,
    currentWinRate:   ctx.recentWinRate,
    baselineWinRate:  ctx.baselineWinRate,
    drawdownPercent:  ctx.currentDrawdown,
  };
}
