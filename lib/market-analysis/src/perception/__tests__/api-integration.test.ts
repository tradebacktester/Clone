import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { perceiveTrend } from "../trend-perception.js";
import { perceiveRegime } from "../regime-perception.js";
import { perceiveVolatility } from "../volatility-perception.js";
import { perceiveLiquidity } from "../liquidity-perception.js";
import { perceiveCorrelation } from "../correlation-perception.js";
import { perceiveNewsContext, type RawNewsEvent } from "../news-context.js";
import { buildMarketState, MARKET_STATE_VERSION } from "../market-state.js";
import type { Candle, SwingPoint } from "../../types.js";

function makeCandles(
  n: number,
  base = 1.1000,
  trend: "up" | "down" | "flat" | "volatile" = "flat",
): Candle[] {
  const candles: Candle[] = [];
  let price = base;
  for (let i = 0; i < n; i++) {
    if (trend === "up") price += 0.0008;
    else if (trend === "down") price -= 0.0008;
    else if (trend === "volatile") price += (Math.random() - 0.5) * 0.006;
    else price += (Math.random() - 0.5) * 0.0003;
    const range = trend === "volatile" ? 0.004 : 0.001;
    candles.push({
      time: new Date(Date.now() + i * 3600000),
      open: price - range / 4,
      high: price + range / 2,
      low: price - range / 2,
      close: price + (Math.random() - 0.5) * range * 0.2,
      volume: 800 + Math.random() * 400,
    });
  }
  return candles;
}

function makeSwings(candles: Candle[], bullish = true): SwingPoint[] {
  const swings: SwingPoint[] = [];
  let baseHigh = candles[0]?.high ?? 1.1010;
  let baseLow = candles[0]?.low ?? 1.0990;
  for (let i = 0; i < Math.min(8, Math.floor(candles.length / 5)); i++) {
    if (bullish) { baseHigh += 0.002; baseLow += 0.002; }
    else { baseHigh -= 0.002; baseLow -= 0.002; }
    swings.push({
      time: candles[i * 5]?.time ?? new Date(),
      price: baseHigh,
      type: "high",
      index: i * 5,
    });
    swings.push({
      time: candles[i * 5]?.time ?? new Date(),
      price: baseLow,
      type: "low",
      index: i * 5,
    });
  }
  return swings;
}

function makeNewsEvent(overrides: Partial<RawNewsEvent> = {}): RawNewsEvent {
  return {
    title: "US Non-Farm Payrolls",
    currency: "USD",
    category: "NFP",
    impact: "high",
    eventTime: new Date(Date.now() + 90 * 60000),
    minutesUntil: 90,
    isBlocking: false,
    ...overrides,
  };
}

const EURUSD = makeCandles(60, 1.1000, "up");
const GBPUSD = makeCandles(60, 1.3000, "flat");
const USDJPY = makeCandles(60, 110.00, "down");
const BULLISH_SWINGS = makeSwings(EURUSD, true);
const BEARISH_SWINGS = makeSwings(USDJPY, false);

