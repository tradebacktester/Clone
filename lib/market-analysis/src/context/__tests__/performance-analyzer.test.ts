import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { TradeRecord } from "../../context/types.js";
import {
  analyzeByRegime,
  analyzeBySession,
  analyzeByTrendDirection,
  analyzeByVolatility,
  analyzeByNewsStatus,
  analyzeByDayOfWeek,
  analyzeByMonth,
  analyzeBySpreadBand,
  analyzePerformance,
  overallStats,
  findStatForCondition,
} from "../../context/performance-analyzer.js";

function makeTrade(overrides: Partial<TradeRecord> = {}): TradeRecord {
  const pnl = overrides.pnl ?? 100;
  return {
    id: 1,
    pair: "EURUSD",
    direction: "buy",
    session: "london",
    regime: "trending",
    newsStatus: "safe",
    spreadPips: 0.5,
    pnl,
    riskRewardRatio: pnl > 0 ? 2 : -1,
    isWin: pnl > 0,
    isLoss: pnl < 0,
    openedAt: new Date("2024-03-14T10:00:00Z"),
    closedAt: new Date("2024-03-14T14:00:00Z"),
    trendDirection: "bullish",
    volatilityClass: "medium",
    liquidityQuality: "good",
    correlationRisk: "low",
    ...overrides,
  };
}

const winTrade = (overrides: Partial<TradeRecord> = {}) => makeTrade({ pnl: 200, riskRewardRatio: 2, isWin: true, isLoss: false, ...overrides });
const lossTrade = (overrides: Partial<TradeRecord> = {}) => makeTrade({ pnl: -100, riskRewardRatio: -1, isWin: false, isLoss: true, ...overrides });

describe("analyzeByRegime", () => {
  it("groups wins and losses by regime", () => {
    const trades = [
      winTrade({ regime: "trending" }),
      winTrade({ regime: "trending" }),
      lossTrade({ regime: "trending" }),
      winTrade({ regime: "ranging" }),
      lossTrade({ regime: "ranging" }),
      lossTrade({ regime: "ranging" }),
    ];
    const stats = analyzeByRegime(trades);
    const trending = stats.find(s => s.condition === "trending");
    const ranging = stats.find(s => s.condition === "ranging");
    assert.ok(trending, "should have trending stats");
    assert.ok(ranging, "should have ranging stats");
    assert.equal(trending!.sampleSize, 3);
    assert.ok(Math.abs(trending!.winRate - 66.67) < 0.1, `trending winRate should be ~66.67, got ${trending!.winRate}`);
    assert.equal(ranging!.sampleSize, 3);
    assert.ok(Math.abs(ranging!.winRate - 33.33) < 0.1, `ranging winRate should be ~33.33, got ${ranging!.winRate}`);
    assert.equal(trending!.dimension, "regime");
  });

  it("returns empty array for no trades", () => {
    assert.deepEqual(analyzeByRegime([]), []);
  });

  it("handles trades with null regime gracefully", () => {
    const trades = [winTrade({ regime: null })];
    const stats = analyzeByRegime(trades);
    assert.equal(stats.length, 0);
  });

  it("computes profitFactor correctly", () => {
    const trades = [
      winTrade({ pnl: 200, regime: "trending" }),
      lossTrade({ pnl: -100, regime: "trending" }),
    ];
    const stats = analyzeByRegime(trades);
    const trending = stats.find(s => s.condition === "trending");
    assert.ok(trending!.profitFactor >= 1.99, "profit factor should be ~2");
  });

  it("confidenceScore is 0-100", () => {
    const trades = Array.from({ length: 20 }, () => winTrade({ regime: "trending" }));
    const stats = analyzeByRegime(trades);
    assert.ok(stats[0]!.confidenceScore >= 0 && stats[0]!.confidenceScore <= 100);
  });
});

describe("analyzeBySession", () => {
  it("groups trades by session", () => {
    const trades = [
      winTrade({ session: "london" }),
      winTrade({ session: "london" }),
      lossTrade({ session: "new_york" }),
    ];
    const stats = analyzeBySession(trades);
    assert.equal(stats.length, 2);
    assert.ok(stats.every(s => s.dimension === "session"));
  });

  it("computes expectancy", () => {
    const trades = [winTrade({ session: "london" }), lossTrade({ session: "london" })];
    const [stat] = analyzeBySession(trades);
    assert.ok(typeof stat!.expectancy === "number");
  });
});

describe("analyzeByTrendDirection", () => {
  it("groups by trend direction", () => {
    const trades = [
      winTrade({ trendDirection: "bullish" }),
      winTrade({ trendDirection: "bullish" }),
      lossTrade({ trendDirection: "bearish" }),
    ];
    const stats = analyzeByTrendDirection(trades);
    assert.equal(stats.length, 2);
    assert.equal(stats.find(s => s.condition === "bullish")?.winRate, 100);
    assert.equal(stats.find(s => s.condition === "bearish")?.winRate, 0);
  });

  it("skips null trendDirection", () => {
    const trades = [winTrade({ trendDirection: null })];
    assert.equal(analyzeByTrendDirection(trades).length, 0);
  });
});

