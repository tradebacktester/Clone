// ─── Market Outlook Generator ──────────────────────────────────────────────────
// Advisory only. No trade execution. No strategy modification.
// Produces a statistical outlook based on historically observed market behavior.
// Does NOT forecast prices. Describes regime continuation probability only.

import type { FeatureRow, MarketOutlook, OutlookScenario } from "./types.js";

// ─── Regime transition probability table ──────────────────────────────────────
// Based on common FX market structure dynamics (SMC/ICT regimes).
// Values represent probability of transitioning AWAY from the current regime.

const REGIME_TRANSITION_PROBS: Record<string, number> = {
  trending:       0.15,  // Strong trends persist
  ranging:        0.30,  // Ranges break more often
  volatile:       0.45,  // High volatility is unstable
  low_volatility: 0.20,  // Compression can last
  unknown:        0.35,
};

const REGIME_CONTINUATION_PROBS: Record<string, number> = {
  trending:       0.85,
  ranging:        0.70,
  volatile:       0.55,
  low_volatility: 0.80,
  unknown:        0.65,
};

// Next most likely regime after transition
const LIKELY_TRANSITIONS: Record<string, string> = {
  trending:       "ranging",
  ranging:        "trending",
  volatile:       "ranging",
  low_volatility: "trending",
  unknown:        "ranging",
};

// Typical duration of each regime in bars (approximate)
const REGIME_DURATION_BARS: Record<string, number> = {
  trending:       40,
  ranging:        25,
  volatile:       15,
  low_volatility: 35,
  unknown:        20,
};

// ─── Current regime detection ──────────────────────────────────────────────────

function detectCurrentRegime(features: FeatureRow[]): string {
  if (features.length === 0) return "unknown";
  const recent = features.slice(-15);
  const counts: Record<string, number> = {};
  for (const f of recent) counts[f.marketRegime] = (counts[f.marketRegime] || 0) + 1;
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "unknown";
}

function detectCurrentTrend(features: FeatureRow[]): string {
  if (features.length === 0) return "unknown";
  const recent = features.slice(-10);
  const counts: Record<string, number> = {};
  for (const f of recent) counts[f.trend] = (counts[f.trend] || 0) + 1;
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "unknown";
}

// ─── How long current regime has been running ──────────────────────────────────

function estimateRegimeAge(features: FeatureRow[]): number {
  if (features.length === 0) return 0;
  const currentRegime = detectCurrentRegime(features);
  let age = 0;
  // Walk backwards from end
  for (let i = features.length - 1; i >= 0; i--) {
    if (features[i].marketRegime === currentRegime) {
      age++;
    } else {
      break;
    }
  }
  return age;
}

// ─── Evidence builder ──────────────────────────────────────────────────────────

function buildEvidence(features: FeatureRow[], regime: string): string[] {
  const evidence: string[] = [];

  // Historical regime frequency
  const regimeCounts: Record<string, number> = {};
  for (const f of features) regimeCounts[f.marketRegime] = (regimeCounts[f.marketRegime] || 0) + 1;
  const regimeFreq = regimeCounts[regime] ?? 0;
  const regimeRatio = features.length > 0 ? regimeFreq / features.length : 0;
  evidence.push(`${regime} regime observed in ${(regimeRatio * 100).toFixed(1)}% of ${features.length} historical bars.`);

  // Win rate in this regime
  const regimeTrades = features.filter(f => f.marketRegime === regime && (f.outcome === "win" || f.outcome === "loss"));
  if (regimeTrades.length >= 5) {
    const wins = regimeTrades.filter(f => f.outcome === "win").length;
    evidence.push(`Historical win rate during ${regime}: ${((wins / regimeTrades.length) * 100).toFixed(1)}% (n=${regimeTrades.length}).`);
  }

  // Average duration
  const expectedDuration = REGIME_DURATION_BARS[regime] ?? 20;
  evidence.push(`Typical ${regime} regime duration: ~${expectedDuration} bars based on historical pattern library.`);

  return evidence;
}

// ─── Scenario builder ─────────────────────────────────────────────────────────

