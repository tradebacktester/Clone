import type {
  ConditionStats,
  MCSComponent,
  MarketContextScore,
  EnvironmentClass,
} from "./types.js";
import {
  MCS_WEIGHTS,
  ENVIRONMENT_THRESHOLDS,
  MIN_SAMPLE_FOR_SCORE,
  MIN_SAMPLE_FOR_CONFIDENCE,
} from "./types.js";
import { findStatForCondition } from "./performance-analyzer.js";

export interface CurrentConditions {
  regime: string;
  trendDirection: string;
  volatilityClassification: string;
  liquidityQuality: string;
  correlationRisk: string;
  session: string;
  newsEnvironment: string;
}

function statsToScore(stats: ConditionStats | null): { score: number; confidence: number } {
  if (!stats || stats.sampleSize < MIN_SAMPLE_FOR_SCORE) {
    return { score: 50, confidence: 0 };
  }
  const winRateScore = stats.winRate;
  const rrBonus = Math.min(20, Math.max(-20, (stats.avgRR - 1.0) * 20));
  const pfBonus = Math.min(10, Math.max(-10, (stats.profitFactor - 1.0) * 5));
  const ddPenalty = Math.min(15, stats.maxDrawdown * 0.3);
  const raw = winRateScore * 0.6 + (50 + rrBonus + pfBonus - ddPenalty) * 0.4;
  const score = Math.round(Math.min(100, Math.max(0, raw)));
  const confidence = Math.min(100, Math.round((stats.sampleSize / MIN_SAMPLE_FOR_CONFIDENCE) * stats.confidenceScore));
  return { score, confidence };
}

function newsEnvironmentToScore(env: string): { score: number; confidence: number } {
  const map: Record<string, number> = {
    safe: 80,
    cautious: 45,
    blocked: 15,
  };
  return { score: map[env] ?? 50, confidence: 90 };
}

function correlationRiskToScore(risk: string): { score: number; confidence: number } {
  const map: Record<string, number> = {
    low: 80,
    moderate: 60,
    high: 35,
    extreme: 15,
  };
  return { score: map[risk] ?? 50, confidence: 85 };
}

function buildEvidence(
  condition: string,
  stats: ConditionStats | null,
  score: number,
): string {
  if (!stats || stats.sampleSize < MIN_SAMPLE_FOR_SCORE) {
    return `${condition}: insufficient data (${stats?.sampleSize ?? 0} trades) — neutral score applied`;
  }
  return `${condition}: ${stats.winRate.toFixed(1)}% win rate, ${stats.avgRR.toFixed(2)}R avg, ${stats.sampleSize} trades → score ${score}`;
}

