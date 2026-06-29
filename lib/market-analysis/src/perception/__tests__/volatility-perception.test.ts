import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { perceiveVolatility } from "../volatility-perception.js";
import type { Candle } from "../../types.js";

function makeCandles(n: number, highVol = false): Candle[] {
  const candles: Candle[] = [];
  let price = 1.1000;
  for (let i = 0; i < n; i++) {
    const range = highVol ? 0.005 : 0.001;
    price += (Math.random() - 0.5) * range;
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

describe("perceiveVolatility", () => {
  it("returns defaults for insufficient candles", () => {
    const result = perceiveVolatility([]);
    assert.equal(result.atr, 0);
    assert.equal(result.confidence, 0);
  });

  it("returns defaults for minimal candles", () => {
    const result = perceiveVolatility(makeCandles(5));
    assert.equal(result.atr, 0);
  });

  it("ATR is non-negative", () => {
    const result = perceiveVolatility(makeCandles(30));
    assert.ok(result.atr >= 0);
  });

  it("volatility percentile is 0-100", () => {
    const result = perceiveVolatility(makeCandles(50));
    assert.ok(result.volatilityPercentile >= 0 && result.volatilityPercentile <= 100);
  });

  it("classification is a valid value", () => {
    const result = perceiveVolatility(makeCandles(50));
    const validClasses = ["very_low", "low", "normal", "high", "extreme"];
    assert.ok(validClasses.includes(result.classification));
  });

  it("volatility trend is valid", () => {
    const result = perceiveVolatility(makeCandles(50));
    const validTrends = ["rising", "falling", "stable"];
    assert.ok(validTrends.includes(result.volatilityTrend));
  });

  it("historical volatility is non-negative", () => {
    const result = perceiveVolatility(makeCandles(60));
    assert.ok(result.historicalVolatility >= 0);
  });

  it("realized volatility is non-negative", () => {
    const result = perceiveVolatility(makeCandles(30));
    assert.ok(result.realizedVolatility >= 0);
  });

  it("annualizedHV is non-negative", () => {
    const result = perceiveVolatility(makeCandles(60));
    assert.ok(result.annualizedHV >= 0);
  });

  it("confidence is between 0 and 100", () => {
    const result = perceiveVolatility(makeCandles(50));
    assert.ok(result.confidence >= 0 && result.confidence <= 100);
  });

  it("range compression is 0-100", () => {
    const result = perceiveVolatility(makeCandles(30));
    assert.ok(result.rangeCompression >= 0 && result.rangeCompression <= 100);
  });

  it("all required fields present", () => {
    const result = perceiveVolatility(makeCandles(30));
    const fields = ["atr", "atrPercent", "historicalVolatility", "realizedVolatility",
      "volatilityPercentile", "volatilityTrend", "classification", "rangeCompression",
      "annualizedHV", "confidence"];
    for (const f of fields) assert.ok(f in result, `Missing field: ${f}`);
  });
});
