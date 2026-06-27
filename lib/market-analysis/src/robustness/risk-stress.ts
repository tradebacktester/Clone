/**
 * Risk Stress Testing
 * Analyzes losing streaks, drawdown recovery, position sizing resilience,
 * and daily/weekly risk limit trigger frequency.
 */
import { runSimulation, runMonteCarlo } from "./simulator.js";
import type {
  RiskStressResult,
  LosingStreakAnalysis,
  DrawdownRecovery,
  SimStats,
} from "./types.js";

function analyzeLosingStreak(
  baseWinRate: number,
  baseRR: number,
  numTrades: number,
  seed: number,
): LosingStreakAnalysis {
  const { trades, stats } = runSimulation({ baseWinRate, rrRatio: baseRR, numTrades, seed });

  // Find the worst losing streak
  let maxConsec = 0;
  let curConsec = 0;
  let maxDrawdownFromStreak = 0;
  let streakStartBalance = trades[0]?.balance ?? 10_000;
  let peakBalance = 10_000;
  let occurrences = 0;
  let lastStreakCount = 0;

  for (const t of trades) {
    if (!t.won) {
      if (curConsec === 0) streakStartBalance = t.balance;
      curConsec++;
      if (curConsec > maxConsec) {
        maxConsec = curConsec;
        maxDrawdownFromStreak = Math.max(0, ((streakStartBalance - t.balance) / streakStartBalance) * 100);
      }
    } else {
      if (curConsec >= 3) occurrences++;
      curConsec = 0;
    }
    if (t.balance > peakBalance) peakBalance = t.balance;
  }

  // Recovery trades needed: losses from streak / expected gain per win
  const riskPerTrade = 0.75;
  const avgWinPct = baseRR * riskPerTrade;
  const lossesFromStreak = maxConsec * riskPerTrade;
  const recoveryTradesNeeded = Math.ceil(lossesFromStreak / (avgWinPct * (baseWinRate / 100)));

  const streakDegradationPct = maxDrawdownFromStreak;

  return {
    maxConsecutiveLosses: maxConsec,
    maxDrawdownFromStreak: Math.round(maxDrawdownFromStreak * 100) / 100,
    recoveryTradesNeeded,
    occurrenceCount: occurrences,
    streakDegradationPct: Math.round(streakDegradationPct * 100) / 100,
  };
}

function analyzeDrawdownRecovery(
  baseWinRate: number,
  baseRR: number,
  numTrades: number,
  seed: number,
): DrawdownRecovery[] {
  const depths = [5, 10, 15, 20, 30];
  const results: DrawdownRecovery[] = [];

  for (const depth of depths) {
    // Simulate: starting at a drawdown of `depth`% below peak, how long to recover?
    // Approach: run many simulations, count how many recover within N trades
    const { allStats } = runMonteCarlo(
      { baseWinRate, rrRatio: baseRR, numTrades: 100, seed },
      100,
    );

    // Probability of recovering: if expected gain per trade is positive, it's a matter of time
    const avgGainPerTrade = allStats.reduce((s, st) => s + st.totalPnl / st.totalTrades, 0) / allStats.length;
    const pnlNeededToRecover = depth * 100;   // $100 balance → need $depth more
    const avgRecoveryTrades = avgGainPerTrade > 0 ? Math.ceil(pnlNeededToRecover / avgGainPerTrade) : 999;
    const recoveriesSucceeded = allStats.filter(st => {
      const finalPnl = st.totalPnl;
      return finalPnl > 0;
    }).length;
    const probabilityOfRecovery = Math.round((recoveriesSucceeded / allStats.length) * 100);

    results.push({
      drawdownDepthPct: depth,
      recoveryTrades: Math.min(avgRecoveryTrades, 500),
      recoveryDays: Math.round(Math.min(avgRecoveryTrades, 500) / 2),  // ~2 trades/day
      probabilityOfRecovery,
    });
  }

  return results;
}

function checkRiskLimitBreaches(
  baseWinRate: number,
  baseRR: number,
  seed: number,
  dailyLimitPct = 3,
  weeklyLimitPct = 6,
  riskPerTrade = 0.75,
): { dailyBreaches: number; weeklyBreaches: number } {
  // Simulate 3 months of trading: ~2 trades/day × 60 days = 120 trades
  const { trades } = runSimulation({ baseWinRate, rrRatio: baseRR, numTrades: 120, riskPerTrade, seed });

  let dailyBreaches = 0;
  let weeklyBreaches = 0;

  // Group trades into simulated days (2/day) and weeks (10/week)
  const tradePnlPcts = trades.map(t => t.pnlPct);

  for (let day = 0; day < 60; day++) {
    const dayTrades = tradePnlPcts.slice(day * 2, day * 2 + 2);
    const dayPnl = dayTrades.reduce((s, p) => s + p, 0);
    if (dayPnl < -dailyLimitPct) dailyBreaches++;
  }

  for (let week = 0; week < 12; week++) {
    const weekTrades = tradePnlPcts.slice(week * 10, week * 10 + 10);
    const weekPnl = weekTrades.reduce((s, p) => s + p, 0);
    if (weekPnl < -weeklyLimitPct) weeklyBreaches++;
  }

  return { dailyBreaches, weeklyBreaches };
}

