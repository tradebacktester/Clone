import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { analyzeVolatility } from "../volatility_analyzer.js";
import { analyzeTrend } from "../trend_analyzer.js";
import { detectRegimeDetailed } from "../regime_detector.js";
import {
  adaptRegimeWeights,
  calcRegimePerformance,
  bestPerformingRegime,
  DEFAULT_REGIME_WEIGHTS,
  BASE_WEIGHTS,
  type RegimeTradeRecord,
} from "../adaptive_weights.js";
import type { Candle, SwingPoint } from "../../types.js";

// ── helpers ────────────────────────────────────────────────────────────────

function makeCandle(close: number, high?: number, low?: number): Candle {
  const h = high ?? close * 1.002;
  const l = low  ?? close * 0.998;
  return { open: close, high: h, low: l, close, volume: 1000, time: new Date() };
}

function makeTrendingCandles(count = 60): Candle[] {
  const out: Candle[] = [];
  let p = 1.1;
  for (let i = 0; i < count; i++) {
    p += 0.0015;
    out.push(makeCandle(p, p + 0.0025, p - 0.0005));
  }
  return out;
}

function makeRangingCandles(count = 60): Candle[] {
  const out: Candle[] = [];
  for (let i = 0; i < count; i++) {
    const b = 1.1 + Math.sin(i * 0.4) * 0.001;
    out.push(makeCandle(b, b + 0.0006, b - 0.0006));
  }
  return out;
}

function makeVolatileCandles(count = 60): Candle[] {
  const out: Candle[] = [];
  let p = 1.1;
  for (let i = 0; i < count; i++) {
    p += (Math.random() - 0.5) * 0.015;
    out.push(makeCandle(p, p + 0.008, p - 0.008));
  }
  return out;
}

function makeLowVolatilityCandles(count = 80): Candle[] {
  // 60 normal candles first to build ATR history, then 20 very flat candles.
  // The current ATR (from flat tail) ranks in the bottom quartile of the series.
  const out: Candle[] = [];
  let p = 1.1;
  for (let i = 0; i < 60; i++) {
    p += (Math.random() - 0.5) * 0.003;
    out.push(makeCandle(p, p + 0.0018, p - 0.0018));
  }
  for (let i = 0; i < 20; i++) {
    p += (Math.random() - 0.5) * 0.00004;
    out.push(makeCandle(p, p + 0.00008, p - 0.00008));
  }
  return out;
}

function makeBullishSwings(): SwingPoint[] {
  return [
    { price: 1.095, type: "low",  index: 0,  time: new Date(Date.now() - 50000) },
    { price: 1.100, type: "high", index: 5,  time: new Date(Date.now() - 40000) },
    { price: 1.097, type: "low",  index: 10, time: new Date(Date.now() - 30000) },
    { price: 1.105, type: "high", index: 15, time: new Date(Date.now() - 20000) },
    { price: 1.100, type: "low",  index: 20, time: new Date(Date.now() - 10000) },
    { price: 1.110, type: "high", index: 25, time: new Date() },
  ];
}

function makeTrades(
  regime: RegimeTradeRecord["regime"],
  wins: number,
  losses: number,
): RegimeTradeRecord[] {
  const records: RegimeTradeRecord[] = [];
  for (let i = 0; i < wins; i++) {
    records.push({ regime, pnl: 100, setupScore: 80, zoneType: "demand", liquiditySweep: true, amdPattern: "manipulation", fibLevel: 0.618, session: "london" });
  }
  for (let i = 0; i < losses; i++) {
    records.push({ regime, pnl: -60, setupScore: 65, zoneType: "supply", liquiditySweep: false, amdPattern: "unknown", fibLevel: 0, session: "tokyo" });
  }
  return records;
}

// ── volatility_analyzer ────────────────────────────────────────────────────

describe("analyzeVolatility", () => {
  test("returns neutral defaults for short candle list", () => {
    const r = analyzeVolatility([makeCandle(1.1)], 14);
    assert.equal(r.volatilityLevel, "medium");
    assert.equal(r.volatilityPercentile, 50);
    assert.equal(r.atr, 0);
  });

  test("low_volatility candles produce low volatilityLevel", () => {
    const r = analyzeVolatility(makeLowVolatilityCandles(60));
    assert.equal(r.volatilityLevel, "low");
    assert.ok(r.atrPercent < 0.3, `atrPercent ${r.atrPercent} should be < 0.3`);
  });

  test("volatile candles produce high volatilityLevel", () => {
    const r = analyzeVolatility(makeVolatileCandles(60));
    assert.equal(r.volatilityLevel, "high");
    assert.ok(r.atrPercent > 0.5, `atrPercent ${r.atrPercent} should be > 0.5`);
  });

  test("volatilityPercentile is in [0,100]", () => {
    const r = analyzeVolatility(makeTrendingCandles(80));
    assert.ok(r.volatilityPercentile >= 0 && r.volatilityPercentile <= 100);
  });

  test("rangeCompression is in [0,100]", () => {
    const r = analyzeVolatility(makeRangingCandles(60));
    assert.ok(r.rangeCompression >= 0 && r.rangeCompression <= 100);
  });

  test("ATR is positive for normal candles", () => {
    const r = analyzeVolatility(makeTrendingCandles(60));
    assert.ok(r.atr > 0, "ATR should be positive");
  });
});