export function scoreMarketContext(
  allStats: ConditionStats[],
  conditions: CurrentConditions,
  totalTrades: number,
): MarketContextScore {
  const now = new Date().toISOString();
  const components: MCSComponent[] = [];

  const regimeStat = findStatForCondition(allStats, "regime", conditions.regime);
  const { score: regimeScore, confidence: regimeConf } = statsToScore(regimeStat);
  components.push({
    name: "Regime Performance",
    dimension: "regime",
    condition: conditions.regime,
    score: regimeScore,
    weight: MCS_WEIGHTS.regime,
    weightedScore: regimeScore * MCS_WEIGHTS.regime,
    evidence: buildEvidence(conditions.regime, regimeStat, regimeScore),
    sampleSize: regimeStat?.sampleSize ?? 0,
    confidence: regimeConf,
  });

  const sessionStat = findStatForCondition(allStats, "session", conditions.session);
  const { score: sessionScore, confidence: sessionConf } = statsToScore(sessionStat);
  components.push({
    name: "Session Performance",
    dimension: "session",
    condition: conditions.session,
    score: sessionScore,
    weight: MCS_WEIGHTS.session,
    weightedScore: sessionScore * MCS_WEIGHTS.session,
    evidence: buildEvidence(conditions.session, sessionStat, sessionScore),
    sampleSize: sessionStat?.sampleSize ?? 0,
    confidence: sessionConf,
  });

  const trendStat = findStatForCondition(allStats, "trend", conditions.trendDirection);
  const { score: trendScore, confidence: trendConf } = statsToScore(trendStat);
  components.push({
    name: "Trend Performance",
    dimension: "trend",
    condition: conditions.trendDirection,
    score: trendScore,
    weight: MCS_WEIGHTS.trend,
    weightedScore: trendScore * MCS_WEIGHTS.trend,
    evidence: buildEvidence(conditions.trendDirection, trendStat, trendScore),
    sampleSize: trendStat?.sampleSize ?? 0,
    confidence: trendConf,
  });

  const volatilityStat = findStatForCondition(allStats, "volatility", conditions.volatilityClassification);
  const { score: volatilityScore, confidence: volatilityConf } = statsToScore(volatilityStat);
  components.push({
    name: "Volatility Performance",
    dimension: "volatility",
    condition: conditions.volatilityClassification,
    score: volatilityScore,
    weight: MCS_WEIGHTS.volatility,
    weightedScore: volatilityScore * MCS_WEIGHTS.volatility,
    evidence: buildEvidence(conditions.volatilityClassification, volatilityStat, volatilityScore),
    sampleSize: volatilityStat?.sampleSize ?? 0,
    confidence: volatilityConf,
  });

  const liquidityStat = findStatForCondition(allStats, "liquidity", conditions.liquidityQuality);
  const { score: liquidityScore, confidence: liquidityConf } = statsToScore(liquidityStat);
  components.push({
    name: "Liquidity Performance",
    dimension: "liquidity",
    condition: conditions.liquidityQuality,
    score: liquidityScore,
    weight: MCS_WEIGHTS.liquidity,
    weightedScore: liquidityScore * MCS_WEIGHTS.liquidity,
    evidence: buildEvidence(conditions.liquidityQuality, liquidityStat, liquidityScore),
    sampleSize: liquidityStat?.sampleSize ?? 0,
    confidence: liquidityConf,
  });

  const { score: corrScore, confidence: corrConf } = correlationRiskToScore(conditions.correlationRisk);
  components.push({
    name: "Correlation Risk",
    dimension: "correlation",
    condition: conditions.correlationRisk,
    score: corrScore,
    weight: MCS_WEIGHTS.correlation,
    weightedScore: corrScore * MCS_WEIGHTS.correlation,
    evidence: `Correlation risk is ${conditions.correlationRisk} → score ${corrScore}`,
    sampleSize: 0,
    confidence: corrConf,
  });

  const { score: newsScore, confidence: newsConf } = newsEnvironmentToScore(conditions.newsEnvironment);
  components.push({
    name: "News Context",
    dimension: "news",
    condition: conditions.newsEnvironment,
    score: newsScore,
    weight: MCS_WEIGHTS.news,
    weightedScore: newsScore * MCS_WEIGHTS.news,
    evidence: `News environment is ${conditions.newsEnvironment} → score ${newsScore}`,
    sampleSize: 0,
    confidence: newsConf,
  });

  const histConfScore = Math.min(100, Math.round((totalTrades / MIN_SAMPLE_FOR_CONFIDENCE) * 80));
  components.push({
    name: "Historical Confidence",
    dimension: "historicalConfidence",
    condition: `${totalTrades} trades`,
    score: histConfScore,
    weight: MCS_WEIGHTS.historicalConfidence,
    weightedScore: histConfScore * MCS_WEIGHTS.historicalConfidence,
    evidence: `${totalTrades} closed trades in history → confidence score ${histConfScore}`,
    sampleSize: totalTrades,
    confidence: histConfScore,
  });

  const totalWeightedScore = components.reduce((s, c) => s + c.weightedScore, 0);
  const score = Math.round(Math.min(100, Math.max(0, totalWeightedScore)));
  const label = scoreToLabel(score);
  const confidence = Math.round(
    components.reduce((s, c) => s + c.confidence * c.weight, 0),
  );

  const evidence = components.map(c => c.evidence);

  return {
    score,
    label,
    components,
    totalWeightedScore: Math.round(totalWeightedScore * 100) / 100,
    confidence,
    sampleSize: totalTrades,
    timestamp: now,
    evidence,
  };
}

export function scoreToLabel(score: number): EnvironmentClass {
  if (score >= ENVIRONMENT_THRESHOLDS.excellent) return "excellent";
  if (score >= ENVIRONMENT_THRESHOLDS.good) return "good";
  if (score >= ENVIRONMENT_THRESHOLDS.neutral) return "neutral";
  if (score >= ENVIRONMENT_THRESHOLDS.difficult) return "difficult";
  return "dangerous";
}
