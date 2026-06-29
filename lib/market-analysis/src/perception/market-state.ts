import type { Candle, SwingPoint } from "../types.js";
import { perceiveTrend, type TrendPerception } from "./trend-perception.js";
import { perceiveRegime, type RegimePerception } from "./regime-perception.js";
import { perceiveVolatility, type VolatilityPerception } from "./volatility-perception.js";
import { perceiveLiquidity, type LiquidityPerception } from "./liquidity-perception.js";
import { perceiveCorrelation, type CorrelationPerception } from "./correlation-perception.js";
import { perceiveNewsContext, type NewsContext, type RawNewsEvent } from "./news-context.js";

export const MARKET_STATE_VERSION = "1.0.0";

export type TradingSession = "london" | "new_york" | "tokyo" | "sydney" | "off_hours";
export type OverallConfidence = "very_low" | "low" | "medium" | "high" | "very_high";

export interface MarketStateInput {
  pair: string;
  candles: Candle[];
  swings?: SwingPoint[];
  allPairCandles?: Partial<Record<string, Candle[]>>;
  newsEvents?: RawNewsEvent[];
  now?: Date;
}

export interface MarketState {
  pair: string;
  timestamp: string;
  version: string;
  session: TradingSession;
  trend: TrendPerception;
  regime: RegimePerception;
  volatility: VolatilityPerception;
  liquidity: LiquidityPerception;
  correlation: CorrelationPerception;
  newsContext: NewsContext;
  overallConfidence: OverallConfidence;
  confidenceScore: number;
  summary: string;
}

function detectSession(now: Date): TradingSession {
  const utcHour = now.getUTCHours();
  if (utcHour >= 7 && utcHour < 16) return "london";
  if (utcHour >= 13 && utcHour < 22) return "new_york";
  if (utcHour >= 23 || utcHour < 8) return "tokyo";
  if (utcHour >= 21 || utcHour < 6) return "sydney";
  return "off_hours";
}

function calcOverallConfidence(
  trend: TrendPerception,
  regime: RegimePerception,
  volatility: VolatilityPerception,
  liquidity: LiquidityPerception,
  correlation: CorrelationPerception,
  news: NewsContext,
): number {
  return Math.round(
    trend.confidence * 0.2 +
    regime.confidence * 0.2 +
    volatility.confidence * 0.2 +
    liquidity.confidence * 0.15 +
    correlation.confidence * 0.15 +
    news.confidence * 0.1,
  );
}

function classifyOverallConfidence(score: number): OverallConfidence {
  if (score >= 80) return "very_high";
  if (score >= 65) return "high";
  if (score >= 45) return "medium";
  if (score >= 25) return "low";
  return "very_low";
}

function buildSummary(
  pair: string,
  session: TradingSession,
  trend: TrendPerception,
  regime: RegimePerception,
  volatility: VolatilityPerception,
  news: NewsContext,
): string {
  const parts: string[] = [
    `${pair} | ${session.replace("_", " ").toUpperCase()} session`,
    `Trend: ${trend.direction.replace(/_/g, " ")} (strength ${trend.strength})`,
    `Regime: ${regime.regime} (confidence ${regime.confidence}%)`,
    `Volatility: ${volatility.classification.replace(/_/g, " ")} (percentile ${volatility.volatilityPercentile})`,
    `News: ${news.environment}`,
  ];
  return parts.join(" | ");
}

export function buildMarketState(input: MarketStateInput): MarketState {
  const {
    pair,
    candles,
    swings = [],
    allPairCandles = {},
    newsEvents = [],
    now = new Date(),
  } = input;

  const trend = perceiveTrend(candles, swings);
  const regime = perceiveRegime(candles, swings);
  const volatility = perceiveVolatility(candles);
  const liquidity = perceiveLiquidity(candles);

  const pairCandlesWithSelf: Partial<Record<string, Candle[]>> = {
    ...allPairCandles,
    [pair]: candles,
  };
  const correlation = perceiveCorrelation(pairCandlesWithSelf);
  const newsContext = perceiveNewsContext(newsEvents, now);

  const session = detectSession(now);
  const confidenceScore = calcOverallConfidence(
    trend, regime, volatility, liquidity, correlation, newsContext,
  );
  const overallConfidence = classifyOverallConfidence(confidenceScore);

  const summary = buildSummary(pair, session, trend, regime, volatility, newsContext);

  return {
    pair,
    timestamp: now.toISOString(),
    version: MARKET_STATE_VERSION,
    session,
    trend,
    regime,
    volatility,
    liquidity,
    correlation,
    newsContext,
    overallConfidence,
    confidenceScore,
    summary,
  };
}

export type { TrendPerception, RegimePerception, VolatilityPerception, LiquidityPerception, CorrelationPerception, NewsContext };
