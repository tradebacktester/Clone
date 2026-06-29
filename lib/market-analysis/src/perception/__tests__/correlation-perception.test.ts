import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { perceiveCorrelation } from "../correlation-perception.js";
import type { Candle } from "../../types.js";

function makeCandles(n: number, base = 1.1000, delta = 0.001): Candle[] {
  const candles: Candle[] = [];
  let price = base;
  for (let i = 0; i < n; i++) {
    price += delta * (Math.random() > 0.5 ? 1 : -1);
    candles.push({
      time: new Date(Date.now() + i * 60000),
      open: price - 0.0002,
      high: price + 0.0003,
      low: price - 0.0003,
      close: price,
      volume: 1000,
    });
  }
  return candles;
}

function makeCorrelatedCandles(source: Candle[], factor = 1.0, offset = 0): Candle[] {
  return source.map(c => ({
    ...c,
    open: c.open * factor + offset,
    high: c.high * factor + offset,
    low: c.low * factor + offset,
    close: c.close * factor + offset,
  }));
}

describe("perceiveCorrelation", () => {
  it("returns defaults for empty input", () => {
    const result = perceiveCorrelation({});
    assert.equal(result.eurusd_gbpusd.sampleSize, 0);
    assert.ok(result.confidence >= 0 && result.confidence <= 100);
  });

  it("returns valid structure for full pair data", () => {
    const eurusd = makeCandles(30);
    const gbpusd = makeCorrelatedCandles(eurusd, 1.1);
    const usdjpy = makeCandles(30, 110.0, 0.1);
    const result = perceiveCorrelation({ EURUSD: eurusd, GBPUSD: gbpusd, USDJPY: usdjpy });
    assert.ok("eurusd_gbpusd" in result);
    assert.ok("eurusd_usdjpy" in result);
    assert.ok("gbpusd_usdjpy" in result);
  });

  it("correlation is between -1 and 1", () => {
    const eurusd = makeCandles(30);
    const gbpusd = makeCorrelatedCandles(eurusd, 1.05);
    const usdjpy = makeCandles(30, 110.0, 0.1);
    const result = perceiveCorrelation({ EURUSD: eurusd, GBPUSD: gbpusd, USDJPY: usdjpy });
    assert.ok(result.eurusd_gbpusd.correlation >= -1 && result.eurusd_gbpusd.correlation <= 1);
    assert.ok(result.eurusd_usdjpy.correlation >= -1 && result.eurusd_usdjpy.correlation <= 1);
  });

  it("status is a valid value", () => {
    const eurusd = makeCandles(30);
    const gbpusd = makeCorrelatedCandles(eurusd, 1.05);
    const usdjpy = makeCandles(30, 110.0, 0.1);
    const result = perceiveCorrelation({ EURUSD: eurusd, GBPUSD: gbpusd, USDJPY: usdjpy });
    const validStatuses = ["high_positive", "normal", "high_negative", "breakdown"];
    assert.ok(validStatuses.includes(result.eurusd_gbpusd.status));
  });

  it("high positive correlation detected for identical trends", () => {
    const eurusd = makeCandles(30, 1.1, 0.001);
    const gbpusd = makeCorrelatedCandles(eurusd, 1.3, 0);
    const usdjpy = makeCandles(30, 110.0, 0.1);
    const result = perceiveCorrelation({ EURUSD: eurusd, GBPUSD: gbpusd, USDJPY: usdjpy });
    assert.ok(result.eurusd_gbpusd.correlation > 0.5);
  });

  it("overall correlation risk is valid", () => {
    const eurusd = makeCandles(30);
    const gbpusd = makeCandles(30, 1.3);
    const usdjpy = makeCandles(30, 110);
    const result = perceiveCorrelation({ EURUSD: eurusd, GBPUSD: gbpusd, USDJPY: usdjpy });
    assert.ok(["low", "medium", "high"].includes(result.overallCorrelationRisk));
  });

  it("confidence is 0-100", () => {
    const eurusd = makeCandles(25);
    const gbpusd = makeCandles(25, 1.3);
    const usdjpy = makeCandles(25, 110);
    const result = perceiveCorrelation({ EURUSD: eurusd, GBPUSD: gbpusd, USDJPY: usdjpy });
    assert.ok(result.confidence >= 0 && result.confidence <= 100);
  });

  it("pairA and pairB are set correctly", () => {
    const eurusd = makeCandles(25);
    const gbpusd = makeCandles(25, 1.3);
    const usdjpy = makeCandles(25, 110);
    const result = perceiveCorrelation({ EURUSD: eurusd, GBPUSD: gbpusd, USDJPY: usdjpy });
    assert.equal(result.eurusd_gbpusd.pairA, "EURUSD");
    assert.equal(result.eurusd_gbpusd.pairB, "GBPUSD");
  });
});
