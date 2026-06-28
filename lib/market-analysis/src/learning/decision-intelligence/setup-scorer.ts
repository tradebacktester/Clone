// ─── Setup Scorer — Trade Intelligence Score (TIS) ────────────────────────────
// Computes 15-component TIS (0–100) for a given setup.
// Each component is transparent, weighted, and reproducible.
// Advisory only — no trade execution, no strategy modification.

import { clamp } from "../learning-validation/data-validator.js";
import { wilsonLowerBound } from "../learning-confidence/confidence-engine.js";
import type { CurrentSetup, TisComponent, TisComponentKey } from "./types.js";
import { TIS_WEIGHTS } from "./types.js";
import type { ExtractedFeature } from "../learning-core/types.js";
import type { MatchResult } from "./historical-matcher.js";

// ─── Component explanations ────────────────────────────────────────────────────

function explain(key: TisComponentKey, score: number, detail: string): string {
  const pct = score.toFixed(1);
  return `[${key}] Score: ${pct}/100 — ${detail}`;
}

// ─── Individual component scorers ─────────────────────────────────────────────

function scorePatternPerformance(
  features: ExtractedFeature[],
  setup: CurrentSetup,
): { score: number; explanation: string; evidence: number } {
  // Find all trades in same session and regime
  const matched = features.filter(
    f => f.session === setup.session && f.marketRegime === setup.regime,
  );
  const n = matched.length;
  if (n < 3) {
    return { score: 40, explanation: `Insufficient data for ${setup.session}/${setup.regime} pattern`, evidence: n };
  }
  const wins = matched.filter(f => f.outcome === "win").length;
  const winRate = wins / n;
  const score = clamp(winRate * 100, 0, 100);
  return {
    score,
    explanation: `${setup.session}+${setup.regime}: ${wins}W/${n-wins}L = ${(winRate*100).toFixed(1)}% win rate (n=${n})`,
    evidence: n,
  };
}

function scoreHistoricalWinRate(match: MatchResult): { score: number; explanation: string; evidence: number } {
  const n = match.evidenceCount;
  if (n < 3) {
    return { score: 40, explanation: `Only ${n} similar historical trades found`, evidence: n };
  }
  const wilson = wilsonLowerBound(match.similarWins.length + (n > match.similarWins.length + match.similarLosses.length ? 0 : 0), n);
  const winRate = match.historicalWinRate;
  const score   = clamp(winRate * 100, 0, 100);
  return {
    score,
    explanation: `${(winRate*100).toFixed(1)}% historical win rate across ${n} similar setups. Wilson lower bound: ${(wilson*100).toFixed(1)}%`,
    evidence: n,
  };
}

function scoreSampleSize(evidence: number): { score: number; explanation: string } {
  // Asymptotically approaches 100 at 50+ samples
  const score = clamp((evidence / 50) * 100, 0, 100);
  if (evidence < 5) {
    return { score, explanation: `Critical: only ${evidence} similar trades — conclusions unreliable` };
  }
  if (evidence < 15) {
    return { score, explanation: `${evidence} similar trades — results possible but uncertain` };
  }
  return { score, explanation: `${evidence} similar trades — solid evidence base` };
}

function scoreFeatureImportance(setup: CurrentSetup): { score: number; explanation: string } {
  // Score based on how many setup features are in the "high" favorable range
  const checks = [
    { value: Math.max(setup.supplyQuality, setup.demandQuality), threshold: 65, name: "zone quality" },
    { value: setup.liquidityScore, threshold: 60, name: "liquidity" },
    { value: setup.amdScore, threshold: 60, name: "AMD" },
    { value: setup.confirmationQuality, threshold: 60, name: "confirmation" },
    { value: setup.setupScore, threshold: 65, name: "setup score" },
    { value: setup.tqi, threshold: 60, name: "TQI" },
  ];
  const favorable = checks.filter(c => c.value >= c.threshold);
  const score = clamp((favorable.length / checks.length) * 100, 0, 100);
  const favorableNames = favorable.map(c => c.name).join(", ");
  return {
    score,
    explanation: `${favorable.length}/${checks.length} key features favorable${favorableNames ? `: ${favorableNames}` : ""}`,
  };
}