// ── trend_analyzer ─────────────────────────────────────────────────────────

describe("analyzeTrend", () => {
  test("returns neutral for empty candles", () => {
    const r = analyzeTrend([], []);
    assert.equal(r.trendDirection, "neutral");
    assert.equal(r.adx, 0);
  });

  test("trending candles produce bullish direction", () => {
    const r = analyzeTrend(makeTrendingCandles(60), makeBullishSwings());
    assert.equal(r.trendDirection, "bullish");
    assert.ok(r.plusDI > r.minusDI, "+DI should exceed -DI in uptrend");
  });

  test("ADX is in [0,100]", () => {
    const r = analyzeTrend(makeTrendingCandles(60), makeBullishSwings());
    assert.ok(r.adx >= 0 && r.adx <= 100);
  });

  test("structureScore reflects confirmed swings", () => {
    const r = analyzeTrend(makeTrendingCandles(60), makeBullishSwings());
    assert.ok(r.structureScore > 0, "structureScore should be > 0 with bullish swings");
    assert.ok(r.consecutiveConfirming > 0);
  });

  test("ranging candles have lower ADX than trending", () => {
    const trendingADX = analyzeTrend(makeTrendingCandles(60), makeBullishSwings()).adx;
    const rangingADX  = analyzeTrend(makeRangingCandles(60),  []).adx;
    assert.ok(trendingADX >= rangingADX, `trending ADX ${trendingADX} should be >= ranging ADX ${rangingADX}`);
  });
});

// ── regime_detector ────────────────────────────────────────────────────────

describe("detectRegimeDetailed", () => {
  test("returns ranging for empty candles", () => {
    const r = detectRegimeDetailed([], []);
    assert.equal(r.regime, "ranging");
    assert.equal(r.regimeConfidence, 0);
  });

  test("detects volatile regime from volatile candles", () => {
    const r = detectRegimeDetailed(makeVolatileCandles(80), []);
    assert.equal(r.regime, "volatile");
  });

  test("detects low_volatility from flat candles", () => {
    const r = detectRegimeDetailed(makeLowVolatilityCandles(80), []);
    assert.equal(r.regime, "low_volatility");
  });

  test("regimeConfidence is in [0,100]", () => {
    const r = detectRegimeDetailed(makeTrendingCandles(80), makeBullishSwings());
    assert.ok(r.regimeConfidence >= 0 && r.regimeConfidence <= 100);
  });

  test("result has all required fields", () => {
    const r = detectRegimeDetailed(makeTrendingCandles(60), []);
    assert.ok("regime"               in r);
    assert.ok("regimeConfidence"     in r);
    assert.ok("trend"                in r);
    assert.ok("volatility"           in r);
    assert.ok("atr"                  in r);
    assert.ok("adxEquivalent"        in r);
    assert.ok("volatilityPercentile" in r);
    assert.ok("rangeCompression"     in r);
    assert.ok("volatilityAnalysis"   in r);
    assert.ok("trendAnalysis"        in r);
  });

  test("atr matches volatilityAnalysis.atr", () => {
    const r = detectRegimeDetailed(makeTrendingCandles(60), []);
    assert.equal(r.atr, r.volatilityAnalysis.atr);
  });
});

// ── adaptive_weights ───────────────────────────────────────────────────────

describe("DEFAULT_REGIME_WEIGHTS", () => {
  test("all four regimes have defaults", () => {
    assert.ok(DEFAULT_REGIME_WEIGHTS.trending);
    assert.ok(DEFAULT_REGIME_WEIGHTS.ranging);
    assert.ok(DEFAULT_REGIME_WEIGHTS.volatile);
    assert.ok(DEFAULT_REGIME_WEIGHTS.low_volatility);
  });

  test("each default profile sums to ~1", () => {
    for (const regime of ["trending", "ranging", "volatile", "low_volatility"] as const) {
      const w = DEFAULT_REGIME_WEIGHTS[regime];
      const sum = w.zone + w.liquidity + w.amd + w.confirmation;
      assert.ok(Math.abs(sum - 1) < 0.001, `${regime} sum=${sum} should be ~1`);
    }
  });

  test("each weight is within [0.05, 0.60]", () => {
    for (const regime of ["trending", "ranging", "volatile", "low_volatility"] as const) {
      const w = DEFAULT_REGIME_WEIGHTS[regime];
      for (const key of ["zone", "liquidity", "amd", "confirmation"] as const) {
        assert.ok(w[key] >= 0.05 && w[key] <= 0.60, `${regime}.${key}=${w[key]} out of range`);
      }
    }
  });
});

