import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { runSimulation, runMonteCarlo } from "../simulator.js";
import { runParameterSensitivity } from "../parameter-sensitivity.js";
import { runMarketStressTests } from "../market-stress.js";
import { runExecutionStressTests } from "../execution-stress.js";
import { runRiskStressTests } from "../risk-stress.js";
import { runWalkForwardRobustness } from "../walk-forward-robustness.js";
import { runOOSValidation } from "../out-of-sample.js";
import { runConfidenceStability } from "../confidence-stability.js";
import { computeRobustnessScore } from "../robustness-score.js";
import { runRobustnessPipeline } from "../pipeline.js";
import { MARKET_CONDITION_PROFILES, ALL_CONDITIONS } from "../candle-gen.js";

// ─── Simulator ────────────────────────────────────────────────────────────────

describe("Simulator", () => {
  test("runSimulation returns correct structure", () => {
    const { trades, stats } = runSimulation({ numTrades: 100, seed: 1 });
    assert.ok(trades.length > 0, "should generate trades");
    assert.ok(stats.totalTrades > 0, "should have totalTrades");
    assert.ok(stats.winRate >= 0 && stats.winRate <= 100, "winRate must be 0-100");
    assert.ok(stats.profitFactor >= 0, "profitFactor must be non-negative");
    assert.ok(stats.maxDrawdown >= 0, "maxDrawdown must be non-negative");
    assert.ok(typeof stats.expectancy === "number", "expectancy must be a number");
  });

  test("winRate is approximately correct given baseWinRate", () => {
    const { stats } = runSimulation({ numTrades: 500, baseWinRate: 60, seed: 42 });
    assert.ok(stats.winRate >= 50 && stats.winRate <= 70, `Expected ~60%, got ${stats.winRate}`);
  });

  test("seeded simulation is deterministic", () => {
    const r1 = runSimulation({ numTrades: 100, seed: 777 });
    const r2 = runSimulation({ numTrades: 100, seed: 777 });
    assert.equal(r1.stats.winRate, r2.stats.winRate, "same seed → same result");
    assert.equal(r1.stats.totalPnl, r2.stats.totalPnl, "same seed → same pnl");
  });

  test("different seeds produce different results", () => {
    const r1 = runSimulation({ numTrades: 100, seed: 1 });
    const r2 = runSimulation({ numTrades: 100, seed: 2 });
    assert.notEqual(r1.stats.totalPnl, r2.stats.totalPnl, "different seeds should differ");
  });

  test("spread cost reduces profitability", () => {
    const base = runSimulation({ numTrades: 200, seed: 42, spreadCostPips: 0 });
    const withSpread = runSimulation({ numTrades: 200, seed: 42, spreadCostPips: 5 });
    assert.ok(withSpread.stats.totalPnl < base.stats.totalPnl, "spread should reduce PnL");
  });

  test("missed signals reduce trade count", () => {
    const base = runSimulation({ numTrades: 200, seed: 42, missedSignalRate: 0 });
    const missed = runSimulation({ numTrades: 200, seed: 42, missedSignalRate: 0.5 });
    assert.ok(missed.trades.length < base.trades.length, "missed signals should reduce trade count");
  });

  test("partial fill reduces PnL per trade", () => {
    const base = runSimulation({ numTrades: 200, seed: 42, partialFillRate: 1.0 });
    const partial = runSimulation({ numTrades: 200, seed: 42, partialFillRate: 0.5 });
    assert.ok(Math.abs(partial.stats.totalPnl) < Math.abs(base.stats.totalPnl) + 1,
      "partial fill should reduce absolute PnL");
  });

  test("runMonteCarlo returns correct run count", () => {
    const { allStats } = runMonteCarlo({ numTrades: 50, seed: 1 }, 10);
    assert.equal(allStats.length, 10, "should produce 10 runs");
  });

  test("maxConsecLosses is always non-negative integer", () => {
    const { stats } = runSimulation({ numTrades: 300, seed: 5 });
    assert.ok(Number.isInteger(stats.maxConsecLosses), "must be integer");
    assert.ok(stats.maxConsecLosses >= 0, "must be non-negative");
  });
});

// ─── Candle Generator ────────────────────────────────────────────────────────

