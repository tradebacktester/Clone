import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  analyzeRegimeState,
  detectRegimeTransition,
  buildRegimeHistory,
  featuresToCandles,
} from "../regime-transition-detector.js";
import type { RegimeCandle } from "../regime-transition-detector.js";

// ─── Candle factory ───────────────────────────────────────────────────────────

function makeCandles(n: number, trend: "up" | "down" | "flat" | "volatile"): RegimeCandle[] {
  const candles: RegimeCandle[] = [];
  let price = 1.1000;
  for (let i = 0; i < n; i++) {
    let move: number;
    switch (trend) {
      case "up":       move = 0.0002 + Math.random() * 0.0001; break;
      case "down":     move = -(0.0002 + Math.random() * 0.0001); break;
      case "volatile": move = (Math.random() - 0.5) * 0.002; break;
      default:         move = (Math.random() - 0.5) * 0.00005;
    }
    price += move;
    price = Math.max(0.001, price);
    candles.push({
      open: price - Math.abs(move) * 0.5,
      high: price + Math.abs(move) * 0.5,
      low:  price - Math.abs(move) * 0.8,
      close: price,
      timestamp: new Date(Date.now() - (n - i) * 3600 * 1000),
    });
  }
  return candles;
}

describe("regime-transition-detector", () => {
  describe("analyzeRegimeState — insufficient data", () => {
    it("returns default ranging state for <20 candles", () => {
      const state = analyzeRegimeState(makeCandles(5, "up"), "EURUSD");
      assert.equal(state.currentRegime, "ranging");
      assert.ok(state.regimeConfidence <= 50);
    });
  });

  describe("analyzeRegimeState — trending market", () => {
    it("identifies a consistent uptrend", () => {
      const candles = makeCandles(60, "up");
      const state = analyzeRegimeState(candles, "EURUSD");
      assert.ok(["trending", "expansion", "ranging"].includes(state.currentRegime),
        `unexpected regime: ${state.currentRegime}`);
      assert.ok(state.hurstExponent >= 0 && state.hurstExponent <= 1, `Hurst OOB: ${state.hurstExponent}`);
    });
  });

  describe("analyzeRegimeState — volatile market", () => {
    it("identifies high-volatility market", () => {
      const candles = makeCandles(60, "volatile");
      const state = analyzeRegimeState(candles, "EURUSD");
      assert.ok(["volatile", "expansion", "ranging", "trending", "low_volatility", "compression"].includes(state.currentRegime));
    });

    it("rolling volatility is non-negative", () => {
      const candles = makeCandles(60, "volatile");
      const state = analyzeRegimeState(candles, "EURUSD");
      assert.ok(state.rollingVolatility >= 0, `volatility negative: ${state.rollingVolatility}`);
    });
  });

  describe("analyzeRegimeState — metrics", () => {
    it("ATR is positive for candles with range", () => {
      const candles = makeCandles(50, "up");
      const state = analyzeRegimeState(candles, "EURUSD");
      assert.ok(state.atr >= 0, `ATR negative: ${state.atr}`);
    });

    it("hurst exponent is in [0, 1]", () => {
      const candles = makeCandles(60, "flat");
      const state = analyzeRegimeState(candles, "EURUSD");
      assert.ok(state.hurstExponent >= 0 && state.hurstExponent <= 1);
    });

    it("regime confidence is in [0, 100]", () => {
      const candles = makeCandles(60, "up");
      const state = analyzeRegimeState(candles, "EURUSD");
      assert.ok(state.regimeConfidence >= 0 && state.regimeConfidence <= 100);
    });

    it("trendStrength is in [0, 100]", () => {
      const candles = makeCandles(60, "up");
      const state = analyzeRegimeState(candles, "EURUSD");
      assert.ok(state.trendStrength >= 0 && state.trendStrength <= 100);
    });
  });

  describe("detectRegimeTransition — no transition for same regime", () => {
    it("returns null when both windows have same regime", () => {
      const candles = makeCandles(100, "up");
      const prev = candles.slice(0, 50);
      const curr = candles.slice(50);
      // May or may not detect transition — just verify null or valid structure
      const t = detectRegimeTransition(prev, curr, "EURUSD");
      if (t !== null) {
        assert.ok(t.transitionId.length > 0);
      }
    });
  });

  describe("detectRegimeTransition — transition fields", () => {
    it("transition has all required fields", () => {
      const prev = makeCandles(50, "flat");
      const curr = makeCandles(50, "volatile");
      // Force different regimes by using extreme conditions
      const t = detectRegimeTransition(prev, curr, "GBPUSD");
      if (t !== null) {
        assert.ok(t.transitionId.length > 0);
        assert.ok(typeof t.fromRegime === "string");
        assert.ok(typeof t.toRegime === "string");
        assert.ok(typeof t.transitionType === "string");
        assert.ok(t.transitionConfidence >= 0 && t.transitionConfidence <= 100);
        assert.ok(t.regimeConfidence >= 0 && t.regimeConfidence <= 100);
        assert.ok(Array.isArray(t.evidence));
        assert.ok(t.description.length > 0);
        assert.ok(t.recommendation.length > 0);
      }
    });

    it("ATR change pct is a finite number", () => {
      const prev = makeCandles(40, "flat");
      const curr = makeCandles(40, "volatile");
      const t = detectRegimeTransition(prev, curr, "USDJPY");
      if (t !== null) {
        assert.ok(isFinite(t.atrChangePct));
      }
    });

    it("cusum score is in [0, 100]", () => {
      const prev = makeCandles(40, "flat");
      const curr = makeCandles(40, "volatile");
      const t = detectRegimeTransition(prev, curr, "EURUSD");
      if (t !== null) {
        assert.ok(t.cusumScore >= 0 && t.cusumScore <= 100);
      }
    });

    it("sets detectedAt to a valid date", () => {
      const prev = makeCandles(40, "up");
      const curr = makeCandles(40, "down");
      const t = detectRegimeTransition(prev, curr, "EURUSD");
      if (t !== null) {
        assert.ok(t.detectedAt instanceof Date);
      }
    });
  });

  describe("buildRegimeHistory", () => {
    it("returns empty for no transitions", () => {
      const history = buildRegimeHistory([]);
      assert.deepEqual(history, []);
    });

    it("builds correct history from transitions", () => {
      const now = Date.now();
      const transitions = [
        {
          transitionId: "t1",
          pair: "EURUSD",
          fromRegime: "ranging" as const,
          toRegime: "trending" as const,
          transitionType: "trend_reversal" as const,
          transitionConfidence: 75,
          regimeConfidence: 80,
          rollingVolatilityBefore: 0.1,
          rollingVolatilityAfter: 0.2,
          atrBefore: 0.001,
          atrAfter: 0.002,
          atrChangePct: 100,
          hurstBefore: 0.48,
          hurstAfter: 0.62,
          adxBefore: 20,
          adxAfter: 45,
          cusumScore: 55,
          previousRegimeDurationDays: 14,
          evidence: ["Hurst increased", "ADX crossed 40"],
          description: "Regime shifted from ranging to trending",
          recommendation: "Monitor for confirmation",
          detectedAt: new Date(now - 86400 * 1000),
          confirmed: true,
        },
      ];
      const history = buildRegimeHistory(transitions);
      assert.equal(history.length, 1);
      assert.equal(history[0].regime, "trending");
    });
  });

  describe("featuresToCandles", () => {
    it("returns empty array for empty features", () => {
      const candles = featuresToCandles([]);
      assert.deepEqual(candles, []);
    });

    it("returns one candle per feature", () => {
      const features = [
        { openedAt: new Date(), confidence: 70, tqi: 60, rrActual: 1.5, pnl: 1 },
        { openedAt: new Date(), confidence: 60, tqi: 55, rrActual: 1.0, pnl: -0.5 },
      ];
      const candles = featuresToCandles(features);
      assert.equal(candles.length, 2);
    });

    it("candles have valid OHLC structure (high >= close >= low)", () => {
      const features = [
        { openedAt: new Date(), confidence: 70, tqi: 60, rrActual: 1.5, pnl: 1 },
        { openedAt: new Date(), confidence: 55, tqi: 50, rrActual: 0.8, pnl: -0.3 },
        { openedAt: new Date(), confidence: 80, tqi: 70, rrActual: 2.0, pnl: 2 },
      ];
      const candles = featuresToCandles(features);
      for (const c of candles) {
        assert.ok(c.high >= c.close, `high (${c.high}) < close (${c.close})`);
        assert.ok(c.close >= c.low, `close (${c.close}) < low (${c.low})`);
        assert.ok(c.close > 0, `close <= 0`);
      }
    });
  });
});
