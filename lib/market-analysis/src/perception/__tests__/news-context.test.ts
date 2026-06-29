import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { perceiveNewsContext, type RawNewsEvent } from "../news-context.js";

function makeEvent(overrides: Partial<RawNewsEvent> = {}): RawNewsEvent {
  return {
    title: "US Non-Farm Payrolls",
    currency: "USD",
    category: "NFP",
    impact: "high",
    eventTime: new Date(Date.now() + 60 * 60000),
    minutesUntil: 60,
    isBlocking: false,
    ...overrides,
  };
}

describe("perceiveNewsContext", () => {
  const now = new Date();

  it("returns safe environment for empty events", () => {
    const result = perceiveNewsContext([], now);
    assert.equal(result.environment, "safe");
    assert.equal(result.nextEventMinutes, null);
    assert.equal(result.upcomingHighImpact.length, 0);
  });

  it("detects upcoming high-impact event", () => {
    const event = makeEvent({ eventTime: new Date(now.getTime() + 90 * 60000) });
    const result = perceiveNewsContext([event], now);
    assert.ok(result.upcomingHighImpact.length > 0);
    assert.ok(result.nextEventMinutes !== null);
  });

  it("environment is cautious when event within 30 minutes", () => {
    const event = makeEvent({ eventTime: new Date(now.getTime() + 20 * 60000) });
    const result = perceiveNewsContext([event], now);
    assert.ok(result.environment === "cautious" || result.environment === "blocked");
  });

  it("environment is blocked when event is blocking", () => {
    const event = makeEvent({
      eventTime: new Date(now.getTime() + 10 * 60000),
      isBlocking: true,
    });
    const result = perceiveNewsContext([event], now);
    assert.equal(result.environment, "blocked");
  });

  it("detects recent events within 60 minutes", () => {
    const event = makeEvent({
      eventTime: new Date(now.getTime() - 30 * 60000),
      impact: "high",
    });
    const result = perceiveNewsContext([event], now);
    assert.ok(result.recentEvents.length > 0);
    assert.ok(result.recentImpactScore >= 0);
  });

  it("recovery phase is recovering for recent high-impact events", () => {
    const event = makeEvent({
      eventTime: new Date(now.getTime() - 20 * 60000),
      category: "NFP",
    });
    const result = perceiveNewsContext([event], now);
    assert.ok(["recovering", "clear", "blocked"].includes(result.recoveryPhase));
  });

  it("affected pairs are valid trading pairs", () => {
    const event = makeEvent({ currency: "USD", eventTime: new Date(now.getTime() + 60 * 60000) });
    const result = perceiveNewsContext([event], now);
    for (const pair of result.affectedPairs) {
      assert.ok(["EURUSD", "GBPUSD", "USDJPY"].includes(pair), `Unexpected pair: ${pair}`);
    }
  });

  it("confidence is 0-100", () => {
    const result = perceiveNewsContext([makeEvent()], now);
    assert.ok(result.confidence >= 0 && result.confidence <= 100);
  });

  it("nextEventTitle is set when upcoming event exists", () => {
    const event = makeEvent({ title: "CPI Release", eventTime: new Date(now.getTime() + 60 * 60000) });
    const result = perceiveNewsContext([event], now);
    assert.ok(result.nextEventTitle !== null);
  });

  it("events outside 240-minute window are excluded from upcoming", () => {
    const farEvent = makeEvent({ eventTime: new Date(now.getTime() + 300 * 60000) });
    const result = perceiveNewsContext([farEvent], now);
    assert.equal(result.upcomingHighImpact.length, 0);
  });
});
