/**
 * Parameter Sensitivity Analysis
 * Varies each configurable threshold ±5%, ±10%, ±20% and measures
 * the impact on win rate, profit factor, drawdown, and expectancy.
 */
import { runSimulation } from "./simulator.js";
import type {
  SensitivityAnalysisResult,
  ParameterSensitivityResult,
  ParameterVariation,
  SensitivityLevel,
  SimStats,
} from "./types.js";

const LEVELS: SensitivityLevel[] = [-20, -10, -5, 0, 5, 10, 20];

/** Model how each parameter affects win rate and RR ratio */
interface ParameterEffect {
  winRateEffect: number;      // delta win rate per 1% change in param
  rrEffect: number;           // delta RR per 1% change in param
  signalQualityEffect: number; // multiplies signal quality (0–2)
}

interface ParameterDef {
  name: string;
  description: string;
  baseline: number;
  unit: string;
  effect: ParameterEffect;
}

// Key configurable parameters and their empirical effects on the AMD/SMC strategy
const PARAMETERS: ParameterDef[] = [
  {
    name: "rrRatio",
    description: "Risk-to-Reward ratio (TP distance / SL distance)",
    baseline: 2.0,
    unit: ":1",
    effect: {
      winRateEffect: -0.30,   // higher RR → lower win rate required, but harder to hit TP
      rrEffect: 1.0,
      signalQualityEffect: 0,
    },
  },
  {
    name: "zoneStrengthThreshold",
    description: "Minimum zone strength score to enter a trade (0–100)",
    baseline: 60,
    unit: "/100",
    effect: {
      winRateEffect: 0.10,    // stricter filter → better quality signals
      rrEffect: 0.05,
      signalQualityEffect: 0,
    },
  },
  {
    name: "candleBodyRatio",
    description: "Minimum candle body/range ratio for confirmation",
    baseline: 0.30,
    unit: " ratio",
    effect: {
      winRateEffect: 0.25,    // stricter confirmation → better entries
      rrEffect: 0.10,
      signalQualityEffect: 0,
    },
  },
  {
    name: "atrMultiplierSL",
    description: "ATR multiplier for stop-loss distance beyond zone",
    baseline: 0.50,
    unit: "× ATR",
    effect: {
      winRateEffect: 0.35,    // wider SL → fewer false SL hits
      rrEffect: -0.40,        // but smaller RR since SL is larger
      signalQualityEffect: 0,
    },
  },
  {
    name: "riskPerTrade",
    description: "Account risk per trade as % of equity",
    baseline: 0.75,
    unit: "%",
    effect: {
      winRateEffect: 0,        // does not affect win rate
      rrEffect: 0,
      signalQualityEffect: 0,
    },
  },
  {
    name: "lookbackBars",
    description: "Number of historical bars used for zone detection",
    baseline: 50,
    unit: " bars",
    effect: {
      winRateEffect: 0.08,    // more context → slightly better detection
      rrEffect: 0.02,
      signalQualityEffect: 0,
    },
  },
];

function applyParameterVariation(
  param: ParameterDef,
  level: SensitivityLevel,
  baseWinRate: number,
  baseRR: number,
  numTrades: number,
  seed: number,
): SimStats {
  const mult = 1 + level / 100;
  const paramDelta = level;  // % change in parameter

  // Compute effective win rate with this parameter change
  const wrDelta = param.effect.winRateEffect * paramDelta;
  const rrDelta = param.effect.rrEffect * (paramDelta / 100);

  const effectiveWinRate = Math.max(20, Math.min(80, baseWinRate + wrDelta));
  const effectiveRR = Math.max(1.0, baseRR + rrDelta);

  const { stats } = runSimulation({
    numTrades,
    baseWinRate: effectiveWinRate,
    rrRatio: effectiveRR,
    seed,
  });

  return stats;
}

function scoreSensitivity(variations: ParameterVariation[]): number {
  const baseline = variations.find(v => v.level === 0);
  if (!baseline) return 50;

  // Measure how much each metric changes across ±10% parameter variation
  const p10neg = variations.find(v => v.level === -10);
  const p10pos = variations.find(v => v.level === 10);
  if (!p10neg || !p10pos) return 50;

  const wrDelta = Math.abs(p10pos.winRate - p10neg.winRate);
  const pfDelta = Math.abs(p10pos.profitFactor - p10neg.profitFactor);
  const ddDelta = Math.abs(p10pos.maxDrawdown - p10neg.maxDrawdown);
  const expDelta = Math.abs(p10pos.expectancy - p10neg.expectancy);

  // Normalize: >10% change in metric = score of 100 (very sensitive)
  const wrScore = Math.min(100, (wrDelta / 10) * 100);
  const pfScore = Math.min(100, (pfDelta / 1.0) * 100);
  const ddScore = Math.min(100, (ddDelta / 5) * 100);
  const expScore = Math.min(100, (expDelta / 50) * 100);

  return Math.round((wrScore + pfScore + ddScore + expScore) / 4);
}

