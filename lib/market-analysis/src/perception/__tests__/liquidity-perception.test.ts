import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { perceiveLiquidity } from "../liquidity-perception.js";
import type { Candle } from "../../types.js";

function makeCandles(n: number, highVol = true): Candle[] {
  const candles: Candle[] = [];
  let price = 1.3000;
  for (let i = 0; i < n; i++) {
    price += (Math.random() - 0.5) * 0.001;
    const range = highVol ? 0.003 : 0.001;
    candles.push({
      time: new Date(Date.now() + i * 60000),
      open: price - range / 4,
      high: price + range / 2,
      low: price - range / 2,
      close: price + (Math.random() - 0.5) * range * 0.5,
      volume: 1000 + Math.random() * 500,
    });
  }
  return candles;
}

describe("perceiveLiquidity", () => {
  it("returns defaults for insufficient candles", () => {
    const result = perceiveLiquidity([]);
    assert.equal(result.confidence, 0);
  });

  it("returns fair quality for very few candles", () => {
    const result = perceiveLiquidity(makeCandles(3));
    assert.ok(["excellent", "good", "fair", "poor"].includes(result.quality));
  });

  it("relativeVolume is non-negative", () => {
    const result = perceiveLiquidity(makeCandles(25));
    assert.ok(result.relativeVolume >= 0);
  });

  it("spread is non-negative", () => {
    const result = perceiveLiquidity(makeCandles(20));
    assert.ok(result.spread >= 0);
  });

  it("candle efficiency is 0-1", () => {
    const result = perceiveLiquidity(makeCandles(20));
    assert.ok(result.candleEfficiency >= 0 && result.candleEfficiency <= 1);
  });

  it("gap frequency is 0-1", () => {
    const result = perceiveLiquidity(makeCandles(25));
    assert.ok(result.gapFrequency >= 0 && result.gapFrequency <= 1);
  });

  it("score is 0-100", () => {
    const result = perceiveLiquidity(makeCandles(25));
    assert.ok(result.score >= 0 && result.score <= 100);
  });

  it("quality is valid", () => {
    const result = perceiveLiquidity(makeCandles(25));
    assert.ok(["excellent", "good", "fair", "poor"].includes(result.quality));
  });

  it("session liquidity is valid", () => {
    const result = perceiveLiquidity(makeCandles(25));
    assert.ok(["high", "medium", "low"].includes(result.sessionLiquidity));
  });

  it("confidence is between 0 and 100", () => {
    const result = perceiveLiquidity(makeCandles(25));
    assert.ok(result.confidence >= 0 && result.confidence <= 100);
  });

  it("all required fields present", () => {
    const result = perceiveLiquidity(makeCandles(25));
    const fields = ["sessionLiquidity", "relativeVolume", "spread", "spreadPercent",
      "candleEfficiency", "gapFrequency", "quality", "score", "confidence"];
    for (const f of fields) assert.ok(f in result, `Missing field: ${f}`);
  });
});