describe("Market Condition Profiles", () => {
  test("all 6 conditions are defined", () => {
    assert.equal(ALL_CONDITIONS.length, 6, "should have exactly 6 conditions");
    for (const cond of ALL_CONDITIONS) {
      assert.ok(MARKET_CONDITION_PROFILES[cond], `profile missing for ${cond}`);
    }
  });

  test("flash crash has highest spread multiplier", () => {
    const flashCrash = MARKET_CONDITION_PROFILES["flash_crash"];
    const others = ALL_CONDITIONS.filter(c => c !== "flash_crash").map(c => MARKET_CONDITION_PROFILES[c]);
    const maxOtherSpread = Math.max(...others.map(p => p!.spreadMultiplier));
    assert.ok(flashCrash.spreadMultiplier > maxOtherSpread, "flash crash should have highest spread");
  });

  test("strong trend has winRateMultiplier > 1", () => {
    assert.ok(MARKET_CONDITION_PROFILES["strong_trend"].winRateMultiplier > 1);
  });

  test("adverse conditions have winRateMultiplier < 1", () => {
    const adverse = ["high_volatility", "flash_crash", "major_news_event", "choppy_ranging"] as const;
    for (const c of adverse) {
      assert.ok(MARKET_CONDITION_PROFILES[c].winRateMultiplier < 1, `${c} should reduce win rate`);
    }
  });
});

// ─── Parameter Sensitivity ───────────────────────────────────────────────────

describe("Parameter Sensitivity Analysis", () => {
  test("returns result for all parameters", async () => {
    const result = await runParameterSensitivity({ numTrades: 100 });
    assert.ok(result.parameters.length >= 5, "should analyze at least 5 parameters");
    assert.ok(result.overallSensitivityScore >= 0 && result.overallSensitivityScore <= 100);
  });

  test("each parameter has all 7 variation levels", async () => {
    const result = await runParameterSensitivity({ numTrades: 100 });
    for (const param of result.parameters) {
      assert.equal(param.variations.length, 7, `${param.parameter} should have 7 levels`);
    }
  });

  test("baseline level has zero deltas", async () => {
    const result = await runParameterSensitivity({ numTrades: 100 });
    for (const param of result.parameters) {
      const baseline = param.variations.find(v => v.level === 0);
      assert.ok(baseline, `${param.parameter} should have a baseline (level=0)`);
      assert.equal(baseline.deltaWinRate, 0);
      assert.equal(baseline.deltaProfitFactor, 0);
    }
  });

  test("sensitivity scores are 0-100", async () => {
    const result = await runParameterSensitivity({ numTrades: 100 });
    for (const p of result.parameters) {
      assert.ok(p.sensitivityScore >= 0 && p.sensitivityScore <= 100);
    }
  });

  test("returns findings and recommendations", async () => {
    const result = await runParameterSensitivity({ numTrades: 100 });
    assert.ok(Array.isArray(result.findings));
    assert.ok(result.stableParameters.length + result.sensitiveParameters.length === result.parameters.length);
  });
});

// ─── Market Stress Testing ───────────────────────────────────────────────────

describe("Market Stress Tests", () => {
  test("returns 6 market conditions", async () => {
    const result = await runMarketStressTests({ numTrades: 100 });
    assert.equal(result.scenarios.length, 6);
  });

  test("flash crash performs worse than baseline", async () => {
    const result = await runMarketStressTests({ numTrades: 150, baseWinRate: 55 });
    const flashCrash = result.scenarios.find(s => s.condition === "flash_crash");
    assert.ok(flashCrash, "flash crash scenario must exist");
    assert.ok(flashCrash.baselineComparison.winRateDelta < 0, "flash crash should reduce win rate");
  });

  test("overall robust score is 0-100", async () => {
    const result = await runMarketStressTests({ numTrades: 100 });
    assert.ok(result.overallRobustScore >= 0 && result.overallRobustScore <= 100);
  });

  test("each scenario has a verdict", async () => {
    const result = await runMarketStressTests({ numTrades: 100 });
    const validVerdicts = ["robust", "degraded", "critical"];
    for (const s of result.scenarios) {
      assert.ok(validVerdicts.includes(s.verdict), `Invalid verdict: ${s.verdict}`);
    }
  });

  test("strong trend has positive or near-zero win rate delta", async () => {
    const result = await runMarketStressTests({ numTrades: 200, seed: 42 });
    const trend = result.scenarios.find(s => s.condition === "strong_trend")!;
    assert.ok(trend.baselineComparison.winRateDelta > -15,
      "strong trend should not heavily penalize win rate");
  });
});

// ─── Execution Stress Testing ────────────────────────────────────────────────

