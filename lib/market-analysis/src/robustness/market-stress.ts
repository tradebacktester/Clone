/**
 * Market Stress Testing
 * Tests strategy performance under 6 distinct adverse market conditions.
 */
import { runSimulation } from "./simulator.js";
import { MARKET_CONDITION_PROFILES, ALL_CONDITIONS } from "./candle-gen.js";
import type { MarketStressResult, MarketStressScenario, SimStats } from "./types.js";

function getVerdict(
  pfDelta: number,
  wrDelta: number,
  ddDelta: number,
): "robust" | "degraded" | "critical" {
  if (pfDelta < -50 || wrDelta < -20 || ddDelta > 15) return "critical";
  if (pfDelta < -25 || wrDelta < -10 || ddDelta > 8) return "degraded";
  return "robust";
}

export async function runMarketStressTests(config: {
  baseWinRate?: number;
  baseRR?: number;
  numTrades?: number;
  riskPerTrade?: number;
  seed?: number;
} = {}): Promise<MarketStressResult> {
  const t0 = Date.now();
  const baseWinRate = config.baseWinRate ?? 52;
  const baseRR = config.baseRR ?? 2.0;
  const numTrades = config.numTrades ?? 300;
  const riskPerTrade = config.riskPerTrade ?? 0.75;
  const seed = config.seed ?? 42;

  // Run baseline
  const { stats: baseline } = runSimulation({ baseWinRate, rrRatio: baseRR, numTrades, riskPerTrade, seed });

  const scenarios: MarketStressScenario[] = [];

  for (let i = 0; i < ALL_CONDITIONS.length; i++) {
    const condition = ALL_CONDITIONS[i]!;
    const profile = MARKET_CONDITION_PROFILES[condition];

    const { stats } = runSimulation({
      baseWinRate,
      rrRatio: baseRR,
      numTrades: Math.max(50, Math.round(numTrades * profile.signalFrequencyMultiplier)),
      riskPerTrade,
      winRateMultiplier: profile.winRateMultiplier,
      rrMultiplier: profile.rrMultiplier,
      spreadCostPips: profile.spreadMultiplier * 1.5,  // baseline spread 1.5 pips × multiplier
      seed: seed + i + 1,
    });

    const pfDelta = baseline.profitFactor > 0
      ? ((stats.profitFactor - baseline.profitFactor) / baseline.profitFactor) * 100
      : 0;
    const wrDelta = stats.winRate - baseline.winRate;
    const ddDelta = stats.maxDrawdown - baseline.maxDrawdown;
    const expDelta = stats.expectancy - baseline.expectancy;

    scenarios.push({
      condition,
      label: profile.label,
      description: profile.description,
      stats,
      baselineComparison: {
        winRateDelta: Math.round(wrDelta * 100) / 100,
        profitFactorDelta: Math.round(pfDelta * 100) / 100,
        drawdownDelta: Math.round(ddDelta * 100) / 100,
        expectancyDelta: Math.round(expDelta * 100) / 100,
      },
      verdict: getVerdict(pfDelta, wrDelta, ddDelta),
    });
  }

  // Score: 100 if all robust, subtract for degraded/critical
  const robustCount = scenarios.filter(s => s.verdict === "robust").length;
  const degradedCount = scenarios.filter(s => s.verdict === "degraded").length;
  const criticalCount = scenarios.filter(s => s.verdict === "critical").length;
  const overallRobustScore = Math.round(
    Math.max(0, (robustCount * 100 + degradedCount * 50) / scenarios.length),
  );

  const worstPfDelta = scenarios.reduce((worst, s) =>
    s.baselineComparison.profitFactorDelta < worst.baselineComparison.profitFactorDelta ? s : worst,
  );

  const findings: string[] = [];
  if (criticalCount > 0) {
    const critical = scenarios.filter(s => s.verdict === "critical").map(s => s.label);
    findings.push(`CRITICAL performance degradation in ${criticalCount} condition(s): ${critical.join(", ")}`);
  }
  if (degradedCount > 0) {
    const degraded = scenarios.filter(s => s.verdict === "degraded").map(s => s.label);
    findings.push(`Degraded performance in: ${degraded.join(", ")}`);
  }
  const flashCrash = scenarios.find(s => s.condition === "flash_crash");
  if (flashCrash && flashCrash.verdict !== "robust") {
    findings.push(`Flash crash scenario reduces PF by ${Math.abs(flashCrash.baselineComparison.profitFactorDelta).toFixed(1)}% — consider adding news-time trading halt`);
  }
  const strongTrend = scenarios.find(s => s.condition === "strong_trend");
  if (strongTrend && strongTrend.verdict === "robust") {
    findings.push("Strategy performs well in strong trend conditions — AMD structure aligns with trends");
  }
  if (robustCount === scenarios.length) {
    findings.push("Strategy remains profitable across all 6 market conditions tested");
  }

  return {
    baseline,
    scenarios,
    overallRobustScore,
    worstCondition: worstPfDelta.condition,
    findings,
    durationMs: Date.now() - t0,
  };
}
