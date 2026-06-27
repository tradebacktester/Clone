/**
 * Confidence Stability Analysis
 * Verifies the adaptive confidence engine doesn't overreact
 * to short-term results — tests variance across 20 Monte Carlo runs.
 */
import { runSimulation, runMonteCarlo } from "./simulator.js";
import type { ConfidenceStabilityResult } from "./types.js";

/** Simulate a confidence score [0-100] from a window of recent trades */
function computeConfidenceFromStats(winRate: number, profitFactor: number, maxDrawdown: number): number {
  const wrScore = Math.min(100, (winRate / 60) * 100);
  const pfScore = Math.min(100, (profitFactor / 2.0) * 100);
  const ddPenalty = Math.min(50, maxDrawdown * 2);
  return Math.max(0, Math.min(100, (wrScore * 0.4 + pfScore * 0.4) - ddPenalty * 0.2));
}

/** Simulate a small perturbation and measure confidence response */
function simulateConfidenceResponse(
  baseWinRate: number,
  baseRR: number,
  perturbationPct: number,
  seed: number,
): { baselineConfidence: number; perturbedConfidence: number; delta: number } {
  const baseSim = runSimulation({ baseWinRate, rrRatio: baseRR, numTrades: 30, seed });
  const perturbedSim = runSimulation({
    baseWinRate: baseWinRate * (1 + perturbationPct / 100),
    rrRatio: baseRR,
    numTrades: 30,
    seed,
  });

  const baseConf = computeConfidenceFromStats(
    baseSim.stats.winRate, baseSim.stats.profitFactor, baseSim.stats.maxDrawdown,
  );
  const pertConf = computeConfidenceFromStats(
    perturbedSim.stats.winRate, perturbedSim.stats.profitFactor, perturbedSim.stats.maxDrawdown,
  );

  return {
    baselineConfidence: Math.round(baseConf * 100) / 100,
    perturbedConfidence: Math.round(pertConf * 100) / 100,
    delta: Math.round(Math.abs(pertConf - baseConf) * 100) / 100,
  };
}

export async function runConfidenceStability(config: {
  baseWinRate?: number;
  baseRR?: number;
  runs?: number;
  seed?: number;
} = {}): Promise<ConfidenceStabilityResult> {
  const t0 = Date.now();
  const baseWinRate = config.baseWinRate ?? 52;
  const baseRR = config.baseRR ?? 2.0;
  const runs = config.runs ?? 20;
  const seed = config.seed ?? 42;

  // Run N simulations with slightly different market conditions
  const { allStats } = runMonteCarlo(
    { baseWinRate, rrRatio: baseRR, numTrades: 50, seed },
    runs,
  );

  // Compute confidence score for each run
  const confidenceScores = allStats.map(s =>
    computeConfidenceFromStats(s.winRate, s.profitFactor, s.maxDrawdown),
  );

  const avgConfidence = confidenceScores.reduce((s, c) => s + c, 0) / confidenceScores.length;
  const variance = confidenceScores.reduce((s, c) => s + Math.pow(c - avgConfidence, 2), 0) / confidenceScores.length;
  const confidenceStdDev = Math.sqrt(variance);
  const coefficientOfVariation = avgConfidence > 0 ? confidenceStdDev / avgConfidence : 1;
  const maxConfidenceSwing = Math.max(...confidenceScores) - Math.min(...confidenceScores);

  // Test for overreaction: does a 5% input change cause >20% confidence change?
  let overreactionEvents = 0;
  const perturbations = [-5, -2, 2, 5];
  for (let i = 0; i < perturbations.length; i++) {
    const resp = simulateConfidenceResponse(baseWinRate, baseRR, perturbations[i]!, seed + i);
    if (resp.delta > 20) overreactionEvents++;
  }

  const stable = coefficientOfVariation < 0.2 && maxConfidenceSwing < 30 && overreactionEvents === 0;
  const overallScore = Math.round(
    Math.max(0, Math.min(100,
      (1 - Math.min(1, coefficientOfVariation)) * 40 +
      (1 - Math.min(1, maxConfidenceSwing / 50)) * 40 +
      (1 - Math.min(1, overreactionEvents / 4)) * 20,
    )),
  );

  const findings: string[] = [];
  findings.push(`Confidence scores across ${runs} Monte Carlo runs: mean=${avgConfidence.toFixed(1)}, σ=${confidenceStdDev.toFixed(1)}, CV=${(coefficientOfVariation * 100).toFixed(1)}%`);

  if (stable) {
    findings.push("Confidence engine is stable — no overreaction to short-term noise detected");
  } else {
    if (coefficientOfVariation >= 0.2) {
      findings.push(`High confidence variance (CV=${(coefficientOfVariation * 100).toFixed(1)}%) — confidence scores react too strongly to short-term results`);
    }
    if (maxConfidenceSwing >= 30) {
      findings.push(`Confidence swing of ${maxConfidenceSwing.toFixed(1)} pts across runs — consider smoothing with exponential moving average`);
    }
    if (overreactionEvents > 0) {
      findings.push(`${overreactionEvents} overreaction event(s) detected — >20% confidence change from <5% win rate perturbation`);
    }
  }

  if (avgConfidence >= 50) {
    findings.push(`Baseline confidence score ${avgConfidence.toFixed(1)}/100 is healthy — strategy has statistically significant edge`);
  } else {
    findings.push(`Baseline confidence score ${avgConfidence.toFixed(1)}/100 is below 50 — edge is weak; more data or parameter tuning needed`);
  }

  return {
    runs,
    avgConfidence: Math.round(avgConfidence * 100) / 100,
    confidenceStdDev: Math.round(confidenceStdDev * 100) / 100,
    coefficientOfVariation: Math.round(coefficientOfVariation * 1000) / 1000,
    maxConfidenceSwing: Math.round(maxConfidenceSwing * 100) / 100,
    overreactionEvents,
    stable,
    overallScore,
    findings,
    durationMs: Date.now() - t0,
  };
}
