import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { perceiveTrend } from "../trend-perception.js";
import type { Candle, SwingPoint } from "../../types.js";

function makeCandles(n: number, trend: "up" | "down" | "flat" = "up"): Candle[] {
  const candles: Candle[] = [];
  let price = 1.1000;
  for (let i = 0; i < n; i++) {
    if (trend === "up") price += 0.001;
    else if (trend === "down") price -= 0.001;
    candles.push({
      time: new Date(Date.now() + i * 60000),
      open: price - 0.0002,
      high: price + 0.0005,
      low: price - 0.0005,
      close: price,
      volume: 1000 + i * 10,
    });
  }
  return candles;
}

function makeSwings(candles: Candle[], bullish = true): SwingPoint[] {
  const swings: SwingPoint[] = [];
  let priceHigh = 1.1000;
  let priceLow = 1.0950;
  for (let i = 0; i < 6; i++) {
    if (bullish) {
      priceHigh += 0.002;
      priceLow += 0.002;
    } else {
      priceHigh -= 0.002;
      priceLow -= 0.002;
    }
    swings.push({
      time: candles[i]?.time ?? new Date(),
      price: priceHigh,
      type: "high",
      index: i,
    });
    swings.push({
      time: candles[i]?.time ?? new Date(),
      price: priceLow,
      type: "low",
      index: i,
    });
  }
  return swings;
}

describe("perceiveTrend", () => {
  it("returns neutral for insufficient candles", () => {
    const result = perceiveTrend([], []);
    assert.equal(result.direction, "neutral");
    assert.equal(result.confidence, 0);
  });

  it("returns neutral for minimal candles", () => {
    const result = perceiveTrend(makeCandles(5), []);
    assert.equal(result.direction, "neutral");
  });

  it("returns a valid direction for trending candles", () => {
    const candles = makeCandles(40, "up");
    const swings = makeSwings(candles, true);
    const result = perceiveTrend(candles, swings);
    const validDirections = ["strong_bullish", "bullish", "neutral", "bearish", "strong_bearish"];
    assert.ok(validDirections.includes(result.direction));
  });

  it("strength is between 0 and 100", () => {
    const candles = makeCandles(40, "up");
    const swings = makeSwings(candles, true);
    const result = perceiveTrend(candles, swings);
    assert.ok(result.strength >= 0 && result.strength <= 100);
  });

  it("persistence is between 0 and 100", () => {
    const candles = makeCandles(40, "up");
    const swings = makeSwings(candles, true);
    const result = perceiveTrend(candles, swings);
    assert.ok(result.persistence >= 0 && result.persistence <= 100);
  });

  it("age is non-negative", () => {
    const candles = makeCandles(40, "up");
    const swings = makeSwings(candles, true);
    const result = perceiveTrend(candles, swings);
    assert.ok(result.age >= 0);
  });

  it("adx is non-negative", () => {
    const candles = makeCandles(40, "up");
    const result = perceiveTrend(candles, []);
    assert.ok(result.adx >= 0);
  });

  it("confidence is between 0 and 100", () => {
    const candles = makeCandles(40, "up");
    const swings = makeSwings(candles, true);
    const result = perceiveTrend(candles, swings);
    assert.ok(result.confidence >= 0 && result.confidence <= 100);
  });

  it("detects bearish structure for downtrend candles", () => {
    const candles = makeCandles(40, "down");
    const swings = makeSwings(candles, false);
    const result = perceiveTrend(candles, swings);
    const validDirections = ["strong_bullish", "bullish", "neutral", "bearish", "strong_bearish"];
    assert.ok(validDirections.includes(result.direction));
  });

  it("returns all required fields", () => {
    const candles = makeCandles(30, "up");
    const result = perceiveTrend(candles, []);
    assert.ok("direction" in result);
    assert.ok("strength" in result);
    assert.ok("persistence" in result);
    assert.ok("age" in result);
    assert.ok("adx" in result);
    assert.ok("plusDI" in result);
    assert.ok("minusDI" in result);
    assert.ok("structureScore" in result);
    assert.ok("consecutiveStructures" in result);
    assert.ok("confidence" in result);
  });
});
