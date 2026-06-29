import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildMarketState, MARKET_STATE_VERSION } from "../market-state.js";
import type { Candle } from "../../types.js";

function makeCandles(n: number, base = 1.1000): Candle[] {
  const candles: Candle[] = [];
  let price = base;
  for (let i = 0; i < n; i++) {
    price += 0.0005 * (Math.random() > 0.5 ? 1 : -1);
    candles.push({
      time: new Date(Date.now() + i * 3600000),
      open: price - 0.0002,
      high: price + 0.0004,
      low: price - 0.0004,
      close: price,
      volume: 1000 + i * 10,
    });
  }
  return candles;
}

describe("buildMarketState", () => {
  const eurusd = makeCandles(40, 1.1000);
  const gbpusd = makeCandles(40, 1.3000);
  const usdjpy = makeCandles(40, 110.00);
  const now = new Date("2026-01-15T10:00:00Z");

  it("returns a valid market state", () => {
    const state = buildMarketState({ pair: "EURUSD", candles: eurusd, now });
    assert.equal(state.pair, "EURUSD");
    assert.equal(state.version, MARKET_STATE_VERSION);
    assert.ok(state.timestamp);
  });

  it("contains all required top-level fields", () => {
    const state = buildMarketState({ pair: "EURUSD", candles: eurusd, now });
    const fields = ["pair", "timestamp", "version", "session", "trend", "regime",
      "volatility", "liquidity", "correlation", "newsContext",
      "overallConfidence", "confidenceScore", "summary"];
    for (const f of fields) assert.ok(f in state, `Missing field: ${f}`);
  });

  it("session is a valid value", () => {
    const state = buildMarketState({ pair: "EURUSD", candles: eurusd, now });
    const validSessions = ["london", "new_york", "tokyo", "sydney", "off_hours"];
    assert.ok(validSessions.includes(state.session));
  });

  it("detects london session correctly", () => {
    const londonTime = new Date("2026-01-15T09:00:00Z");
    const state = buildMarketState({ pair: "EURUSD", candles: eurusd, now: londonTime });
    assert.equal(state.session, "london");
  });

  it("overallConfidence is a valid value", () => {
    const state = buildMarketState({ pair: "EURUSD", candles: eurusd, now });
    const validConfidences = ["very_low", "low", "medium", "high", "very_high"];
    assert.ok(validConfidences.includes(state.overallConfidence));
  });

  it("confidenceScore is 0-100", () => {
    const state = buildMarketState({ pair: "EURUSD", candles: eurusd, now });
    assert.ok(state.confidenceScore >= 0 && state.confidenceScore <= 100);
  });

  it("summary is a non-empty string", () => {
    const state = buildMarketState({ pair: "EURUSD", candles: eurusd, now });
    assert.ok(typeof state.summary === "string");
    assert.ok(state.summary.length > 0);
  });

  it("summary contains pair name", () => {
    const state = buildMarketState({ pair: "EURUSD", candles: eurusd, now });
    assert.ok(state.summary.includes("EURUSD"));
  });

  it("works with multi-pair candles for correlation", () => {
    const state = buildMarketState({
      pair: "EURUSD",
      candles: eurusd,
      allPairCandles: { EURUSD: eurusd, GBPUSD: gbpusd, USDJPY: usdjpy },
      now,
    });
    assert.ok(state.correlation.eurusd_gbpusd.sampleSize > 0);
  });

  it("works with news events", () => {
    const state = buildMarketState({
      pair: "EURUSD",
      candles: eurusd,
      newsEvents: [{
        title: "NFP", currency: "USD", category: "NFP", impact: "high",
        eventTime: new Date(now.getTime() + 3600000), minutesUntil: 60,
      }],
      now,
    });
    assert.ok(state.newsContext.upcomingHighImpact.length > 0);
  });

  it("empty candles produce valid but minimal state", () => {
    const state = buildMarketState({ pair: "EURUSD", candles: [], now });
    assert.equal(state.pair, "EURUSD");
    assert.equal(state.trend.direction, "neutral");
  });
});