function scoreConfidence(
  features: ExtractedFeature[],
  setup: CurrentSetup,
): { score: number; explanation: string; evidence: number } {
  const pairFeatures = features.filter(f => f.pair === setup.pair);
  const n = pairFeatures.length;
  if (n < 5) {
    return { score: 40, explanation: `Only ${n} ${setup.pair} trades in history`, evidence: n };
  }
  const avgConf = pairFeatures.reduce((s, f) => s + f.confidence, 0) / n;
  const score   = clamp(avgConf, 0, 100);
  return {
    score,
    explanation: `Average model confidence on ${setup.pair}: ${avgConf.toFixed(1)}% (n=${n})`,
    evidence: n,
  };
}

function scoreMarketRegimeMatch(
  features: ExtractedFeature[],
  setup: CurrentSetup,
): { score: number; explanation: string; evidence: number } {
  const regimeFeatures = features.filter(f => f.marketRegime === setup.regime);
  const n = regimeFeatures.length;
  if (n < 3) {
    return { score: 45, explanation: `Only ${n} trades in ${setup.regime} regime`, evidence: n };
  }
  const wins    = regimeFeatures.filter(f => f.outcome === "win").length;
  const winRate = wins / n;
  const score   = clamp(winRate * 100, 0, 100);
  return {
    score,
    explanation: `${setup.regime} regime: ${(winRate*100).toFixed(1)}% win rate (${wins}W/${n-wins}L, n=${n})`,
    evidence: n,
  };
}

function scoreSessionPerformance(
  features: ExtractedFeature[],
  setup: CurrentSetup,
): { score: number; explanation: string; evidence: number } {
  const sessionFeatures = features.filter(f => f.session === setup.session);
  const n = sessionFeatures.length;
  if (n < 3) {
    return { score: 45, explanation: `Only ${n} trades in ${setup.session} session`, evidence: n };
  }
  const wins    = sessionFeatures.filter(f => f.outcome === "win").length;
  const winRate = wins / n;
  const score   = clamp(winRate * 100, 0, 100);
  return {
    score,
    explanation: `${setup.session} session: ${(winRate*100).toFixed(1)}% win rate (n=${n})`,
    evidence: n,
  };
}

function scorePairPerformance(
  features: ExtractedFeature[],
  setup: CurrentSetup,
): { score: number; explanation: string; evidence: number } {
  const pairFeatures = features.filter(f => f.pair === setup.pair);
  const n = pairFeatures.length;
  if (n < 3) {
    return { score: 45, explanation: `Only ${n} ${setup.pair} trades`, evidence: n };
  }
  const wins    = pairFeatures.filter(f => f.outcome === "win").length;
  const winRate = wins / n;
  const score   = clamp(winRate * 100, 0, 100);
  return {
    score,
    explanation: `${setup.pair}: ${(winRate*100).toFixed(1)}% historical win rate (n=${n})`,
    evidence: n,
  };
}

function scoreZoneQuality(setup: CurrentSetup): { score: number; explanation: string } {
  const best = Math.max(setup.supplyQuality, setup.demandQuality);
  const score = clamp(best, 0, 100);
  const tier  = best >= 70 ? "strong" : best >= 50 ? "moderate" : "weak";
  return {
    score,
    explanation: `Zone quality: ${best.toFixed(1)}/100 (${tier}) — supply:${setup.supplyQuality.toFixed(0)}, demand:${setup.demandQuality.toFixed(0)}`,
  };
}