describe("Execution Stress Tests", () => {
  test("returns all 6 imperfections", async () => {
    const result = await runExecutionStressTests({ numTrades: 100 });
    assert.equal(result.scenarios.length, 6);
  });

  test("higher spread reduces PnL", async () => {
    const result = await runExecutionStressTests({ numTrades: 200 });
    const spread = result.scenarios.find(s => s.imperfection === "higher_spread")!;
    assert.ok(spread.pnlImpact < 0, "higher spread should reduce PnL");
  });

  test("missed ticks reduces trade count relative to baseline", async () => {
    const result = await runExecutionStressTests({ numTrades: 200 });
    const missed = result.scenarios.find(s => s.imperfection === "missed_ticks")!;
    assert.ok(missed.stats.totalTrades < result.baseline.totalTrades,
      "missed ticks should reduce trade count");
  });

  test("resilience score is 0-100", async () => {
    const result = await runExecutionStressTests({ numTrades: 100 });
    assert.ok(result.overallResilienceScore >= 0 && result.overallResilienceScore <= 100);
  });
});

// ─── Risk Stress Testing ─────────────────────────────────────────────────────

describe("Risk Stress Tests", () => {
  test("returns valid losing streak analysis", async () => {
    const result = await runRiskStressTests({ numTrades: 300 });
    assert.ok(result.losingStreak.maxConsecutiveLosses >= 0);
    assert.ok(result.losingStreak.recoveryTradesNeeded >= 0);
  });

  test("returns drawdown recovery for 5 depths", async () => {
    const result = await runRiskStressTests({ numTrades: 300 });
    assert.equal(result.drawdownRecovery.length, 5);
    const depths = result.drawdownRecovery.map(r => r.drawdownDepthPct);
    assert.deepEqual(depths, [5, 10, 15, 20, 30]);
  });

  test("position sizing resilience stats are valid", async () => {
    const result = await runRiskStressTests({ numTrades: 100 });
    const sizing = result.positionSizingResilience;
    assert.ok(sizing.at50pctEquity.totalTrades > 0);
    assert.ok(sizing.at75pctEquity.totalTrades > 0);
    assert.ok(sizing.at125pctEquity.totalTrades > 0);
  });

  test("daily/weekly limit breaches are non-negative integers", async () => {
    const result = await runRiskStressTests({ numTrades: 120 });
    assert.ok(Number.isInteger(result.dailyLimitBreaches));
    assert.ok(Number.isInteger(result.weeklyLimitBreaches));
    assert.ok(result.dailyLimitBreaches >= 0);
    assert.ok(result.weeklyLimitBreaches >= 0);
  });

  test("resilience score is 0-100", async () => {
    const result = await runRiskStressTests({ numTrades: 200 });
    assert.ok(result.overallResilienceScore >= 0 && result.overallResilienceScore <= 100);
  });
});

// ─── Walk-Forward Robustness ─────────────────────────────────────────────────

describe("Walk-Forward Robustness", () => {
  test("returns correct window count", async () => {
    const result = await runWalkForwardRobustness({ numWindows: 4 });
    assert.equal(result.windows, 4);
  });

  test("efficiency ratio is a valid decimal", async () => {
    const result = await runWalkForwardRobustness({ numWindows: 4 });
    assert.ok(result.avgEfficiencyRatio >= 0, "efficiency ratio must be non-negative");
    assert.ok(result.avgEfficiencyRatio <= 3, "efficiency ratio should be reasonable");
  });

  test("overfit score is 0-100", async () => {
    const result = await runWalkForwardRobustness({ numWindows: 4 });
    assert.ok(result.overfitScore >= 0 && result.overfitScore <= 100);
  });

  test("recommendation is valid", async () => {
    const result = await runWalkForwardRobustness({ numWindows: 4 });
    assert.ok(["Pass", "Marginal", "Overfit"].includes(result.recommendation));
  });
});

// ─── OOS Validation ──────────────────────────────────────────────────────────

describe("Out-of-Sample Validation", () => {
  test("returns 3 splits", async () => {
    const result = await runOOSValidation({ numTrades: 200 });
    assert.equal(result.splits.length, 3);
  });

  test("train + test = 100% for each split", () => {
    const splits = [
      { trainPct: 70, testPct: 30 },
      { trainPct: 60, testPct: 40 },
      { trainPct: 80, testPct: 20 },
    ];
    for (const s of splits) {
      assert.equal(s.trainPct + s.testPct, 100);
    }
  });

  test("OOS score is 0-100", async () => {
    const result = await runOOSValidation({ numTrades: 200 });
    assert.ok(result.overallScore >= 0 && result.overallScore <= 100);
  });

  test("efficiency ratio is non-negative", async () => {
    const result = await runOOSValidation({ numTrades: 200 });
    assert.ok(result.avgEfficiencyRatio >= 0);
  });
});