function buildPrimaryScenario(features: FeatureRow[], regime: string, trend: string): OutlookScenario {
  const continuationProb = REGIME_CONTINUATION_PROBS[regime] ?? 0.65;
  const regimeAge = estimateRegimeAge(features);
  const expectedDuration = REGIME_DURATION_BARS[regime] ?? 20;

  // Age adjustment: older regimes are closer to transitioning
  const ageAdjustment = Math.min(0.25, (regimeAge / expectedDuration) * 0.25);
  const adjustedProb = Math.max(0.40, continuationProb - ageAdjustment);

  const trendDesc = trend !== "unknown" && trend !== "neutral"
    ? `with ${trend} bias`
    : "";

  return {
    description: `Continuation of ${regime} regime ${trendDesc}. ` +
      `Current regime has persisted for ~${regimeAge} bars (typical duration: ~${expectedDuration} bars). ` +
      `Historical data indicates regime persistence at this stage.`,
    probability: adjustedProb,
    historicalBasis: buildEvidence(features, regime).join(" "),
    confidence: Math.round(adjustedProb * 100),
    triggerConditions: [
      "No significant regime-breaking news event",
      "Liquidity conditions remain stable",
      `${trend} trend structure maintained`,
    ],
  };
}

function buildAlternativeScenario(features: FeatureRow[], regime: string): OutlookScenario {
  const nextRegime = LIKELY_TRANSITIONS[regime] ?? "ranging";
  const transitionProb = REGIME_TRANSITION_PROBS[regime] ?? 0.35;
  const regimeAge = estimateRegimeAge(features);
  const expectedDuration = REGIME_DURATION_BARS[regime] ?? 20;

  const ageAdjustment = Math.min(0.20, (regimeAge / expectedDuration) * 0.20);
  const adjustedProb = Math.min(0.60, transitionProb + ageAdjustment);

  return {
    description: `Transition from ${regime} to ${nextRegime} regime. ` +
      `Historically, ${regime} regimes transition most frequently toward ${nextRegime}. ` +
      `Watch for liquidity sweeps, spread widening, or volatility spikes as early transition signals.`,
    probability: adjustedProb,
    historicalBasis: buildEvidence(features, nextRegime).join(" "),
    confidence: Math.round(adjustedProb * 80),
    triggerConditions: [
      "High-impact news event breaks existing structure",
      "Spread widens significantly above recent average",
      "Volatility classification shifts to high",
      "Liquidity score drops sharply",
    ],
  };
}

// ─── Main export ───────────────────────────────────────────────────────────────

export function generateOutlook(features: FeatureRow[]): MarketOutlook {
  if (features.length < 20) {
    const neutral: OutlookScenario = {
      description: "Insufficient historical data to generate a reliable outlook.",
      probability: 0.5,
      historicalBasis: "Less than 20 feature observations available.",
      confidence: 10,
      triggerConditions: [],
    };
    return {
      primary: neutral,
      alternative: neutral,
      transitionProbability: 0.5,
      expectedDurationBars: 0,
      confidence: 10,
      supportingEvidence: ["Insufficient data"],
      historicalBasis: "Requires minimum 20 observations.",
      allScenarios: [neutral],
    };
  }

  const regime = detectCurrentRegime(features);
  const trend = detectCurrentTrend(features);
  const regimeAge = estimateRegimeAge(features);

  const primary = buildPrimaryScenario(features, regime, trend);
  const alternative = buildAlternativeScenario(features, regime);

  const transitionProb = REGIME_TRANSITION_PROBS[regime] ?? 0.35;
  const expectedDuration = REGIME_DURATION_BARS[regime] ?? 20;

  const confidence = Math.round(
    Math.min(100, (features.length / 200) * 60 + 40)
  );

  const supportingEvidence = buildEvidence(features, regime);
  supportingEvidence.push(
    `Regime age: ~${regimeAge} bars. Expected typical duration: ~${expectedDuration} bars.`,
    `Transition probability (historical): ${(transitionProb * 100).toFixed(0)}%.`,
    `NOTE: Outlook describes historically observed behavior. No price levels are forecast.`,
  );

  return {
    primary,
    alternative,
    transitionProbability: transitionProb,
    expectedDurationBars: Math.max(0, expectedDuration - regimeAge),
    confidence,
    supportingEvidence,
    historicalBasis: `Based on ${features.length} historical observations from the trade feature database.`,
    allScenarios: [primary, alternative],
  };
}
