import { describe, it } from "node:test";
import assert from "node:assert/strict";

// Isolated dynamic sizing tests — no external deps
function calcConfFactor(confidence: number): number {
  const confNorm = Math.max(0, Math.min(1, (confidence - 65) / 35));
  return 0.70 + confNorm * 0.60;
}

function calcVolFactor(atrRatio: number): number {
  return atrRatio > 2.5 ? 0.45 : atrRatio > 2.0 ? 0.55 : atrRatio > 1.5 ? 0.70 : atrRatio > 1.2 ? 0.85 : 1.0;
}

function calcDdFactor(dd: number): number {
  return dd >= 15 ? 0.45 : dd >= 12 ? 0.55 : dd >= 8 ? 0.70 : dd >= 5 ? 0.85 : 1.0;
}

function calcRegimeFactor(regime: string): number {
  return regime === "trending" ? 1.10 : regime === "ranging" ? 1.00 : regime === "low_volatility" ? 0.80 : 0.55;
}

function calcPerfFactor(wr: number | null): number {
  if (wr == null) return 1.0;
  return Math.max(0.60, Math.min(1.30, 0.70 + ((Math.max(0, Math.min(100, wr)) - 30) / 70) * 0.50));
}

function calcLot(balance: number, riskPct: number, slPips: number): number {
  const riskAmount = balance * (riskPct / 100);
  const pipValue = 10;
  const rawLot = slPips > 0 ? riskAmount / (slPips * pipValue) : 0.01;
  return Math.max(0.01, Math.min(2.0, Math.round(rawLot * 100) / 100));
}

describe("Dynamic Sizing — confidence factor", () => {
  it("min confidence (65) = 0.70x", () => {
    assert.equal(Math.round(calcConfFactor(65) * 100), 70);
  });
  it("max confidence (100) = 1.30x", () => {
    assert.equal(Math.round(calcConfFactor(100) * 100), 130);
  });
  it("mid confidence (82) = ~1.00x", () => {
    const f = calcConfFactor(82);
    assert.ok(f >= 0.99 && f <= 1.01, `Expected ~1.0, got ${f}`);
  });
  it("below minimum (50) clamps to 0.70x", () => {
    assert.equal(Math.round(calcConfFactor(50) * 100), 70);
  });
});

describe("Dynamic Sizing — volatility factor", () => {
  it("normal ATR (ratio 1.0) = 1.0x", () => { assert.equal(calcVolFactor(1.0), 1.0); });
  it("high ATR (ratio 1.3) = 0.85x", () => { assert.equal(calcVolFactor(1.3), 0.85); });
  it("very high ATR (ratio 2.0) = 0.70x (boundary: > not >=)", () => { assert.equal(calcVolFactor(2.0), 0.70); });
  it("extreme ATR (ratio 3.0) = 0.45x", () => { assert.equal(calcVolFactor(3.0), 0.45); });
});

describe("Dynamic Sizing — drawdown factor", () => {
  it("no drawdown = 1.0x", () => { assert.equal(calcDdFactor(0), 1.0); });
  it("5% drawdown = 0.85x", () => { assert.equal(calcDdFactor(5), 0.85); });
  it("8% drawdown = 0.70x", () => { assert.equal(calcDdFactor(8), 0.70); });
  it("12% drawdown = 0.55x", () => { assert.equal(calcDdFactor(12), 0.55); });
  it("15%+ drawdown = 0.45x", () => { assert.equal(calcDdFactor(15), 0.45); assert.equal(calcDdFactor(20), 0.45); });
});

describe("Dynamic Sizing — regime factor", () => {
  it("trending = 1.10x (highest)", () => { assert.equal(calcRegimeFactor("trending"), 1.10); });
  it("ranging = 1.00x (neutral)", () => { assert.equal(calcRegimeFactor("ranging"), 1.00); });
  it("low_volatility = 0.80x (reduced)", () => { assert.equal(calcRegimeFactor("low_volatility"), 0.80); });
  it("volatile = 0.55x (lowest)", () => { assert.equal(calcRegimeFactor("volatile"), 0.55); });
});

describe("Dynamic Sizing — performance factor", () => {
  it("null (no history) = 1.0x", () => { assert.equal(calcPerfFactor(null), 1.0); });
  it("30% win rate = 0.70x (min)", () => { assert.equal(Math.round(calcPerfFactor(30) * 100), 70); });
  it("55% win rate ≈ 0.88x", () => {
    const f = calcPerfFactor(55);
    assert.ok(f >= 0.87 && f <= 0.89, `Expected ~0.88, got ${f}`);
  });
  it("100% win rate = 1.20x (formula max before clamp)", () => {
    const f = calcPerfFactor(100);
    assert.ok(f >= 1.19 && f <= 1.21, `Expected ~1.20, got ${f}`);
  });
  it("clamps to 0.60 minimum", () => { assert.ok(calcPerfFactor(0) >= 0.60); });
  it("clamps to 1.30 maximum", () => { assert.ok(calcPerfFactor(200) <= 1.30); });
});

describe("Dynamic Sizing — lot size calculation", () => {
  it("standard calculation: $10k, 1% risk, 20 pip SL → 0.5 lots", () => {
    const lot = calcLot(10000, 1, 20);
    assert.equal(lot, 0.50);
  });
  it("lot is clamped to minimum 0.01", () => {
    const lot = calcLot(100, 0.1, 100);
    assert.equal(lot, 0.01);
  });
  it("lot is clamped to maximum 2.0", () => {
    const lot = calcLot(1000000, 10, 1);
    assert.equal(lot, 2.0);
  });
  it("zero SL pips returns minimum lot", () => {
    const lot = calcLot(10000, 1, 0);
    assert.equal(lot, 0.01);
  });
});