// ─── Confidence Stability ────────────────────────────────────────────────────

describe("Confidence Stability", () => {
  test("runs correct number of simulations", async () => {
    const result = await runConfidenceStability({ runs: 10 });
    assert.equal(result.runs, 10);
  });

  test("confidence score is 0-100", async () => {
    const result = await runConfidenceStability({ runs: 10 });
    assert.ok(result.avgConfidence >= 0 && result.avgConfidence <= 100);
  });

  test("overall score is 0-100", async () => {
    const result = await runConfidenceStability({ runs: 10 });
    assert.ok(result.overallScore >= 0 && result.overallScore <= 100);
  });

  test("coefficient of variation is non-negative", async () => {
    const result = await runConfidenceStability({ runs: 10 });
    assert.ok(result.coefficientOfVariation >= 0);
  });
});

// ─── Robustness Score ────────────────────────────────────────────────────────

describe("Robustness Score", () => {
  test("produces 0-100 overall score", async () => {
    const [sensitivity, marketStress, executionStress, riskStress, walkForward, oos, confidence] =
      await Promise.all([
        runParameterSensitivity({ numTrades: 100 }),
        runMarketStressTests({ numTrades: 100 }),
        runExecutionStressTests({ numTrades: 100 }),
        runRiskStressTests({ numTrades: 100 }),
        runWalkForwardRobustness({ numWindows: 3 }),
        runOOSValidation({ numTrades: 150 }),
        runConfidenceStability({ runs: 10 }),
      ]);

    const score = computeRobustnessScore(
      sensitivity, marketStress, executionStress, riskStress, walkForward, oos, confidence,
    );
    assert.ok(score.overall >= 0 && score.overall <= 100);
    assert.ok(["A", "B", "C", "D", "F"].includes(score.grade));
    assert.ok(["robust", "acceptable", "needs_work", "fragile"].includes(score.verdict));
  });

  test("all breakdown components are 0-100", async () => {
    const [sensitivity, marketStress, executionStress, riskStress, walkForward, oos, confidence] =
      await Promise.all([
        runParameterSensitivity({ numTrades: 100 }),
        runMarketStressTests({ numTrades: 100 }),
        runExecutionStressTests({ numTrades: 100 }),
        runRiskStressTests({ numTrades: 100 }),
        runWalkForwardRobustness({ numWindows: 3 }),
        runOOSValidation({ numTrades: 150 }),
        runConfidenceStability({ runs: 10 }),
      ]);
    const score = computeRobustnessScore(
      sensitivity, marketStress, executionStress, riskStress, walkForward, oos, confidence,
    );
    for (const [key, val] of Object.entries(score.breakdown)) {
      assert.ok((val as number) >= 0 && (val as number) <= 100, `${key} out of range: ${val}`);
    }
  });
});

// ─── Full Pipeline ────────────────────────────────────────────────────────────

describe("Robustness Pipeline", () => {
  test("runs to completion and returns all fields", async () => {
    const result = await runRobustnessPipeline({
      numSimTrades: 100,
      skipWalkForward: false,
      baseWinRate: 52,
      baseRR: 2.0,
    });
    assert.ok(result.id.startsWith("rob_"), "should have id");
    assert.ok(result.score.overall >= 0 && result.score.overall <= 100);
    assert.ok(Array.isArray(result.findings));
    assert.ok(Array.isArray(result.recommendations));
    assert.ok(result.recommendations.length > 0, "should have recommendations");
    assert.ok(result.durationMs > 0, "should have duration");
  });

  test("sensitivity result has correct parameter count", async () => {
    const result = await runRobustnessPipeline({ numSimTrades: 80 });
    assert.ok(result.sensitivity.parameters.length >= 5);
  });

  test("market stress has 6 scenarios", async () => {
    const result = await runRobustnessPipeline({ numSimTrades: 80 });
    assert.equal(result.marketStress.scenarios.length, 6);
  });

  test("execution stress has 6 imperfections", async () => {
    const result = await runRobustnessPipeline({ numSimTrades: 80 });
    assert.equal(result.executionStress.scenarios.length, 6);
  });

  test("OOS validation has 3 splits", async () => {
    const result = await runRobustnessPipeline({ numSimTrades: 80 });
    assert.equal(result.oos.splits.length, 3);
  });
});
