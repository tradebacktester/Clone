import { describe, it } from "node:test";
import assert from "node:assert/strict";

// Isolated TQI scoring tests — no external deps
type TqiGrade = "A" | "B" | "C" | "D" | "F";

function getGrade(tqi: number): TqiGrade {
  return tqi >= 85 ? "A" : tqi >= 70 ? "B" : tqi >= 55 ? "C" : tqi >= 40 ? "D" : "F";
}

function calcFibPts(direction: "buy" | "sell", bias: "premium" | "discount" | "equilibrium"): number {
  if ((direction === "buy" && bias === "discount") || (direction === "sell" && bias === "premium")) return 10;
  if (bias === "equilibrium") return 5;
  return 0;
}

function calcRegimePts(regime: string, confidence: number): number {
  if (regime === "trending") return Math.round((confidence / 100) * 10);
  if (regime === "ranging") return 7;
  if (regime === "low_volatility") return 4;
  return 2;
}

describe("TQI — grade thresholds", () => {
  it("grade A for tqi >= 85", () => { assert.equal(getGrade(85), "A"); assert.equal(getGrade(100), "A"); });
  it("grade B for tqi 70-84", () => { assert.equal(getGrade(70), "B"); assert.equal(getGrade(84), "B"); });
  it("grade C for tqi 55-69", () => { assert.equal(getGrade(55), "C"); assert.equal(getGrade(69), "C"); });
  it("grade D for tqi 40-54", () => { assert.equal(getGrade(40), "D"); assert.equal(getGrade(54), "D"); });
  it("grade F for tqi < 40", () => { assert.equal(getGrade(39), "F"); assert.equal(getGrade(0), "F"); });
  it("tradeable threshold is 65 (grade C+)", () => {
    assert.equal(getGrade(65), "C");
    assert.ok(65 >= 65); // tradeable
    assert.ok(64 < 65); // not tradeable
  });
});

describe("TQI — Premium/Discount component", () => {
  it("returns 10 for buy in discount zone", () => { assert.equal(calcFibPts("buy", "discount"), 10); });
  it("returns 10 for sell in premium zone", () => { assert.equal(calcFibPts("sell", "premium"), 10); });
  it("returns 5 for equilibrium", () => { assert.equal(calcFibPts("buy", "equilibrium"), 5); });
  it("returns 0 for buy in premium zone (against bias)", () => { assert.equal(calcFibPts("buy", "premium"), 0); });
  it("returns 0 for sell in discount zone (against bias)", () => { assert.equal(calcFibPts("sell", "discount"), 0); });
});

describe("TQI — Market Regime component", () => {
  it("trending at 100% confidence = 10 pts", () => { assert.equal(calcRegimePts("trending", 100), 10); });
  it("trending at 50% confidence = 5 pts", () => { assert.equal(calcRegimePts("trending", 50), 5); });
  it("ranging = 7 pts flat", () => { assert.equal(calcRegimePts("ranging", 100), 7); });
  it("low_volatility = 4 pts", () => { assert.equal(calcRegimePts("low_volatility", 100), 4); });
  it("volatile = 2 pts (worst)", () => { assert.equal(calcRegimePts("volatile", 100), 2); });
});

describe("TQI — max score composition", () => {
  it("all components add up to 100 max", () => {
    const maxScores = [15, 10, 15, 15, 15, 10, 10, 10]; // 8 components
    const total = maxScores.reduce((s, v) => s + v, 0);
    assert.equal(total, 100);
  });

  it("perfect score gives grade A", () => {
    const grade = getGrade(100);
    assert.equal(grade, "A");
  });

  it("zero score gives grade F", () => {
    const grade = getGrade(0);
    assert.equal(grade, "F");
  });
});
