/**
 * Execution Stress Testing
 * Applies execution imperfections to baseline trade sets
 * and measures impact on profitability.
 */
import { runSimulation } from "./simulator.js";
import type {
  ExecutionStressResult,
  ExecutionStressScenario,
  ExecutionImperfection,
  SimStats,
} from "./types.js";

interface ExecutionScenarioDef {
  imperfection: ExecutionImperfection;
  label: string;
  description: string;
  params: Record<string, number>;
  simOverride: {
    spreadCostPips?: number;
    rrMultiplier?: number;
    winRateMultiplier?: number;
    missedSignalRate?: number;
    partialFillRate?: number;
  };
}

const EXECUTION_SCENARIOS: ExecutionScenarioDef[] = [
  {
    imperfection: "higher_spread",
    label: "Higher Spreads",
    description: "Spread widens to 3× normal (e.g. during London open / news)",
    params: { spreadMultiplier: 3.0, baseSpreadPips: 1.5 },
    simOverride: { spreadCostPips: 4.5 },
  },
  {
    imperfection: "slippage",
    label: "Slippage",
    description: "2–5 pip slippage on fills during fast markets",
    params: { avgSlippagePips: 3.5 },
    simOverride: { spreadCostPips: 3.5, rrMultiplier: 0.92 },
  },
  {
    imperfection: "delayed_execution",
    label: "Delayed Execution",
    description: "Orders execute 1–2 bars late — entry at inferior price",
    params: { avgDelayBars: 1.5, priceSlippagePct: 30 },
    simOverride: { rrMultiplier: 0.85, winRateMultiplier: 0.94 },
  },
  {
    imperfection: "partial_fills",
    label: "Partial Fills",
    description: "Orders fill at 60–80% of intended size due to liquidity",
    params: { avgFillPct: 70 },
    simOverride: { partialFillRate: 0.70 },
  },
  {
    imperfection: "missed_ticks",
    label: "Missed Ticks / Signals",
    description: "15% of signals are missed due to connectivity issues",
    params: { missRate: 0.15 },
    simOverride: { missedSignalRate: 0.15 },
  },
  {
    imperfection: "data_interruption",
    label: "Data Feed Interruption",
    description: "Periodic 5–30 min data gaps — bot misses entries and exits",
    params: { interruptionFrequency: 0.08, avgGapMinutes: 12 },
    simOverride: { missedSignalRate: 0.08, winRateMultiplier: 0.96 },
  },
];

function getVerdict(pnlImpact: number, wrImpact: number): "acceptable" | "degraded" | "critical" {
  if (Math.abs(pnlImpact) > 40 || wrImpact < -15) return "critical";
  if (Math.abs(pnlImpact) > 20 || wrImpact < -8) return "degraded";
  return "acceptable";
}

export async function runExecutionStressTests(config: {
  baseWinRate?: number;
  baseRR?: number;
  numTrades?: number;
  riskPerTrade?: number;
  seed?: number;
} = {}): Promise<ExecutionStressResult> {
  const t0 = Date.now();
  const baseWinRate = config.baseWinRate ?? 52;
  const baseRR = config.baseRR ?? 2.0;
  const numTrades = config.numTrades ?? 300;
  const riskPerTrade = config.riskPerTrade ?? 0.75;
  const seed = config.seed ?? 42;

  const { stats: baseline } = runSimulation({ baseWinRate, rrRatio: baseRR, numTrades, riskPerTrade, seed });

  const scenarios: ExecutionStressScenario[] = [];
  let cumulativePnlImpact = 0;

  for (let i = 0; i < EXECUTION_SCENARIOS.length; i++) {
    const def = EXECUTION_SCENARIOS[i]!;

    const { stats } = runSimulation({
      baseWinRate: baseWinRate * (def.simOverride.winRateMultiplier ?? 1.0),
      rrRatio: baseRR * (def.simOverride.rrMultiplier ?? 1.0),
      numTrades,
      riskPerTrade,
      spreadCostPips: def.simOverride.spreadCostPips ?? 0,
      missedSignalRate: def.simOverride.missedSignalRate ?? 0,
      partialFillRate: def.simOverride.partialFillRate ?? 1.0,
      seed: seed + i + 1,
    });

    const pnlImpact = baseline.totalPnl !== 0
      ? ((stats.totalPnl - baseline.totalPnl) / Math.abs(baseline.totalPnl)) * 100
      : 0;
    const wrImpact = stats.winRate - baseline.winRate;

    cumulativePnlImpact += Math.min(0, pnlImpact);

    scenarios.push({
      imperfection: def.imperfection,
      label: def.label,
      description: def.description,
      params: def.params,
      stats,
      pnlImpact: Math.round(pnlImpact * 100) / 100,
      winRateImpact: Math.round(wrImpact * 100) / 100,
      verdict: getVerdict(pnlImpact, wrImpact),
    });
  }

  const acceptableCount = scenarios.filter(s => s.verdict === "acceptable").length;
  const criticalCount = scenarios.filter(s => s.verdict === "critical").length;
  const overallResilienceScore = Math.round(
    Math.max(0, (acceptableCount * 100 + scenarios.filter(s => s.verdict === "degraded").length * 50) / scenarios.length),
  );

  const worstPnlImpact = scenarios.reduce((w, s) => s.pnlImpact < w.pnlImpact ? s : w);

  const findings: string[] = [];
  if (criticalCount > 0) {
    const critical = scenarios.filter(s => s.verdict === "critical").map(s => s.label);
    findings.push(`Critical execution vulnerabilities: ${critical.join(", ")}`);
  }

  const spreadScenario = scenarios.find(s => s.imperfection === "higher_spread");
  if (spreadScenario && Math.abs(spreadScenario.pnlImpact) > 20) {
    findings.push(`Higher spreads reduce PnL by ${Math.abs(spreadScenario.pnlImpact).toFixed(1)}% — strategy is spread-sensitive; tighten the spread filter threshold`);
  }

  const slippageScenario = scenarios.find(s => s.imperfection === "slippage");
  if (slippageScenario && slippageScenario.verdict === "acceptable") {
    findings.push("Strategy handles moderate slippage acceptably — existing slippage protection is effective");
  }

  if (Math.abs(cumulativePnlImpact) > 100) {
    findings.push(`Cumulative execution cost under worst-case combined imperfections: ~${Math.abs(Math.round(cumulativePnlImpact))}% PnL impact`);
  }

  if (acceptableCount === scenarios.length) {
    findings.push("All execution imperfections result in acceptable performance degradation");
  }

  return {
    baseline,
    scenarios,
    overallResilienceScore,
    worstImperfection: worstPnlImpact.imperfection,
    totalWorstCasePnlImpact: Math.round(cumulativePnlImpact * 100) / 100,
    findings,
    durationMs: Date.now() - t0,
  };
}