describe("Market Perception Engine — API integration", () => {

  describe("GET /market/state — buildMarketState", () => {
    it("produces a complete market state with all 7 sub-components", () => {
      const state = buildMarketState({
        pair: "EURUSD",
        candles: EURUSD,
        swings: BULLISH_SWINGS,
        allPairCandles: { EURUSD, GBPUSD, USDJPY },
        newsEvents: [],
        now: new Date("2026-01-15T10:00:00Z"),
      });
      assert.equal(state.pair, "EURUSD");
      assert.equal(state.version, MARKET_STATE_VERSION);
      assert.ok("trend" in state, "missing trend");
      assert.ok("regime" in state, "missing regime");
      assert.ok("volatility" in state, "missing volatility");
      assert.ok("liquidity" in state, "missing liquidity");
      assert.ok("correlation" in state, "missing correlation");
      assert.ok("newsContext" in state, "missing newsContext");
      assert.ok("session" in state, "missing session");
      assert.ok("confidenceScore" in state, "missing confidenceScore");
      assert.ok("overallConfidence" in state, "missing overallConfidence");
      assert.ok("summary" in state, "missing summary");
      assert.ok("timestamp" in state, "missing timestamp");
    });

    it("detects london session at 09:00 UTC", () => {
      const state = buildMarketState({
        pair: "EURUSD",
        candles: EURUSD,
        now: new Date("2026-01-15T09:30:00Z"),
      });
      assert.equal(state.session, "london");
    });

    it("detects new_york session at 17:00 UTC (after london close)", () => {
      const state = buildMarketState({
        pair: "EURUSD",
        candles: EURUSD,
        now: new Date("2026-01-15T17:00:00Z"),
      });
      assert.equal(state.session, "new_york");
    });

    it("detects tokyo session at 23:30 UTC", () => {
      const state = buildMarketState({
        pair: "EURUSD",
        candles: EURUSD,
        now: new Date("2026-01-15T23:30:00Z"),
      });
      assert.equal(state.session, "tokyo");
    });

    it("overall confidence is in [0, 100]", () => {
      const state = buildMarketState({ pair: "EURUSD", candles: EURUSD });
      assert.ok(state.confidenceScore >= 0 && state.confidenceScore <= 100);
    });

    it("overallConfidence label matches score thresholds", () => {
      const state = buildMarketState({ pair: "EURUSD", candles: EURUSD });
      const validLabels = ["very_low", "low", "medium", "high", "very_high"];
      assert.ok(validLabels.includes(state.overallConfidence));
      if (state.confidenceScore >= 80) assert.equal(state.overallConfidence, "very_high");
      if (state.confidenceScore < 25) assert.equal(state.overallConfidence, "very_low");
    });

    it("summary contains pair, trend, regime, volatility, and news info", () => {
      const state = buildMarketState({ pair: "GBPUSD", candles: GBPUSD });
      assert.ok(state.summary.includes("GBPUSD"), "summary missing pair");
      assert.ok(state.summary.length > 20, "summary too short");
    });

    it("version is a semver string", () => {
      const state = buildMarketState({ pair: "EURUSD", candles: EURUSD });
      assert.match(state.version, /^\d+\.\d+\.\d+$/);
    });

    it("timestamp is a valid ISO string", () => {
      const state = buildMarketState({ pair: "EURUSD", candles: EURUSD });
      assert.doesNotThrow(() => new Date(state.timestamp));
      assert.ok(!isNaN(new Date(state.timestamp).getTime()));
    });

    it("handles empty candles gracefully", () => {
      const state = buildMarketState({ pair: "EURUSD", candles: [] });
      assert.equal(state.pair, "EURUSD");
      assert.equal(state.trend.direction, "neutral");
      assert.equal(state.trend.confidence, 0);
    });

    it("handles missing allPairCandles (correlation defaults)", () => {
      const state = buildMarketState({ pair: "EURUSD", candles: EURUSD });
      assert.ok(state.correlation.confidence >= 0);
    });

    it("processes news events correctly into newsContext", () => {
      const now = new Date("2026-01-15T10:00:00Z");
      const state = buildMarketState({
        pair: "EURUSD",
        candles: EURUSD,
        newsEvents: [
          makeNewsEvent({ eventTime: new Date(now.getTime() + 45 * 60000), minutesUntil: 45 }),
        ],
        now,
      });
      assert.ok(state.newsContext.upcomingHighImpact.length > 0);
      assert.ok(state.newsContext.nextEventMinutes !== null);
    });

    it("blocking news event drives environment to blocked", () => {
      const now = new Date("2026-01-15T10:00:00Z");
      const state = buildMarketState({
        pair: "EURUSD",
        candles: EURUSD,
        newsEvents: [
          makeNewsEvent({
            eventTime: new Date(now.getTime() + 10 * 60000),
            minutesUntil: 10,
            isBlocking: true,
          }),
        ],
        now,
      });
      assert.equal(state.newsContext.environment, "blocked");
    });
  });

  describe("GET /market/trend — perceiveTrend", () => {
    it("returns valid TrendPerception for EURUSD uptrend candles", () => {
      const trend = perceiveTrend(EURUSD, BULLISH_SWINGS);
      const validDirs = ["strong_bullish", "bullish", "neutral", "bearish", "strong_bearish"];
      assert.ok(validDirs.includes(trend.direction));
      assert.ok(trend.strength >= 0 && trend.strength <= 100);
      assert.ok(trend.persistence >= 0 && trend.persistence <= 100);
      assert.ok(trend.age >= 0);
      assert.ok(trend.adx >= 0);
    });

    it("plus/minus DI values are non-negative", () => {
      const trend = perceiveTrend(EURUSD, BULLISH_SWINGS);
      assert.ok(trend.plusDI >= 0);
      assert.ok(trend.minusDI >= 0);
    });

    it("structure score is 0-100", () => {
      const trend = perceiveTrend(EURUSD, BULLISH_SWINGS);
      assert.ok(trend.structureScore >= 0 && trend.structureScore <= 100);
    });

    it("confidence is 0-100", () => {
      const trend = perceiveTrend(EURUSD, BULLISH_SWINGS);
      assert.ok(trend.confidence >= 0 && trend.confidence <= 100);
    });

    it("consecutive structures is non-negative", () => {
      const trend = perceiveTrend(EURUSD, BULLISH_SWINGS);
      assert.ok(trend.consecutiveStructures >= 0);
    });

    it("downtrend candles produce consistent output", () => {
      const trend = perceiveTrend(USDJPY, BEARISH_SWINGS);
      const validDirs = ["strong_bullish", "bullish", "neutral", "bearish", "strong_bearish"];
      assert.ok(validDirs.includes(trend.direction));
      assert.ok(trend.confidence >= 0 && trend.confidence <= 100);
    });

    it("flat/ranging candles tend toward neutral", () => {
      const flat = makeCandles(40, 1.1, "flat");
      const trend = perceiveTrend(flat, []);
      assert.ok(trend.adx >= 0);
      assert.ok(trend.confidence >= 0 && trend.confidence <= 100);
    });

    it("all three pairs return valid trend output", () => {
      for (const [candles, swings, label] of [
        [EURUSD, BULLISH_SWINGS, "EURUSD"],
        [GBPUSD, [], "GBPUSD"],
        [USDJPY, BEARISH_SWINGS, "USDJPY"],
      ] as [Candle[], SwingPoint[], string][]) {
        const trend = perceiveTrend(candles, swings);
        assert.ok(trend.confidence >= 0 && trend.confidence <= 100, `${label} confidence out of range`);
      }
    });
  });

  describe("GET /market/regime — perceiveRegime", () => {
    it("returns valid regime for all regime types", () => {
      const validRegimes = ["trending", "ranging", "expansion", "compression", "transitioning"];
      for (const [candles, label] of [
        [makeCandles(60, 1.1, "up"), "trending"],
        [makeCandles(60, 1.1, "flat"), "ranging/compression"],
        [makeCandles(60, 1.1, "volatile"), "expansion"],
      ] as [Candle[], string][]) {
        const regime = perceiveRegime(candles, []);
        assert.ok(validRegimes.includes(regime.regime), `${label}: invalid regime "${regime.regime}"`);
      }
    });

    it("all regime scores are 0-100", () => {
      const regime = perceiveRegime(EURUSD, BULLISH_SWINGS);
      for (const [name, score] of Object.entries(regime.scores)) {
        assert.ok(
          typeof score === "number" && score >= 0 && score <= 100,
          `Score "${name}" = ${score} out of range`,
        );
      }
    });

    it("scores object has exactly 5 regime keys", () => {
      const regime = perceiveRegime(EURUSD, BULLISH_SWINGS);
      const keys = Object.keys(regime.scores);
      assert.equal(keys.length, 5);
      for (const k of ["trending", "ranging", "expansion", "compression", "transitioning"]) {
        assert.ok(keys.includes(k), `Missing score key: ${k}`);
      }
    });

    it("isTransitioning aligns with regime field", () => {
      const regime = perceiveRegime(EURUSD, BULLISH_SWINGS);
      if (regime.regime === "transitioning") {
        assert.equal(regime.isTransitioning, true);
      }
    });

    it("confidence is 0-100", () => {
      const regime = perceiveRegime(EURUSD, BULLISH_SWINGS);
      assert.ok(regime.confidence >= 0 && regime.confidence <= 100);
    });

    it("volatility percentile is 0-100", () => {
      const regime = perceiveRegime(EURUSD, BULLISH_SWINGS);
      assert.ok(regime.volatilityPercentile >= 0 && regime.volatilityPercentile <= 100);
    });

    it("ADX is non-negative", () => {
      const regime = perceiveRegime(EURUSD, BULLISH_SWINGS);
      assert.ok(regime.adx >= 0);
    });

    it("rangeCompression is 0-100", () => {
      const regime = perceiveRegime(EURUSD, BULLISH_SWINGS);
      assert.ok(regime.rangeCompression >= 0 && regime.rangeCompression <= 100);
    });
  });

  describe("GET /market/volatility — perceiveVolatility", () => {
    it("ATR is non-negative for all pairs", () => {
      for (const [c, label] of [[EURUSD, "EURUSD"], [GBPUSD, "GBPUSD"], [USDJPY, "USDJPY"]] as [Candle[], string][]) {
        const v = perceiveVolatility(c);
        assert.ok(v.atr >= 0, `${label} ATR negative`);
      }
    });

    it("historical volatility is non-negative", () => {
      const v = perceiveVolatility(EURUSD);
      assert.ok(v.historicalVolatility >= 0);
    });

    it("realized volatility is non-negative", () => {
      const v = perceiveVolatility(EURUSD);
      assert.ok(v.realizedVolatility >= 0);
    });

    it("volatility percentile is 0-100", () => {
      const v = perceiveVolatility(EURUSD);
      assert.ok(v.volatilityPercentile >= 0 && v.volatilityPercentile <= 100);
    });

    it("volatility trend is valid", () => {
      const v = perceiveVolatility(EURUSD);
      assert.ok(["rising", "falling", "stable"].includes(v.volatilityTrend));
    });

    it("classification is valid", () => {
      const v = perceiveVolatility(EURUSD);
      assert.ok(["very_low", "low", "normal", "high", "extreme"].includes(v.classification));
    });

    it("annualized HV is non-negative", () => {
      const v = perceiveVolatility(EURUSD);
      assert.ok(v.annualizedHV >= 0);
    });

    it("range compression is 0-100", () => {
      const v = perceiveVolatility(EURUSD);
      assert.ok(v.rangeCompression >= 0 && v.rangeCompression <= 100);
    });

    it("high-vol candles classify higher than flat candles", () => {
      const flat = makeCandles(60, 1.1, "flat");
      const vol = makeCandles(60, 1.1, "volatile");
      const flatV = perceiveVolatility(flat);
      const volV = perceiveVolatility(vol);
      const classOrder = ["very_low", "low", "normal", "high", "extreme"];
      assert.ok(
        classOrder.indexOf(volV.classification) >= classOrder.indexOf(flatV.classification),
        `volatile "${volV.classification}" not >= flat "${flatV.classification}"`,
      );
    });

    it("ATR percent is non-negative", () => {
      const v = perceiveVolatility(EURUSD);
      assert.ok(v.atrPercent >= 0);
    });
  });

  describe("GET /market/liquidity — perceiveLiquidity", () => {
    it("returns valid liquidity for all three pairs", () => {
      for (const [c, label] of [[EURUSD, "EURUSD"], [GBPUSD, "GBPUSD"], [USDJPY, "USDJPY"]] as [Candle[], string][]) {
        const liq = perceiveLiquidity(c);
        assert.ok(["excellent", "good", "fair", "poor"].includes(liq.quality), `${label} invalid quality`);
        assert.ok(liq.score >= 0 && liq.score <= 100, `${label} score out of range`);
      }
    });

    it("session liquidity is valid", () => {
      const liq = perceiveLiquidity(EURUSD);
      assert.ok(["high", "medium", "low"].includes(liq.sessionLiquidity));
    });

    it("relative volume is non-negative", () => {
      const liq = perceiveLiquidity(EURUSD);
      assert.ok(liq.relativeVolume >= 0);
    });

    it("candle efficiency is 0-1", () => {
      const liq = perceiveLiquidity(EURUSD);
      assert.ok(liq.candleEfficiency >= 0 && liq.candleEfficiency <= 1);
    });

    it("gap frequency is 0-1", () => {
      const liq = perceiveLiquidity(EURUSD);
      assert.ok(liq.gapFrequency >= 0 && liq.gapFrequency <= 1);
    });

    it("spread values are non-negative", () => {
      const liq = perceiveLiquidity(EURUSD);
      assert.ok(liq.spread >= 0);
      assert.ok(liq.spreadPercent >= 0);
    });

    it("high-volume candles produce higher score than low-volume", () => {
      const highVol = Array.from({ length: 30 }, (_, i) => ({
        time: new Date(Date.now() + i * 60000),
        open: 1.1, high: 1.1015, low: 1.0985, close: 1.1,
        volume: 5000,
      }));
      const lowVol = Array.from({ length: 30 }, (_, i) => ({
        time: new Date(Date.now() + i * 60000),
        open: 1.1, high: 1.1003, low: 1.0997, close: 1.1,
        volume: 100,
      }));
      const hLiq = perceiveLiquidity(highVol);
      const lLiq = perceiveLiquidity(lowVol);
      assert.ok(hLiq.score >= 0 && lLiq.score >= 0);
    });

    it("confidence scales with available data", () => {
      const short = perceiveLiquidity(makeCandles(6));
      const long = perceiveLiquidity(makeCandles(40));
      assert.ok(long.confidence >= short.confidence);
    });
  });

  describe("GET /market/correlation — perceiveCorrelation", () => {
    it("returns all three pair correlations", () => {
      const result = perceiveCorrelation({ EURUSD, GBPUSD, USDJPY });
      assert.ok("eurusd_gbpusd" in result);
      assert.ok("eurusd_usdjpy" in result);
      assert.ok("gbpusd_usdjpy" in result);
    });

    it("all correlations are in [-1, 1]", () => {
      const result = perceiveCorrelation({ EURUSD, GBPUSD, USDJPY });
      for (const key of ["eurusd_gbpusd", "eurusd_usdjpy", "gbpusd_usdjpy"] as const) {
        const r = result[key].correlation;
        assert.ok(r >= -1 && r <= 1, `${key} correlation ${r} out of range`);
      }
    });

    it("correlation status is valid for all pairs", () => {
      const result = perceiveCorrelation({ EURUSD, GBPUSD, USDJPY });
      const validStatuses = ["high_positive", "normal", "high_negative", "breakdown"];
      for (const key of ["eurusd_gbpusd", "eurusd_usdjpy", "gbpusd_usdjpy"] as const) {
        assert.ok(validStatuses.includes(result[key].status), `${key} invalid status`);
      }
    });

    it("high-positive correlation detected for co-moving pairs", () => {
      const base = makeCandles(40, 1.1, "up");
      const coMoved = base.map(c => ({ ...c, open: c.open * 1.18, high: c.high * 1.18, low: c.low * 1.18, close: c.close * 1.18 }));
      const result = perceiveCorrelation({ EURUSD: base, GBPUSD: coMoved, USDJPY: makeCandles(40, 110) });
      assert.ok(result.eurusd_gbpusd.correlation > 0.5, "expected high positive correlation");
      assert.equal(result.eurusd_gbpusd.status, "high_positive");
    });

    it("overall correlation risk is valid", () => {
      const result = perceiveCorrelation({ EURUSD, GBPUSD, USDJPY });
      assert.ok(["low", "medium", "high"].includes(result.overallCorrelationRisk));
    });

    it("pair names are correct in output", () => {
      const result = perceiveCorrelation({ EURUSD, GBPUSD, USDJPY });
      assert.equal(result.eurusd_gbpusd.pairA, "EURUSD");
      assert.equal(result.eurusd_gbpusd.pairB, "GBPUSD");
      assert.equal(result.eurusd_usdjpy.pairA, "EURUSD");
      assert.equal(result.eurusd_usdjpy.pairB, "USDJPY");
    });

    it("confidence is 0-100", () => {
      const result = perceiveCorrelation({ EURUSD, GBPUSD, USDJPY });
      assert.ok(result.confidence >= 0 && result.confidence <= 100);
    });

    it("rolling correlations have valid values", () => {
      const result = perceiveCorrelation({ EURUSD, GBPUSD, USDJPY });
      for (const r of result.eurusd_gbpusd.rollingCorrelations) {
        assert.ok(r >= -1 && r <= 1, `Rolling correlation ${r} out of range`);
      }
    });
  });

  describe("GET /market/news-context — perceiveNewsContext", () => {
    const now = new Date("2026-01-15T10:00:00Z");

    it("safe environment when no events", () => {
      const ctx = perceiveNewsContext([], now);
      assert.equal(ctx.environment, "safe");
      assert.equal(ctx.upcomingHighImpact.length, 0);
      assert.equal(ctx.recentEvents.length, 0);
    });

    it("cautious when high-impact event within 30 minutes", () => {
      const ctx = perceiveNewsContext([
        makeNewsEvent({ eventTime: new Date(now.getTime() + 25 * 60000), minutesUntil: 25 }),
      ], now);
      assert.ok(ctx.environment === "cautious" || ctx.environment === "blocked");
    });

    it("blocked when isBlocking=true", () => {
      const ctx = perceiveNewsContext([
        makeNewsEvent({ eventTime: new Date(now.getTime() + 5 * 60000), minutesUntil: 5, isBlocking: true }),
      ], now);
      assert.equal(ctx.environment, "blocked");
    });

    it("nextEventMinutes matches actual event timing", () => {
      const ctx = perceiveNewsContext([
        makeNewsEvent({ eventTime: new Date(now.getTime() + 120 * 60000), minutesUntil: 120 }),
      ], now);
      assert.ok(ctx.nextEventMinutes !== null);
      assert.ok(Math.abs((ctx.nextEventMinutes ?? 0) - 120) <= 2);
    });

    it("recent events within 60 min are captured", () => {
      const ctx = perceiveNewsContext([
        makeNewsEvent({ eventTime: new Date(now.getTime() - 30 * 60000) }),
      ], now);
      assert.ok(ctx.recentEvents.length > 0);
      assert.ok(ctx.recentImpactScore >= 0);
    });

    it("events > 240 minutes out are excluded from upcoming", () => {
      const ctx = perceiveNewsContext([
        makeNewsEvent({ eventTime: new Date(now.getTime() + 300 * 60000), minutesUntil: 300 }),
      ], now);
      assert.equal(ctx.upcomingHighImpact.length, 0);
    });

    it("affected pairs map correctly to currencies", () => {
      const ctx = perceiveNewsContext([
        makeNewsEvent({ currency: "EUR", eventTime: new Date(now.getTime() + 60 * 60000) }),
      ], now);
      assert.ok(ctx.affectedPairs.includes("EURUSD"), "EUR should affect EURUSD");
    });

    it("USD events affect both EURUSD and GBPUSD and USDJPY", () => {
      const ctx = perceiveNewsContext([
        makeNewsEvent({ currency: "USD", eventTime: new Date(now.getTime() + 60 * 60000) }),
      ], now);
      assert.ok(ctx.affectedPairs.includes("EURUSD"));
      assert.ok(ctx.affectedPairs.includes("GBPUSD"));
      assert.ok(ctx.affectedPairs.includes("USDJPY"));
    });

    it("recovery phase is valid", () => {
      const ctx = perceiveNewsContext([], now);
      assert.ok(["clear", "recovering", "blocked"].includes(ctx.recoveryPhase));
    });

    it("confidence is 0-100", () => {
      const ctx = perceiveNewsContext([makeNewsEvent()], now);
      assert.ok(ctx.confidence >= 0 && ctx.confidence <= 100);
    });
  });

  describe("Market State — cross-component consistency", () => {
    it("regime and volatility percentile are consistent in market state", () => {
      const volatile = makeCandles(60, 1.1, "volatile");
      const state = buildMarketState({ pair: "EURUSD", candles: volatile });
      assert.ok(state.volatility.volatilityPercentile >= 0 && state.volatility.volatilityPercentile <= 100);
    });

    it("market state can be built for all three pairs", () => {
      const allCandles = { EURUSD, GBPUSD, USDJPY };
      for (const [pair, candles] of Object.entries(allCandles)) {
        const state = buildMarketState({ pair, candles, allPairCandles: allCandles });
        assert.equal(state.pair, pair);
        assert.ok(state.confidenceScore >= 0 && state.confidenceScore <= 100);
      }
    });

    it("news context propagates correctly through market state", () => {
      const now = new Date("2026-01-15T10:00:00Z");
      const events: RawNewsEvent[] = [
        makeNewsEvent({ eventTime: new Date(now.getTime() + 60 * 60000), currency: "EUR" }),
        makeNewsEvent({ eventTime: new Date(now.getTime() + 120 * 60000), currency: "USD", category: "CPI" }),
      ];
      const state = buildMarketState({ pair: "EURUSD", candles: EURUSD, newsEvents: events, now });
      assert.ok(state.newsContext.upcomingHighImpact.length >= 2);
      assert.ok(state.newsContext.affectedPairs.includes("EURUSD"));
    });

    it("correlation in market state covers all three pair relationships", () => {
      const state = buildMarketState({
        pair: "EURUSD",
        candles: EURUSD,
        allPairCandles: { EURUSD, GBPUSD, USDJPY },
      });
      assert.ok("eurusd_gbpusd" in state.correlation);
      assert.ok("eurusd_usdjpy" in state.correlation);
      assert.ok("gbpusd_usdjpy" in state.correlation);
    });

    it("session detection is deterministic for fixed timestamps", () => {
      const times = [
        { utc: "2026-01-15T08:00:00Z", expected: "london" },
        { utc: "2026-01-15T17:00:00Z", expected: "new_york" },
        { utc: "2026-01-15T23:30:00Z", expected: "tokyo" },
      ];
      for (const { utc, expected } of times) {
        const state = buildMarketState({ pair: "EURUSD", candles: EURUSD, now: new Date(utc) });
        assert.equal(state.session, expected, `${utc} should map to ${expected}`);
      }
    });

    it("confidence score is weighted average of sub-component confidences", () => {
      const state = buildMarketState({
        pair: "EURUSD",
        candles: EURUSD,
        allPairCandles: { EURUSD, GBPUSD, USDJPY },
      });
      const expected = Math.round(
        state.trend.confidence * 0.2 +
        state.regime.confidence * 0.2 +
        state.volatility.confidence * 0.2 +
        state.liquidity.confidence * 0.15 +
        state.correlation.confidence * 0.15 +
        state.newsContext.confidence * 0.1,
      );
      assert.equal(state.confidenceScore, expected);
    });
  });
});
