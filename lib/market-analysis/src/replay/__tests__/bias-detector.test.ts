import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { detectBias } from "../bias-detector.js";
import type { DecisionTrace } from "../rule-evaluator.js";
import type { Candle } from "../../types.js";

function makeCandle(index: number, basePrice = 1.085): Candle {
  return {
    time: new Date(Date.now() - (200 - index) * 4 * 60 * 60 * 1000),
    open: basePrice,
    high: basePrice + 0.001,
    low: basePrice - 0.001,
    close: basePrice,
    volume: 20000,
  };
}

function makeNoZoneTrace(candleIndex: number): DecisionTrace {
  const candle = makeCandle(candleIndex);
  return {
    candleIndex,
    candleTime: candle.time.toISOString(),
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
    atr: 0.0005,
    currentPrice: candle.close,
    regime: "ranging",
    regimeConfidence: 60,
    amdPhase: "none",
    amdScore: 0,
    fibBias: "discount",
    swingTrend: "neutral",
    zoneEvaluations: [],
    activeZonesNearby: 0,
    finalDecision: "NO_ZONE",
    decisionReason: "No zones",
    tradeTaken: false,
  };
}

function makeTradeTrace(candleIndex: number, direction: "buy" | "sell", entryPrice: number, closedAtIndex?: number): DecisionTrace {
  const candle = makeCandle(candleIndex, entryPrice);
  return {
    candleIndex,
    candleTime: candle.time.toISOString(),
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
    atr: 0.0005,
    currentPrice: candle.close,
    regime: "trending",
    regimeConfidence: 80,
    amdPhase: "distribution",
    amdScore: 85,
    fibBias: direction === "buy" ? "discount" : "premium",
    swingTrend: direction === "buy" ? "bullish" : "bearish",
    zoneEvaluations: [
      {
        zoneType: direction === "buy" ? "demand" : "supply",
        direction,
        priceTop: entryPrice + 0.002,
        priceBottom: entryPrice - 0.001,
        strength: 78,
        inZone: true,
        approaching: false,
        rules: [
          { rule: "Zone Proximity", status: "PASS", reason: "In zone", value: 78 },
          { rule: "Zone Strength", status: "PASS", reason: "78 >= 55", value: 78 },
          { rule: "HTF Market Structure", status: "PASS", reason: "aligned", value: "bullish" },
          { rule: "Premium/Discount", status: "PASS", reason: "discount", value: "discount" },
          { rule: "Liquidity Sweep", status: "PASS", reason: "sweep detected", value: 75 },
          { rule: "AMD Phase", status: "PASS", reason: "complete", value: 85 },
          { rule: "Confirmation Candle", status: "PASS", reason: "score 80", value: 80 },
          { rule: "Final Score", status: "PASS", reason: "score 84", value: 84 },
        ],
        zoneScore: 78,
        liquidityScore: 75,
        amdScore: 85,
        confirmationScore: 80,
        finalScore: 84,
        tradeTaken: true,
        blockingRule: null,
      },
    ],
    activeZonesNearby: 1,
    finalDecision: "TRADE",
    decisionReason: "Signal generated",
    tradeTaken: true,
    trade: {
      direction,
      entryPrice,
      stopLoss: direction === "buy" ? entryPrice - 0.005 : entryPrice + 0.005,
      takeProfit: direction === "buy" ? entryPrice + 0.010 : entryPrice - 0.010,
      zoneType: direction === "buy" ? "demand" : "supply",
      zoneStrength: 78,
      finalScore: 84,
      liquidityScore: 75,
      amdScore: 85,
      confirmationScore: 80,
      riskReward: 2.0,
      outcome: "win",
      closedAtIndex: closedAtIndex ?? candleIndex + 10,
      closedAtTime: makeCandle(closedAtIndex ?? candleIndex + 10, entryPrice + 0.010).time.toISOString(),
      closedPrice: direction === "buy" ? entryPrice + 0.010 : entryPrice - 0.010,
      pnlPips: 100,
    },
  };
}