function scoreLiquidityQuality(setup: CurrentSetup): { score: number; explanation: string } {
  const score = clamp(setup.liquidityScore, 0, 100);
  const tier  = score >= 70 ? "strong sweep" : score >= 50 ? "moderate sweep" : "weak sweep";
  return {
    score,
    explanation: `Liquidity: ${score.toFixed(1)}/100 (${tier})`,
  };
}

function scoreAmdQuality(setup: CurrentSetup): { score: number; explanation: string } {
  const score = clamp(setup.amdScore, 0, 100);
  const tier  = score >= 70 ? "clear AMD" : score >= 50 ? "moderate AMD" : "unclear AMD";
  return {
    score,
    explanation: `AMD pattern: ${score.toFixed(1)}/100 (${tier})`,
  };
}

function scoreConfirmationQuality(setup: CurrentSetup): { score: number; explanation: string } {
  const score = clamp(setup.confirmationQuality, 0, 100);
  const tier  = score >= 70 ? "strong confirmation" : score >= 50 ? "moderate confirmation" : "weak confirmation";
  return {
    score,
    explanation: `Confirmation: ${score.toFixed(1)}/100 (${tier})`,
  };
}

function scoreVolatility(
  features: ExtractedFeature[],
  setup: CurrentSetup,
): { score: number; explanation: string; evidence: number } {
  // Check historical performance in this volatility regime
  const volFeatures = features.filter(f => f.volatility === setup.volatility);
  const n = volFeatures.length;
  if (n < 3) {
    // Fallback: score based on volatility type — medium is default favorable
    const base = setup.volatility === "medium" ? 65 : setup.volatility === "low" ? 75 : 45;
    return { score: base, explanation: `${setup.volatility} volatility (limited historical data)`, evidence: n };
  }
  const wins    = volFeatures.filter(f => f.outcome === "win").length;
  const winRate = wins / n;
  return {
    score: clamp(winRate * 100, 0, 100),
    explanation: `${setup.volatility} volatility: ${(winRate*100).toFixed(1)}% win rate (n=${n})`,
    evidence: n,
  };
}

function scoreSpread(setup: CurrentSetup): { score: number; explanation: string } {
  // Lower spread = higher score; 0 pips = 100, 3+ pips = 0
  const score = clamp((1 - setup.spreadPips / 3) * 100, 0, 100);
  const tier  = score >= 70 ? "favorable" : score >= 40 ? "moderate" : "wide";
  return {
    score,
    explanation: `Spread: ${setup.spreadPips.toFixed(2)} pips (${tier}) — lower is better`,
  };
}

function scoreDataQuality(features: ExtractedFeature[]): { score: number; explanation: string } {
  const n = features.length;
  if (n === 0) return { score: 0, explanation: "No historical data" };
  // Quality: enough data for statistical conclusions?
  const score = clamp((n / 50) * 100, 0, 100);
  const tier  = n >= 50 ? "excellent" : n >= 20 ? "good" : n >= 10 ? "moderate" : "sparse";
  return {
    score,
    explanation: `${n} total historical trades — data quality: ${tier}`,
  };
}

// ─── Main TIS calculation ─────────────────────────────────────────────────────

export interface TisResult {
  tisScore: number;
  components: TisComponent[];
  componentMap: Record<TisComponentKey, number>;
}