describe("analyzeByVolatility", () => {
  it("groups by volatility class", () => {
    const trades = [
      winTrade({ volatilityClass: "low" }),
      lossTrade({ volatilityClass: "high" }),
    ];
    const stats = analyzeByVolatility(trades);
    assert.equal(stats.length, 2);
    assert.ok(stats.every(s => s.dimension === "volatility"));
  });
});

describe("analyzeByNewsStatus", () => {
  it("groups by news status", () => {
    const trades = [
      winTrade({ newsStatus: "safe" }),
      winTrade({ newsStatus: "safe" }),
      lossTrade({ newsStatus: "cautious" }),
    ];
    const stats = analyzeByNewsStatus(trades);
    const safe = stats.find(s => s.condition === "safe");
    assert.equal(safe!.winRate, 100);
    assert.equal(safe!.sampleSize, 2);
  });
});

describe("analyzeByDayOfWeek", () => {
  it("groups by day of week", () => {
    const monday = new Date("2024-03-11T10:00:00Z");
    const tuesday = new Date("2024-03-12T10:00:00Z");
    const trades = [
      winTrade({ openedAt: monday }),
      lossTrade({ openedAt: tuesday }),
    ];
    const stats = analyzeByDayOfWeek(trades);
    assert.ok(stats.some(s => s.condition === "monday"));
    assert.ok(stats.some(s => s.condition === "tuesday"));
    assert.ok(stats.every(s => s.dimension === "day_of_week"));
  });
});

describe("analyzeByMonth", () => {
  it("groups by month name", () => {
    const march = new Date("2024-03-14T10:00:00Z");
    const april = new Date("2024-04-14T10:00:00Z");
    const trades = [winTrade({ openedAt: march }), lossTrade({ openedAt: april })];
    const stats = analyzeByMonth(trades);
    assert.ok(stats.some(s => s.condition === "march"));
    assert.ok(stats.some(s => s.condition === "april"));
  });
});

describe("analyzeBySpreadBand", () => {
  it("classifies spread bands correctly", () => {
    const trades = [
      winTrade({ spreadPips: 0.3 }),
      winTrade({ spreadPips: 1.0 }),
      lossTrade({ spreadPips: 2.0 }),
      lossTrade({ spreadPips: 5.0 }),
    ];
    const stats = analyzeBySpreadBand(trades);
    const conditions = stats.map(s => s.condition);
    assert.ok(conditions.includes("tight_spread"));
    assert.ok(conditions.includes("normal_spread"));
    assert.ok(conditions.includes("wide_spread"));
    assert.ok(conditions.includes("very_wide_spread"));
  });
});

describe("analyzePerformance", () => {
  it("returns multi-dimension stats", () => {
    const trades = [
      winTrade({ closedAt: new Date("2024-03-14T14:00:00Z") }),
      lossTrade({ closedAt: new Date("2024-03-14T15:00:00Z") }),
    ];
    const stats = analyzePerformance(trades);
    assert.ok(stats.length > 0);
    const dimensions = new Set(stats.map(s => s.dimension));
    assert.ok(dimensions.has("regime"));
    assert.ok(dimensions.has("session"));
  });

  it("excludes open trades", () => {
    const trades = [winTrade({ closedAt: null })];
    const stats = analyzePerformance(trades);
    assert.equal(stats.length, 0);
  });
});

describe("overallStats", () => {
  it("computes overall statistics", () => {
    const trades = [
      winTrade({ closedAt: new Date() }),
      winTrade({ closedAt: new Date() }),
      lossTrade({ closedAt: new Date() }),
    ];
    const stats = overallStats(trades);
    assert.equal(stats.dimension, "overall");
    assert.ok(Math.abs(stats.winRate - 66.67) < 0.1);
    assert.ok(stats.profitFactor > 1);
    assert.ok(stats.sampleSize === 3);
  });

  it("handles empty trade list", () => {
    const stats = overallStats([]);
    assert.equal(stats.sampleSize, 0);
    assert.equal(stats.winRate, 0);
  });
});

describe("findStatForCondition", () => {
  it("finds the matching stat", () => {
    const trades = [winTrade({ regime: "trending", closedAt: new Date() })];
    const allStats = analyzePerformance(trades);
    const found = findStatForCondition(allStats, "regime", "trending");
    assert.ok(found !== null);
    assert.equal(found!.condition, "trending");
  });

  it("returns null when not found", () => {
    assert.equal(findStatForCondition([], "regime", "ranging"), null);
  });
});