describe("Bias Detector", () => {
  it("returns a clean result for traces with no bias", () => {
    const allCandles = Array.from({ length: 200 }, (_, i) => makeCandle(i));
    const traces: DecisionTrace[] = [
      ...Array.from({ length: 50 }, (_, i) => makeNoZoneTrace(i + 50)),
      makeTradeTrace(100, "buy", 1.085, 115),
      ...Array.from({ length: 84 }, (_, i) => makeNoZoneTrace(i + 116)),
    ];
    const bias = detectBias(traces, allCandles);

    assert.ok(bias, "bias summary should exist");
    assert.ok(typeof bias.totalFlags === "number", "totalFlags should be a number");
    assert.ok(typeof bias.overallRating === "string", "overallRating should be a string");
    assert.ok(["clean", "suspicious", "biased"].includes(bias.overallRating), "rating should be valid");
    assert.strictEqual(bias.byType.invalid_entry, 0, "no invalid entries in clean scenario");
    assert.strictEqual(bias.byType.look_ahead, 0, "no look-ahead in clean scenario");
  });

  it("detects duplicate signals on consecutive candles", () => {
    const allCandles = Array.from({ length: 200 }, (_, i) => makeCandle(i));
    const traces: DecisionTrace[] = [
      ...Array.from({ length: 50 }, (_, i) => makeNoZoneTrace(i + 50)),
      makeTradeTrace(100, "buy", 1.085, 115),
      makeTradeTrace(101, "buy", 1.085, 116), // duplicate within 3 candles, same price
      makeTradeTrace(102, "buy", 1.085, 117), // duplicate again
      ...Array.from({ length: 97 }, (_, i) => makeNoZoneTrace(i + 103)),
    ];
    const bias = detectBias(traces, allCandles);
    assert.ok(bias.byType.duplicate_signal > 0, "should detect duplicate signals");
  });

  it("detects invalid entry — buy with SL above entry", () => {
    const allCandles = Array.from({ length: 200 }, (_, i) => makeCandle(i));
    const traces: DecisionTrace[] = [makeNoZoneTrace(50)];

    const badTrace = makeTradeTrace(60, "buy", 1.085, 75);
    badTrace.trade!.stopLoss = 1.090; // SL above entry for a buy — invalid
    traces.push(badTrace);

    const bias = detectBias(traces, allCandles);
    assert.ok(bias.byType.invalid_entry > 0, "should detect invalid entry (SL above entry for buy)");
  });

  it("detects invalid entry — sell with SL below entry", () => {
    const allCandles = Array.from({ length: 200 }, (_, i) => makeCandle(i));
    const traces: DecisionTrace[] = [makeNoZoneTrace(50)];

    const badTrace = makeTradeTrace(60, "sell", 1.085, 75);
    badTrace.trade!.stopLoss = 1.080; // SL below entry for a sell — invalid
    traces.push(badTrace);

    const bias = detectBias(traces, allCandles);
    assert.ok(bias.byType.invalid_entry > 0, "should detect invalid entry (SL below entry for sell)");
  });

  it("detects look-ahead — trade closing on same bar as entry", () => {
    const allCandles = Array.from({ length: 200 }, (_, i) => makeCandle(i));
    const badTrace = makeTradeTrace(100, "buy", 1.085, 100); // closes at same index as entry
    const traces = [badTrace];

    const bias = detectBias(traces, allCandles);
    assert.ok(bias.byType.look_ahead > 0, "should detect same-bar close as look-ahead");
  });

  it("detects inverted zone boundaries as look-ahead", () => {
    const allCandles = Array.from({ length: 200 }, (_, i) => makeCandle(i));
    const badTrace = makeTradeTrace(100, "buy", 1.085, 110);
    badTrace.zoneEvaluations[0]!.priceTop = 1.080; // top < bottom — inverted
    badTrace.zoneEvaluations[0]!.priceBottom = 1.090;
    const traces = [badTrace];

    const bias = detectBias(traces, allCandles);
    assert.ok(bias.byType.look_ahead > 0, "should detect inverted zone boundaries as look-ahead indicator");
  });

  it("byType counts match flags array", () => {
    const allCandles = Array.from({ length: 200 }, (_, i) => makeCandle(i));
    const traces = [makeNoZoneTrace(50), makeTradeTrace(100, "buy", 1.085, 115)];
    const bias = detectBias(traces, allCandles);

    const totalFromByType = Object.values(bias.byType).reduce((a, b) => a + b, 0);
    assert.strictEqual(bias.totalFlags, bias.flags.length, "totalFlags should equal flags.length");
    assert.strictEqual(totalFromByType, bias.flags.length, "sum of byType should equal flags.length");
  });

  it("overall rating is biased when look-ahead is detected", () => {
    const allCandles = Array.from({ length: 200 }, (_, i) => makeCandle(i));
    const badTrace = makeTradeTrace(100, "buy", 1.085, 100); // same-bar close
    const bias = detectBias([badTrace], allCandles);
    assert.strictEqual(bias.overallRating, "biased", "should be biased when look-ahead detected");
  });

  it("overall rating is clean for valid traces with no flags", () => {
    const allCandles = Array.from({ length: 200 }, (_, i) => makeCandle(i));
    const traces = Array.from({ length: 10 }, (_, i) => makeNoZoneTrace(50 + i));
    const bias = detectBias(traces, allCandles);
    assert.strictEqual(bias.overallRating, "clean", "should be clean for no-zone traces with no flags");
  });
});