export function computeTis(
  setup: CurrentSetup,
  features: ExtractedFeature[],
  match: MatchResult,
): TisResult {
  // Score each component
  const patternPerf   = scorePatternPerformance(features, setup);
  const histWinRate   = scoreHistoricalWinRate(match);
  const sampleSz      = scoreSampleSize(match.evidenceCount);
  const featureImp    = scoreFeatureImportance(setup);
  const confidence    = scoreConfidence(features, setup);
  const regimeMatch   = scoreMarketRegimeMatch(features, setup);
  const sessionPerf   = scoreSessionPerformance(features, setup);
  const pairPerf      = scorePairPerformance(features, setup);
  const zoneQ         = scoreZoneQuality(setup);
  const liquidityQ    = scoreLiquidityQuality(setup);
  const amdQ          = scoreAmdQuality(setup);
  const confirmQ      = scoreConfirmationQuality(setup);
  const volScore      = scoreVolatility(features, setup);
  const spreadScore   = scoreSpread(setup);
  const dataQ         = scoreDataQuality(features);

  const rawScores: Record<TisComponentKey, number> = {
    patternPerformance:  patternPerf.score,
    historicalWinRate:   histWinRate.score,
    sampleSize:          sampleSz.score,
    featureImportance:   featureImp.score,
    confidenceScore:     confidence.score,
    marketRegimeMatch:   regimeMatch.score,
    sessionPerformance:  sessionPerf.score,
    pairPerformance:     pairPerf.score,
    zoneQuality:         zoneQ.score,
    liquidityQuality:    liquidityQ.score,
    amdQuality:          amdQ.score,
    confirmationQuality: confirmQ.score,
    volatility:          volScore.score,
    spread:              spreadScore.score,
    dataQuality:         dataQ.score,
  };

  const explanations: Record<TisComponentKey, string> = {
    patternPerformance:  patternPerf.explanation,
    historicalWinRate:   histWinRate.explanation,
    sampleSize:          sampleSz.explanation,
    featureImportance:   featureImp.explanation,
    confidenceScore:     confidence.explanation,
    marketRegimeMatch:   regimeMatch.explanation,
    sessionPerformance:  sessionPerf.explanation,
    pairPerformance:     pairPerf.explanation,
    zoneQuality:         zoneQ.explanation,
    liquidityQuality:    liquidityQ.explanation,
    amdQuality:          amdQ.explanation,
    confirmationQuality: confirmQ.explanation,
    volatility:          volScore.explanation,
    spread:              spreadScore.explanation,
    dataQuality:         dataQ.explanation,
  };

  const evidenceCounts: Partial<Record<TisComponentKey, number>> = {
    patternPerformance: patternPerf.evidence,
    historicalWinRate:  histWinRate.evidence,
    confidenceScore:    confidence.evidence,
    marketRegimeMatch:  regimeMatch.evidence,
    sessionPerformance: sessionPerf.evidence,
    pairPerformance:    pairPerf.evidence,
    volatility:         volScore.evidence,
  };

  // Build component list
  const components: TisComponent[] = (Object.keys(TIS_WEIGHTS) as TisComponentKey[]).map(key => {
    const score  = rawScores[key];
    const weight = TIS_WEIGHTS[key];
    return {
      name: formatComponentName(key),
      key,
      score,
      weight,
      weightedScore: score * weight,
      explanation: explain(key, score, explanations[key]),
      isInsufficient: (evidenceCounts[key] ?? 10) < 3,
      evidenceCount: evidenceCounts[key] ?? features.length,
    };
  });

  // Weighted average TIS
  const tisScore = clamp(
    components.reduce((s, c) => s + c.weightedScore, 0),
    0,
    100,
  );

  return {
    tisScore: Math.round(tisScore * 10) / 10,
    components,
    componentMap: rawScores,
  };
}

function formatComponentName(key: TisComponentKey): string {
  const names: Record<TisComponentKey, string> = {
    patternPerformance:  "Pattern Performance",
    historicalWinRate:   "Historical Win Rate",
    sampleSize:          "Sample Size",
    featureImportance:   "Feature Importance",
    confidenceScore:     "Confidence Score",
    marketRegimeMatch:   "Market Regime Match",
    sessionPerformance:  "Session Performance",
    pairPerformance:     "Pair Performance",
    zoneQuality:         "Zone Quality",
    liquidityQuality:    "Liquidity Quality",
    amdQuality:          "AMD Quality",
    confirmationQuality: "Confirmation Quality",
    volatility:          "Volatility",
    spread:              "Spread",
    dataQuality:         "Data Quality",
  };
  return names[key];
}
