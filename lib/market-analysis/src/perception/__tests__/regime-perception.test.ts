import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { perceiveRegime } from "../regime-perception.js";
import type { Candle } from "../../types.js";

function makeCandles(n: number, trend: "up" | "flat" | "volatile" = "flat"): Candle[] {
  const candles: Candle[] = [];
  let price = 1.1000;
  for (let i = 0; i < n; i++) {
    if (trend === "up") price += 0.0005;
    else if (trend === "volatile") price += (Math.random() - 0.5) * 0.005;
    else price += (Math.random() - 0.5) * 0.0002;
    const range = trend === "volatile" ? 0.003 : 0.001;
    candles.push({
      time: new Date(Date.now() + i * 3600000),
      open: price - range / 4,
      high: price + range / 2,
      low: price - range / 2,
      close: price,
      volume: 1000,
    });
  }
  return candles;
}

describe("perceiveRegime", () => {
  it("returns defaults for insufficient candles", () => {
    const result = perceiveRegime([], []);
    assert.equal(result.regime, "ranging");
    assert.equal(result.confidence, 0);
  });

  it("regime is a valid value", () => {
    const result = perceiveRegime(makeCandles(40, "up"), []);
    const validRegimes = ["trending", "ranging", "expansion", "compression", "transitioning"];
    assert.ok(validRegimes.includes(result.regime));
  });

  it("confidence is 0-100", () => {
    const result = perceiveRegime(makeCandles(40, "up"), []);
    assert.ok(result.confidence >= 0 && result.confidence <= 100);
  });

  it("scores object has all regime keys", () => {
    const result = perceiveRegime(makeCandles(40), []);
    const keys = ["trending", "ranging", "expansion", "compression", "transitioning"];
    for (const k of keys) assert.ok(k in result.scores, `Missing score key: ${k}`);
  });

  it("all scores are 0-100", () => {
    const result = perceiveRegime(makeCandles(40, "volatile"), []);
    for (const [, score] of Object.entries(result.scores)) {
      assert.ok(score >= 0 && score <= 100, `Score out of range: ${score}`);
    }
  });

  it("volatility percentile is 0-100", () => {
    const result = perceiveRegime(makeCandles(40), []);
    assert.ok(result.volatilityPercentile >= 0 && result.volatilityPercentile <= 100);
  });

  it("ADX is non-negative", () => {
    const result = perceiveRegime(makeCandles(40, "up"), []);
    assert.ok(result.adx >= 0);
  });

  it("all required fields present", () => {
    const result = perceiveRegime(makeCandles(40), []);
    const fields = ["regime", "confidence", "scores", "prevRegime",
      "isTransitioning", "volatilityPercentile", "adx", "rangeCompression"];
    for (const f of fields) assert.ok(f in result, `Missing field: ${f}`);
  });
});