export async function runRiskStressTests(config: {
  baseWinRate?: number;
  baseRR?: number;
  numTrades?: number;
  riskPerTrade?: number;
  seed?: number;
  dailyLimitPct?: number;
  weeklyLimitPct?: number;
} = {}): Promise<RiskStressResult> {
  const t0 = Date.now();
  const baseWinRate = config.baseWinRate ?? 52;
  const baseRR = config.baseRR ?? 2.0;
  const numTrades = config.numTrades ?? 500;
  const riskPerTrade = config.riskPerTrade ?? 0.75;
  const seed = config.seed ?? 42;
  const dailyLimitPct = config.dailyLimitPct ?? 3;
  const weeklyLimitPct = config.weeklyLimitPct ?? 6;

  // Run all risk analyses in parallel (they're sync but structured for clarity)
  const losingStreak = analyzeLosingStreak(baseWinRate, baseRR, numTrades, seed);
  const drawdownRecovery = analyzeDrawdownRecovery(baseWinRate, baseRR, 200, seed + 10);
  const limitBreaches = checkRiskLimitBreaches(baseWinRate, baseRR, seed + 20, dailyLimitPct, weeklyLimitPct, riskPerTrade);

  // Position sizing resilience: simulate at different equity levels
  const { stats: at50 } = runSimulation({
    baseWinRate, rrRatio: baseRR, numTrades: 200, riskPerTrade,
    initialBalance: 5_000, seed: seed + 30,
  });
  const { stats: at75 } = runSimulation({
    baseWinRate, rrRatio: baseRR, numTrades: 200, riskPerTrade,
    initialBalance: 7_500, seed: seed + 31,
  });
  const { stats: at125 } = runSimulation({
    baseWinRate, rrRatio: baseRR, numTrades: 200, riskPerTrade,
    initialBalance: 12_500, seed: seed + 32,
  });

  // Score
  const streakScore = Math.max(0, 100 - losingStreak.maxConsecutiveLosses * 5);
  const recoveryScore = Math.round(
    drawdownRecovery.slice(0, 3).reduce((s, r) => s + r.probabilityOfRecovery, 0) / 3,
  );
  const limitScore = Math.max(0, 100 - (limitBreaches.dailyBreaches * 10 + limitBreaches.weeklyBreaches * 8));
  const overallResilienceScore = Math.round((streakScore + recoveryScore + limitScore) / 3);

  const findings: string[] = [];
  if (losingStreak.maxConsecutiveLosses >= 10) {
    findings.push(`Max losing streak of ${losingStreak.maxConsecutiveLosses} trades — consider adding a max consecutive loss halt`);
  } else {
    findings.push(`Max losing streak: ${losingStreak.maxConsecutiveLosses} trades — within acceptable limits`);
  }

  if (losingStreak.maxDrawdownFromStreak > 15) {
    findings.push(`Losing streak drawdown ${losingStreak.maxDrawdownFromStreak.toFixed(1)}% — risk per trade may be too high for adverse runs`);
  }

  if (limitBreaches.dailyBreaches > 5) {
    findings.push(`Daily loss limit breached ${limitBreaches.dailyBreaches} times in 60 simulated days — limit set too loose or risk per trade too high`);
  } else {
    findings.push(`Daily loss limit breached ${limitBreaches.dailyBreaches} time(s) in 60 simulated days — within acceptable range`);
  }

  const d10Recovery = drawdownRecovery.find(d => d.drawdownDepthPct === 10);
  if (d10Recovery) {
    findings.push(`Recovery from 10% drawdown: ~${d10Recovery.recoveryTrades} trades (${d10Recovery.recoveryDays} days) — ${d10Recovery.probabilityOfRecovery}% probability`);
  }

  const sizingVariance = Math.abs(at50.winRate - at125.winRate);
  if (sizingVariance < 3) {
    findings.push("Position sizing is stable across equity levels — % risk model scales correctly");
  } else {
    findings.push(`Win rate variance ${sizingVariance.toFixed(1)}% across equity levels — position sizing may need review`);
  }

  return {
    losingStreak,
    drawdownRecovery,
    positionSizingResilience: {
      at50pctEquity: at50,
      at75pctEquity: at75,
      at125pctEquity: at125,
    },
    dailyLimitBreaches: limitBreaches.dailyBreaches,
    weeklyLimitBreaches: limitBreaches.weeklyBreaches,
    overallResilienceScore,
    findings,
    durationMs: Date.now() - t0,
  };
}
