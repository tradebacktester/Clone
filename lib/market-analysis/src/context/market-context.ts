import type {
  TradeRecord,
  SnapshotRecord,
  MarketContextScore,
  MarketContextAnalysis,
  ConditionStats,
  HistoricalMatch,
  StabilityAnalysis,
  EnvironmentClass,
} from "./types.js";
import { analyzePerformance, overallStats } from "./performance-analyzer.js";
import { scoreMarketContext } from "./context-scorer.js";
import type { CurrentConditions } from "./context-scorer.js";
import { findHistoricalMatches, aggregateMatchOutcomes } from "./historical-matcher.js";
import type { CurrentFeatures } from "./historical-matcher.js";
import { analyzeStability } from "./stability-analyzer.js";
import { classifyEnvironment } from "./environment-classifier.js";

export interface MarketContextInput {
  pair: string;
  currentRegime: string;
  currentTrendDirection: string;
  currentTrendStrength: number;
  currentVolatilityClass: string;
  currentVolatilityPercentile: number;
  currentLiquidityQuality: string;
  currentLiquidityScore: number;
  currentCorrelationRisk: string;
  currentSession: string;
  currentNewsEnvironment: string;
  trades: TradeRecord[];
  snapshots: SnapshotRecord[];
  now?: Date;
}

export interface FullMarketContext {
  pair: string;
  timestamp: string;
  mcs: MarketContextScore;
  stability: StabilityAnalysis;
  classification: EnvironmentClass;
  classificationEvidence: string[];
  adjustedScore: number;
  performanceByDimension: ConditionStats[];
  overallPerformance: ConditionStats;
  historicalMatches: HistoricalMatch[];
  matchSummary: ReturnType<typeof aggregateMatchOutcomes>;
  summary: string;
}

function buildSummary(
  pair: string,
  mcs: MarketContextScore,
  classification: EnvironmentClass,
  stability: StabilityAnalysis,
  matches: HistoricalMatch[],
): string {
  const parts: string[] = [];
  parts.push(`${pair} market context score is ${mcs.score}/100 (${classification.toUpperCase()}).`);
  parts.push(`Market stability is ${stability.label} (${stability.overallStability}/100).`);
  if (matches.length > 0) {
    const bestMatch = matches[0]!;
    parts.push(`Best historical match: ${bestMatch.date} — ${bestMatch.similarityScore}% similar, outcome was ${bestMatch.outcome}.`);
  } else {
    parts.push("No sufficiently similar historical periods found.");
  }
  if (stability.warnings.length > 0) {
    parts.push(`Warning: ${stability.warnings[0]}`);
  }
  return parts.join(" ");
}

export function buildMarketContext(input: MarketContextInput): FullMarketContext {
  const now = input.now ?? new Date();
  const timestamp = now.toISOString();

  const allStats = analyzePerformance(input.trades);
  const overall = overallStats(input.trades);

  const conditions: CurrentConditions = {
    regime: input.currentRegime,
    trendDirection: input.currentTrendDirection,
    volatilityClassification: input.currentVolatilityClass,
    liquidityQuality: input.currentLiquidityQuality,
    correlationRisk: input.currentCorrelationRisk,
    session: input.currentSession,
    newsEnvironment: input.currentNewsEnvironment,
  };

  const mcs = scoreMarketContext(allStats, conditions, overall.sampleSize);

  const currentFeatures: CurrentFeatures = {
    regime: input.currentRegime,
    trendDirection: input.currentTrendDirection,
    trendStrength: input.currentTrendStrength,
    volatilityClassification: input.currentVolatilityClass,
    volatilityPercentile: input.currentVolatilityPercentile,
    session: input.currentSession,
    liquidityQuality: input.currentLiquidityQuality,
    newsEnvironment: input.currentNewsEnvironment,
  };

  const historicalMatches = findHistoricalMatches(currentFeatures, input.snapshots, 10, 30);
  const matchSummary = aggregateMatchOutcomes(historicalMatches);

  const stability = analyzeStability(
    input.snapshots,
    input.currentRegime,
    input.currentTrendDirection,
    now,
  );

  const { classification, evidence: classificationEvidence, adjustedScore } = classifyEnvironment(mcs, stability);

  const summary = buildSummary(input.pair, mcs, classification, stability, historicalMatches);

  return {
    pair: input.pair,
    timestamp,
    mcs,
    stability,
    classification,
    classificationEvidence,
    adjustedScore,
    performanceByDimension: allStats,
    overallPerformance: overall,
    historicalMatches,
    matchSummary,
    summary,
  };
}

export type { MarketContextScore, StabilityAnalysis, HistoricalMatch, ConditionStats, EnvironmentClass };
