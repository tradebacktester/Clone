import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runMonteCarlo, type MonteCarloParams } from "../montecarlo.js";

const BASE: MonteCarloParams = {
  numSimulations: 2_000,
  numTrades: 100,
  winRate: 0.55,
  avgWin: 150,
  avgLoss: 80,
  startingCapital: 10_000,
  ruinThreshold: 0.5,
  tradesPerMonth: 20,
};

describe("runMonteCarlo", () => {
  it("returns correct shape", () => {
    const r = runMonteCarlo(BASE);
    assert.equal(r.numSimulations, 2_000);
    assert.equal(r.numTrades, 100);
    assert.equal(r.startingCapital, 10_000);
    assert.equal(r.winRate, 0.55);
    assert.equal(typeof r.probabilityOfRuin, "number");
    assert.equal(typeof r.expectedDrawdown, "number");
    assert.equal(typeof r.worstDrawdown, "number");
    assert.equal(typeof r.expectedMonthlyReturn, "number");
    assert.equal(typeof r.worstLosingStreak, "number");
    assert.equal(typeof r.bestCaseReturn, "number");
    assert.equal(typeof r.worstCaseReturn, "number");
    assert.equal(r.histogram.length, 20);
    assert.equal(r.equityCurves.labels.length, 21);
    assert.equal(r.equityCurves.best.length, 21);
    assert.equal(r.equityCurves.worst.length, 21);
    assert.equal(r.equityCurves.median.length, 21);
    assert.equal(r.equityCurves.p10.length, 21);
    assert.equal(r.equityCurves.p90.length, 21);
  });

  it("probability of ruin is 0–100", () => {
    const r = runMonteCarlo(BASE);
    assert.ok(r.probabilityOfRuin >= 0, "ruin >= 0");
    assert.ok(r.probabilityOfRuin <= 100, "ruin <= 100");
  });

  it("drawdown stats in valid range", () => {
    const r = runMonteCarlo(BASE);
    assert.ok(r.expectedDrawdown >= 0);
    assert.ok(r.expectedDrawdown <= 100);
    assert.ok(r.worstDrawdown >= r.expectedDrawdown - 0.01, "worst >= expected");
    assert.ok(r.drawdownPercentile90 >= r.medianDrawdown - 0.01, "p90 >= median");
  });

  it("percentile ordering holds", () => {
    const r = runMonteCarlo(BASE);
    assert.ok(r.worstCaseReturn <= r.percentile10 + 1, "5th <= 10th");
    assert.ok(r.percentile10 <= r.percentile25 + 1, "10th <= 25th");
    assert.ok(r.percentile25 <= r.medianReturn + 1, "25th <= median");
    assert.ok(r.medianReturn <= r.percentile75 + 1, "median <= 75th");
    assert.ok(r.percentile75 <= r.percentile90 + 1, "75th <= 90th");
    assert.ok(r.percentile90 <= r.bestCaseReturn + 1, "90th <= 95th");
  });

  it("equity curves start at startingCapital and are non-negative", () => {
    const r = runMonteCarlo(BASE);
    for (const key of ["best", "p90", "median", "p10", "worst"] as const) {
      const curve = r.equityCurves[key];
      assert.ok(curve[0]! >= 0, `${key}[0] >= 0`);
      for (const v of curve) assert.ok(v >= 0, `${key} curve value ${v} >= 0`);
    }
    assert.equal(r.equityCurves.labels[0], 0, "first label is trade 0");
    assert.equal(r.equityCurves.labels[20], 100, "last label is trade 100");
  });

  it("histogram frequency sums to ~100%", () => {
    const r = runMonteCarlo(BASE);
    const total = r.histogram.reduce((s, b) => s + b.frequency, 0);
    assert.ok(Math.abs(total - 100) < 2, `frequency sum ${total} ≈ 100`);
  });

  it("histogram counts sum to numSimulations", () => {
    const r = runMonteCarlo(BASE);
    const total = r.histogram.reduce((s, b) => s + b.count, 0);
    assert.equal(total, r.numSimulations);
  });

  it("monthly return derived from numTrades / tradesPerMonth", () => {
    const r = runMonteCarlo(BASE);
    const months = BASE.numTrades! / BASE.tradesPerMonth!;
    // Expected return per month = (expectedReturn - capital) / months
    const derivedMonthly = (r.expectedReturn - r.startingCapital) / months;
    assert.ok(
      Math.abs(derivedMonthly - r.expectedMonthlyReturn) < 50,
      `monthly ~= derived: ${r.expectedMonthlyReturn} vs ${derivedMonthly}`,
    );
  });

  it("worst losing streak is an integer >= 0", () => {
    const r = runMonteCarlo(BASE);
    assert.ok(Number.isInteger(r.worstLosingStreak));
    assert.ok(r.worstLosingStreak >= 0);
  });

  it("positive expectancy strategy has low ruin probability", () => {
    const r = runMonteCarlo({ ...BASE, numSimulations: 5_000, winRate: 0.6, avgWin: 200, avgLoss: 100 });
    assert.ok(r.probabilityOfRuin < 5, `Expected low ruin, got ${r.probabilityOfRuin}%`);
    assert.ok(r.expectedReturn > BASE.startingCapital!, "positive expectancy -> expected profit");
  });

  it("losing strategy has high ruin probability", () => {
    const r = runMonteCarlo({ ...BASE, numSimulations: 5_000, winRate: 0.3, avgWin: 50, avgLoss: 200 });
    assert.ok(r.probabilityOfRuin > 50, `Expected high ruin, got ${r.probabilityOfRuin}%`);
  });

  it("ruin threshold is respected", () => {
    // With very low threshold (e.g. 10%), ruin is more likely than 50% threshold
    const r50 = runMonteCarlo({ ...BASE, numSimulations: 3_000, ruinThreshold: 0.5 });
    const r10 = runMonteCarlo({ ...BASE, numSimulations: 3_000, ruinThreshold: 0.1 });
    assert.ok(r10.probabilityOfRuin >= r50.probabilityOfRuin, "lower threshold → more ruin");
  });

  it("bestCaseReturnPct and worstCaseReturnPct match equity values", () => {
    const r = runMonteCarlo(BASE);
    const bestPct  = Math.round(((r.bestCaseReturn  - r.startingCapital) / r.startingCapital) * 10000) / 100;
    const worstPct = Math.round(((r.worstCaseReturn - r.startingCapital) / r.startingCapital) * 10000) / 100;
    assert.ok(Math.abs(bestPct  - r.bestCaseReturnPct)  < 1, `bestPct ${bestPct} ~ ${r.bestCaseReturnPct}`);
    assert.ok(Math.abs(worstPct - r.worstCaseReturnPct) < 1, `worstPct ${worstPct} ~ ${r.worstCaseReturnPct}`);
  });

  it("all values are finite numbers (no NaN / Infinity)", () => {
    const r = runMonteCarlo(BASE);
    const numericKeys = [
      "probabilityOfRuin", "worstDrawdown", "expectedDrawdown", "medianDrawdown",
      "drawdownPercentile90", "expectedMonthlyReturn", "medianMonthlyReturn",
      "worstLosingStreak", "expectedLosingStreak", "medianLosingStreak",
      "worstCaseReturn", "percentile10", "percentile25", "medianReturn",
      "percentile75", "percentile90", "bestCaseReturn", "expectedReturn",
      "worstCaseReturnPct", "expectedReturnPct", "bestCaseReturnPct",
    ] as const;
    for (const key of numericKeys) {
      assert.ok(Number.isFinite(r[key]), `${key} should be finite, got ${r[key]}`);
    }
  });
});