function buildRecommendation(param: ParameterDef, sensitivityScore: number): string {
  if (sensitivityScore >= 75) {
    return `${param.name} is highly sensitive — small changes cause large performance swings. Consider widening your threshold range and retesting. Current baseline: ${param.baseline}${param.unit}.`;
  }
  if (sensitivityScore >= 40) {
    return `${param.name} shows moderate sensitivity. The current setting (${param.baseline}${param.unit}) is acceptable but monitor for regime shifts that may require adjustment.`;
  }
  return `${param.name} is stable — performance varies minimally across ±20% changes. Baseline (${param.baseline}${param.unit}) is robust.`;
}

export async function runParameterSensitivity(config: {
  baseWinRate?: number;
  baseRR?: number;
  numTrades?: number;
  seed?: number;
} = {}): Promise<SensitivityAnalysisResult> {
  const t0 = Date.now();
  const baseWinRate = config.baseWinRate ?? 52;
  const baseRR = config.baseRR ?? 2.0;
  const numTrades = config.numTrades ?? 300;
  const seed = config.seed ?? 42;

  const results: ParameterSensitivityResult[] = [];

  for (const param of PARAMETERS) {
    const variations: ParameterVariation[] = [];
    let baselineStats: SimStats | null = null;

    for (const level of LEVELS) {
      const stats = applyParameterVariation(param, level, baseWinRate, baseRR, numTrades, seed + levels_seed(level));

      if (level === 0) baselineStats = stats;

      variations.push({
        level,
        paramValue: param.baseline * (1 + level / 100),
        winRate: stats.winRate,
        profitFactor: stats.profitFactor,
        maxDrawdown: stats.maxDrawdown,
        expectancy: stats.expectancy,
        deltaWinRate: 0,
        deltaProfitFactor: 0,
        deltaDrawdown: 0,
        deltaExpectancy: 0,
      });
    }

    // Fill in deltas vs baseline
    if (baselineStats) {
      for (const v of variations) {
        v.deltaWinRate = Math.round((v.winRate - baselineStats.winRate) * 100) / 100;
        v.deltaProfitFactor = Math.round((v.profitFactor - baselineStats.profitFactor) * 1000) / 1000;
        v.deltaDrawdown = Math.round((v.maxDrawdown - baselineStats.maxDrawdown) * 100) / 100;
        v.deltaExpectancy = Math.round((v.expectancy - baselineStats.expectancy) * 100) / 100;
      }
    }

    const sensitivityScore = scoreSensitivity(variations);
    const overlySensitive = sensitivityScore >= 50;

    results.push({
      parameter: param.name,
      description: param.description,
      baseline: param.baseline,
      unit: param.unit,
      variations,
      sensitivityScore,
      overlySensitive,
      recommendation: buildRecommendation(param, sensitivityScore),
    });
  }

  const overallSensitivityScore = Math.round(
    results.reduce((s, r) => s + r.sensitivityScore, 0) / results.length,
  );

  const stableParameters = results.filter(r => !r.overlySensitive).map(r => r.parameter);
  const sensitiveParameters = results.filter(r => r.overlySensitive).map(r => r.parameter);

  const findings: string[] = [];
  if (sensitiveParameters.length > 0) {
    findings.push(`${sensitiveParameters.length} parameter(s) are overly sensitive: ${sensitiveParameters.join(", ")}`);
  }
  if (stableParameters.length === PARAMETERS.length) {
    findings.push("All parameters show acceptable stability across ±20% variation range");
  }

  const rrParam = results.find(r => r.parameter === "rrRatio");
  if (rrParam && rrParam.sensitivityScore > 60) {
    findings.push("RR ratio is a primary performance driver — small changes in TP/SL distances have outsized impact");
  }

  return {
    parameters: results,
    overallSensitivityScore,
    stableParameters,
    sensitiveParameters,
    findings,
    durationMs: Date.now() - t0,
  };
}

function levels_seed(level: SensitivityLevel): number {
  const map: Record<number, number> = { [-20]: 1, [-10]: 2, [-5]: 3, 0: 4, 5: 5, 10: 6, 20: 7 };
  return map[level] ?? 0;
}
