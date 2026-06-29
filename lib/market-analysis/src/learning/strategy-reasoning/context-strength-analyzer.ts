// ─── Context Strength Analyzer ───────────────────────────────────────────────
// Evaluates session, pair, opportunity score, health score, and historical
// context strength to produce a Context Strength Score (0–100).
// Advisory only.

import { clamp } from "../learning-validation/data-validator.js";
import type { ExtractedFeature } from "../learning-core/types.js";
import type { StrategySetup, ContextStrengthResult } from "./types.js";
import {
  SESSION_SCORES,
  CONTEXT_STRENGTH_WEIGHTS,
  getPairScore,
} from "./types.js";

// ─── Individual context scorers ───────────────────────────────────────────────

function scoreSession(session: string): { score: number; detail: string } {
  const score = SESSION_SCORES[session?.toLowerCase()] ?? 55;
  let label: string;
  if (score >= 90) label = "premium session (highest liquidity)";
  else if (score >= 80) label = "high-activity session";
  else if (score >= 60) label = "moderate activity";
  else label = "low-activity session";
  return { score, detail: `Session: ${session} — ${label} (${score}/100)` };
}

function scorePair(pair: string): { score: number; detail: string } {
  const score = getPairScore(pair);
  let tier: string;
  if (score >= 90) tier = "major pair — highest liquidity";
  else if (score >= 80) tier = "major pair — good liquidity";
  else if (score >= 70) tier = "cross pair — adequate liquidity";
  else tier = "minor/exotic pair";
  return { score, detail: `Pair: ${pair} — ${tier} (${score}/100)` };
}

function scoreOpportunity(opportunityScore?: number): { score: number; detail: string } {
  if (opportunityScore == null) {
    return { score: 60, detail: "Opportunity score: no data — defaulting to neutral (60)" };
  }
  const score = clamp(opportunityScore, 0, 100);
  let level: string;
  if (score >= 75) level = "high opportunity window";
  else if (score >= 55) level = "moderate opportunity";
  else level = "low opportunity environment";
  return { score, detail: `Market opportunity: ${level} (${score.toFixed(1)}/100)` };
}

function scoreHealth(healthScore?: number): { score: number; detail: string } {
  if (healthScore == null) {
    return { score: 65, detail: "Market health: no data — defaulting to neutral (65)" };
  }
  const score = clamp(healthScore, 0, 100);
  let level: string;
  if (score >= 75) level = "healthy market conditions";
  else if (score >= 55) level = "acceptable conditions";
  else level = "deteriorating conditions";
  return { score, detail: `Market health: ${level} (${score.toFixed(1)}/100)` };
}

function scoreHistoricalContext(
  setup: StrategySetup,
  features: ExtractedFeature[],
): { score: number; detail: string } {
  // Look at same session + regime win rate from all history (broader than similarity search)
  const relevant = features.filter(
    f => f.session === setup.session && f.marketRegime === setup.regime,
  );
  const n    = relevant.length;
  if (n < 3) {
    return {
      score: 50,
      detail: `Historical context: insufficient data for ${setup.session}/${setup.regime} (${n} trades)`,
    };
  }
  const wins    = relevant.filter(f => f.outcome === "win").length;
  const winRate = wins / n;
  const score   = clamp(winRate * 100, 0, 100);
  return {
    score,
    detail: `Historical context: ${(winRate * 100).toFixed(1)}% win rate in ${setup.session}/${setup.regime} (n=${n})`,
  };
}

// ─── Composite context strength score ────────────────────────────────────────

export function analyzeContextStrength(
  setup: StrategySetup,
  features: ExtractedFeature[],
): ContextStrengthResult {
  const session      = scoreSession(setup.session);
  const pair         = scorePair(setup.pair);
  const opportunity  = scoreOpportunity(setup.opportunityScore);
  const health       = scoreHealth(setup.marketHealthScore);
  const historical   = scoreHistoricalContext(setup, features);

  const contextStrengthScore = clamp(
    session.score     * CONTEXT_STRENGTH_WEIGHTS.session     +
    pair.score        * CONTEXT_STRENGTH_WEIGHTS.pair        +
    opportunity.score * CONTEXT_STRENGTH_WEIGHTS.opportunity +
    health.score      * CONTEXT_STRENGTH_WEIGHTS.health      +
    historical.score  * CONTEXT_STRENGTH_WEIGHTS.historical,
    0, 100,
  );

  return {
    sessionScore:          session.score,
    pairScore:             pair.score,
    opportunityScore:      opportunity.score,
    healthScore:           health.score,
    historicalContextScore: historical.score,
    contextStrengthScore,
    explanations: [
      session.detail,
      pair.detail,
      opportunity.detail,
      health.detail,
      historical.detail,
      `Context Strength Score: ${contextStrengthScore.toFixed(1)}/100`,
    ],
  };
}
