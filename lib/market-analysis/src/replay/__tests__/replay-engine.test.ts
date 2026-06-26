import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runReplay } from "../replay-engine.js";
import type { ReplayConfig } from "../replay-engine.js";

const BASE_CONFIG: ReplayConfig = {
  pair: "EURUSD",
  timeframe: "4h",
  startDate: "2024-01-01",
  endDate: "2024-03-31",
};

describe("Replay Engine", () => {
  it("runs a full replay without throwing", () => {
    const result = runReplay(BASE_CONFIG);
    assert.ok(result, "result should be defined");
    assert.ok(Array.isArray(result.traces), "traces should be an array");
    assert.ok(Array.isArray(result.candles), "candles should be an array");
    assert.ok(result.candles.length > 0, "should generate candles");
  });

  it("generates traces starting from MIN_LOOKBACK", () => {
    const result = runReplay(BASE_CONFIG);
    const minIndex = result.traces[0]?.candleIndex ?? 0;
    assert.ok(minIndex >= 50, `first trace index (${minIndex}) should be >= 50 (MIN_LOOKBACK)`);
  });

  it("every trace has a valid finalDecision", () => {
    const result = runReplay(BASE_CONFIG);
    const validDecisions = ["TRADE", "NO_TRADE", "NO_ZONE"];
    for (const trace of result.traces) {
      assert.ok(
        validDecisions.includes(trace.finalDecision),
        `trace at index ${trace.candleIndex} has invalid decision: ${trace.finalDecision}`,
      );
    }
  });

  it("zero look-ahead — candleIndex equals position in candle array", () => {
    const result = runReplay(BASE_CONFIG);
    for (const trace of result.traces) {
      const candle = result.candles[trace.candleIndex];
      assert.ok(candle, `candle at index ${trace.candleIndex} should exist`);
      assert.strictEqual(
        trace.candleTime,
        candle.time.toISOString(),
        `trace candleTime should match candle at its index`,
      );
    }
  });

  it("zero look-ahead — trace close equals candle close at that index", () => {
    const result = runReplay(BASE_CONFIG);
    for (const trace of result.traces) {
      const candle = result.candles[trace.candleIndex];
      if (!candle) continue;
      assert.strictEqual(
        trace.close,
        candle.close,
        `trace close (${trace.close}) should equal candle close (${candle.close}) at index ${trace.candleIndex}`,
      );
    }
  });

  it("trade outcomes only reference future candles", () => {
    const result = runReplay(BASE_CONFIG);
    const traded = result.traces.filter(t => t.tradeTaken && t.trade?.closedAtIndex !== undefined);
    for (const trace of traded) {
      assert.ok(
        trace.trade!.closedAtIndex! > trace.candleIndex,
        `trade closed at index ${trace.trade!.closedAtIndex} must be strictly after entry at ${trace.candleIndex}`,
      );
    }
  });

  it("no open trades are stacked — only one trade at a time", () => {
    const result = runReplay(BASE_CONFIG);
    const traded = result.traces.filter(t => t.tradeTaken && t.trade);
    for (let i = 1; i < traded.length; i++) {
      const prev = traded[i - 1]!;
      const curr = traded[i]!;
      const prevCloseIdx = prev.trade?.closedAtIndex ?? prev.candleIndex;
      assert.ok(
        curr.candleIndex > prevCloseIdx,
        `new trade at index ${curr.candleIndex} should start after previous closed at ${prevCloseIdx}`,
      );
    }
  });

  it("generates a non-empty validation report", () => {
    const result = runReplay(BASE_CONFIG);
    assert.ok(result.reportText.length > 500, "report should have substantial content");
    assert.ok(result.reportText.includes("VALIDATION_REPORT"), "report should have title");
    assert.ok(result.reportText.includes("Rule Accuracy"), "report should have rule analysis");
    assert.ok(result.reportText.includes("Bias Detection"), "report should have bias section");
  });

  it("GBPUSD 1h replay produces a result", () => {
    const config: ReplayConfig = {
      pair: "GBPUSD",
      timeframe: "1h",
      startDate: "2024-01-01",
      endDate: "2024-02-28",
    };
    const result = runReplay(config);
    assert.ok(result.candles.length > 0);
    assert.ok(result.traces.length > 0);
  });

  it("USDJPY 1d replay produces a result", () => {
    const config: ReplayConfig = {
      pair: "USDJPY",
      timeframe: "1d",
      startDate: "2023-01-01",
      endDate: "2024-01-01",
    };
    const result = runReplay(config);
    assert.ok(result.candles.length > 0);
    assert.ok(result.traces.length > 0);
  });

  it("stats.totalTradesTaken equals number of TRADE decisions", () => {
    const result = runReplay(BASE_CONFIG);
    const tradedCount = result.traces.filter(t => t.finalDecision === "TRADE").length;
    assert.strictEqual(
      result.stats.totalTradesTaken,
      tradedCount,
      `stats.totalTradesTaken (${result.stats.totalTradesTaken}) should equal counted TRADE traces (${tradedCount})`,
    );
  });

  it("winRate is between 0 and 100", () => {
    const result = runReplay(BASE_CONFIG);
    assert.ok(result.stats.winRate >= 0, "winRate should be >= 0");
    assert.ok(result.stats.winRate <= 100, "winRate should be <= 100");
  });

  it("candles are in strict chronological order", () => {
    const result = runReplay(BASE_CONFIG);
    for (let i = 1; i < result.candles.length; i++) {
      const prev = result.candles[i - 1]!.time.getTime();
      const curr = result.candles[i]!.time.getTime();
      assert.ok(curr > prev, `candle ${i} time (${curr}) should be after candle ${i - 1} (${prev})`);
    }
  });
});