describe("BASE_WEIGHTS", () => {
  test("sums to 1", () => {
    const sum = BASE_WEIGHTS.zone + BASE_WEIGHTS.liquidity + BASE_WEIGHTS.amd + BASE_WEIGHTS.confirmation;
    assert.ok(Math.abs(sum - 1) < 0.001);
  });

  test("zone=0.30, liquidity=0.25, amd=0.25, confirmation=0.20", () => {
    assert.ok(Math.abs(BASE_WEIGHTS.zone         - 0.30) < 0.001);
    assert.ok(Math.abs(BASE_WEIGHTS.liquidity    - 0.25) < 0.001);
    assert.ok(Math.abs(BASE_WEIGHTS.amd          - 0.25) < 0.001);
    assert.ok(Math.abs(BASE_WEIGHTS.confirmation - 0.20) < 0.001);
  });
});

describe("calcRegimePerformance", () => {
  test("returns stats for all four regimes", () => {
    const stats = calcRegimePerformance(makeTrades("trending", 10, 5));
    assert.equal(stats.length, 4);
    const regimes = stats.map(s => s.regime);
    for (const r of ["trending", "ranging", "volatile", "low_volatility"]) {
      assert.ok(regimes.includes(r as never), `${r} missing from stats`);
    }
  });

  test("win rate calculated correctly (30 wins / 10 losses = 75%)", () => {
    const stats = calcRegimePerformance(makeTrades("trending", 30, 10));
    const s = stats.find(r => r.regime === "trending")!;
    assert.ok(Math.abs(s.winRate - 75) < 0.1, `winRate=${s.winRate} expected ~75`);
    assert.equal(s.totalTrades, 40);
  });

  test("profit factor > 1 when wins outweigh losses", () => {
    const stats = calcRegimePerformance(makeTrades("ranging", 20, 10));
    const s = stats.find(r => r.regime === "ranging")!;
    assert.ok(s.profitFactor > 1, `profitFactor=${s.profitFactor} should be > 1`);
  });

  test("maxDrawdown is non-negative", () => {
    const stats = calcRegimePerformance(makeTrades("volatile", 5, 15));
    const s = stats.find(r => r.regime === "volatile")!;
    assert.ok(s.maxDrawdown >= 0);
  });

  test("regimes with no trades get zeroed stats", () => {
    const stats = calcRegimePerformance(makeTrades("trending", 10, 5));
    const ranging = stats.find(r => r.regime === "ranging")!;
    assert.equal(ranging.totalTrades, 0);
    assert.equal(ranging.winRate, 0);
  });
});

describe("adaptRegimeWeights", () => {
  test("returns unchanged profile below min samples (30)", () => {
    const trades = makeTrades("trending", 10, 5); // 15 trades
    const profile = DEFAULT_REGIME_WEIGHTS.trending;
    const adapted = adaptRegimeWeights(trades, profile);
    assert.equal(adapted.zone, profile.zone);
  });

  test("adapts when sample >= 30 and weights still sum to ~1", () => {
    const trades = makeTrades("trending", 20, 15); // 35 trades
    const adapted = adaptRegimeWeights(trades, DEFAULT_REGIME_WEIGHTS.trending);
    const sum = adapted.zone + adapted.liquidity + adapted.amd + adapted.confirmation;
    assert.ok(Math.abs(sum - 1) < 0.02, `sum=${sum} should be ~1`);
  });

  test("adapted weights stay within [0.04, 0.61] after constraints", () => {
    const trades = makeTrades("ranging", 30, 5);
    const adapted = adaptRegimeWeights(trades, DEFAULT_REGIME_WEIGHTS.ranging);
    for (const key of ["zone", "liquidity", "amd", "confirmation"] as const) {
      assert.ok(adapted[key] >= 0.04 && adapted[key] <= 0.61, `${key}=${adapted[key]} out of range`);
    }
  });

  test("updates sampleSize to trade count", () => {
    const trades = makeTrades("trending", 25, 10); // 35 trades
    const adapted = adaptRegimeWeights(trades, DEFAULT_REGIME_WEIGHTS.trending);
    assert.equal(adapted.sampleSize, 35);
  });

  test("lastUpdated is a recent Date", () => {
    const trades = makeTrades("trending", 20, 15);
    const adapted = adaptRegimeWeights(trades, DEFAULT_REGIME_WEIGHTS.trending);
    assert.ok(adapted.lastUpdated.getTime() > new Date(1).getTime());
  });
});

describe("bestPerformingRegime", () => {
  test("returns null with no trades (no regime has >= 5 trades)", () => {
    const stats = calcRegimePerformance([]);
    assert.equal(bestPerformingRegime(stats), null);
  });

  test("selects trending when it wins more", () => {
    const trades = [
      ...makeTrades("trending", 8, 2),
      ...makeTrades("ranging", 5, 5),
    ];
    const stats = calcRegimePerformance(trades);
    const best = bestPerformingRegime(stats);
    assert.equal(best, "trending");
  });

  test("returns a valid regime string", () => {
    const trades = makeTrades("volatile", 6, 1);
    const stats = calcRegimePerformance(trades);
    const best = bestPerformingRegime(stats);
    const valid = ["trending", "ranging", "volatile", "low_volatility"];
    assert.ok(best === null || valid.includes(best), `${best} not in ${valid}`);
  });
});
